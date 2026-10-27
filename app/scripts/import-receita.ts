/**
 * Ingestão dos Dados Abertos do CNPJ (Receita Federal) no Finture Radar.
 *
 * Uso:
 *   tsx scripts/import-receita.ts --estab <ESTABELE.csv> --empresas <EMPRESAS.csv>
 *        --centroides <centroides-siafi.csv> [--uf RJ,SP] [--uf-clientes RJ] [--todos-cnaes]
 *        [--competencia 2026-10] [--base <ESTABELE-base.csv>] [--dry-run]
 *
 * - Só estabelecimentos ATIVOS e, por padrão, só CNAEs do catálogo do Radar (src/lib/cnaes.ts).
 * - --uf limita tudo; --uf-clientes limita só as empresas-cliente (CNAE sem perfil de parceiro),
 *   mantendo os parceiros de todas as UFs.
 * - --recorte icp-enxuto (o usado em 2026-10, decidido com o usuário): escritórios de investimento,
 *   gestoras e auxiliares financeiros no Brasil; imobiliárias só no RJ; empresas-cliente só no RJ e
 *   só de porte EPP ou médio/grande. Sedes no exterior (UF "EX") ficam fora em qualquer recorte.
 * - Empresas: carrega só o arquivo já filtrado (scripts/receita-baixar-filtrar.py). Estabelecimentos
 *   são lidos em streaming e gravados em lotes, para caber em pouca memória.
 * - Coordenada = sede do município, casada pelo código SIAFI/TOM que a Receita usa
 *   (arquivo "siafi;nome;uf;lat;lng", gerado de github.com/kelvins/municipios-brasileiros, base IBGE),
 *   com dispersão determinística pequena e geo_precision = "municipio". A ficha avisa que o ponto é aproximado.
 * - Sem --dry-run grava no banco (PGlite em .data/pglite ou DATABASE_URL). Com PGlite, pare o servidor antes.
 * - Dado de sócios (QSA) NÃO é importado: exige base legal definida (docs/LGPD.md).
 * - Atualização mensal: empresa inserida numa competência posterior à carga inicial ganha entrou_em = competência
 *   (o Radar mostra "Nova na base"). --base traz a situação atual de CNPJs que já estão no banco e deixaram de
 *   ser ATIVOS (gerado por receita-baixar-filtrar.py --base-cnpjs); a empresa sai do Radar.
 */
import fs from "node:fs";
import readline from "node:readline";
import { CNAES, CNAES_PARCEIRO } from "../src/lib/cnaes";
import { parseEmpresa, parseEstabelecimento, splitLine, type Empresa } from "./receita-layout";

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (k: string) => args.includes(`--${k}`);

async function* lines(file: string) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: "latin1" }), crlfDelay: Infinity });
  for await (const l of rl) if (l.trim()) yield splitLine(l);
}

function hashJitter(cnpj: string): [number, number] {
  let h = 2166136261;
  for (const c of cnpj) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const a = ((h >>> 0) % 10000) / 10000;
  const b = (((h >>> 0) / 10000) % 10000) / 10000;
  return [(a - 0.5) * 0.04, (b - 0.5) * 0.04];
}

async function main() {
  const estabFile = arg("estab");
  const empFile = arg("empresas");
  const centFile = arg("centroides");
  if (!estabFile || !empFile || !centFile) {
    console.error("Faltam arquivos. Veja o cabeçalho de scripts/import-receita.ts.");
    process.exit(1);
  }
  const csvUf = (k: string) => arg(k)?.split(",").map((s) => s.trim().toUpperCase());
  const ufs = csvUf("uf");
  const ufsClientes = csvUf("uf-clientes");
  const cnaes = flag("todos-cnaes") ? null : new Set(CNAES.map((c) => c.code));
  const parceiro = new Set(CNAES_PARCEIRO);
  const competencia = arg("competencia") ?? new Date().toISOString().slice(0, 7);
  const dry = flag("dry-run");

  const centroides = new Map<string, { nome: string; lat: number; lng: number }>();
  for await (const [cod, nome, , lat, lng] of lines(centFile)) centroides.set(cod.padStart(4, "0"), { nome, lat: Number(lat), lng: Number(lng) });

  const recorte = arg("recorte");
  const FINANCEIROS = new Set(["6612-6/05", "6630-4/00", "6619-3/99"]);
  const IMOBILIARIAS = new Set(["6821-8/01", "6822-6/00"]);
  const noRecorte = (e: NonNullable<ReturnType<typeof parseEstabelecimento>>) => {
    if (e.uf === "EX") return false;
    const ehParceiro = !!e.cnaePrincipal && parceiro.has(e.cnaePrincipal);
    if (recorte === "icp-enxuto") {
      const c = e.cnaePrincipal ?? "";
      return FINANCEIROS.has(c) || (IMOBILIARIAS.has(c) && e.uf === "RJ") || (!ehParceiro && !!cnaes?.has(c) && e.uf === "RJ");
    }
    return !(
      (ufs && !ufs.includes(e.uf)) ||
      (cnaes && (!e.cnaePrincipal || !cnaes.has(e.cnaePrincipal))) ||
      (ufsClientes && !ehParceiro && !ufsClientes.includes(e.uf))
    );
  };

  // Passada A: só os CNPJ básicos do recorte, para carregar em memória apenas essas empresas.
  const basicos = new Set<string>();
  for await (const cols of lines(estabFile)) {
    const e = parseEstabelecimento(cols);
    if (e && e.situacao === "ATIVA" && noRecorte(e)) basicos.add(e.cnpjBasico);
  }
  const empresas = new Map<string, Empresa>();
  for await (const cols of lines(empFile)) {
    const p = parseEmpresa(cols);
    if (p && basicos.has(p[0])) empresas.set(p[0], p[1]);
  }
  basicos.clear();
  console.log(`${empresas.size} empresas no recorte`);

  const conn = dry ? null : await (await import("./script-db")).getScriptDb();
  // Só há "empresa nova" depois de uma carga anterior concluída de outra competência.
  const anterior = conn
    ? await conn.db
        .select({ c: conn.schema.ingestionRuns.competencia })
        .from(conn.schema.ingestionRuns)
        .where(conn.schema.sql`${conn.schema.ingestionRuns.source} = 'receita' and ${conn.schema.ingestionRuns.finishedAt} is not null and ${conn.schema.ingestionRuns.competencia} <> ${competencia}`)
        .limit(1)
    : [];
  const entrouEm = anterior.length ? competencia : null;
  const run = conn
    ? (await conn.db.insert(conn.schema.ingestionRuns).values({ source: "receita", competencia }).returning())[0]
    : null;

  const stats = { lidos: 0, inativos: 0, foraDoRecorte: 0, semEmpresa: 0, semGeo: 0, aceitos: 0 };
  const porUf: Record<string, number> = {};
  const amostra: unknown[] = [];
  let lote: Record<string, unknown>[] = [];

  async function gravar() {
    if (!conn || !lote.length) return;
    const { db, schema } = conn;
    await db
      .insert(schema.companies)
      .values(lote as never)
      .onConflictDoUpdate({
        target: schema.companies.cnpj,
        set: {
          razaoSocial: schema.sql`excluded.razao_social`,
          nomeFantasia: schema.sql`excluded.nome_fantasia`,
          situacao: schema.sql`excluded.situacao`,
          situacaoDesde: schema.sql`excluded.situacao_desde`,
          cnaePrincipal: schema.sql`excluded.cnae_principal`,
          cnaesSecundarios: schema.sql`excluded.cnaes_secundarios`,
          porte: schema.sql`excluded.porte`,
          capitalSocial: schema.sql`excluded.capital_social`,
          telefone: schema.sql`excluded.telefone`,
          email: schema.sql`excluded.email`,
          municipio: schema.sql`excluded.municipio`,
          lat: schema.sql`excluded.lat`,
          lng: schema.sql`excluded.lng`,
          sourceRef: schema.sql`excluded.source_ref`,
          updatedAt: new Date(),
        },
      });
    lote = [];
  }

  for await (const cols of lines(estabFile)) {
    stats.lidos++;
    const e = parseEstabelecimento(cols);
    if (!e) continue;
    if (e.situacao !== "ATIVA") { stats.inativos++; continue; }
    if (!noRecorte(e)) { stats.foraDoRecorte++; continue; }
    const emp = empresas.get(e.cnpjBasico);
    if (!emp) { stats.semEmpresa++; continue; }
    // icp-enxuto: cliente só de porte EPP ou médio/grande (o porte vem do arquivo de Empresas).
    if (recorte === "icp-enxuto" && !parceiro.has(e.cnaePrincipal ?? "") && emp.porte !== "EPP" && emp.porte !== "DEMAIS") {
      stats.foraDoRecorte++;
      continue;
    }
    const c = centroides.get(e.municipioCodigo.padStart(4, "0"));
    if (!c) stats.semGeo++;
    const [dy, dx] = hashJitter(e.cnpj);
    stats.aceitos++;
    porUf[e.uf] = (porUf[e.uf] ?? 0) + 1;
    const row = {
      cnpj: e.cnpj,
      razaoSocial: emp.razaoSocial,
      nomeFantasia: e.nomeFantasia,
      situacao: e.situacao,
      situacaoDesde: e.situacaoDesde,
      cnaePrincipal: e.cnaePrincipal,
      cnaesSecundarios: e.cnaesSecundarios,
      naturezaJuridica: emp.naturezaJuridica,
      porte: emp.porte,
      capitalSocial: emp.capitalSocial,
      dataAbertura: e.dataAbertura,
      uf: e.uf,
      municipio: c?.nome ?? e.municipioCodigo,
      bairro: e.bairro,
      cep: e.cep,
      lat: c ? c.lat + dy : null,
      lng: c ? c.lng + dx : null,
      geoPrecision: c ? "municipio" : null,
      telefone: e.telefone,
      email: e.email,
      site: null,
      funcionariosFaixa: null, // não existe em fonte pública por empresa
      funcionariosFonte: null,
      source: "receita" as const,
      sourceRef: `RFB dados abertos CNPJ ${competencia}`,
      entrouEm, // não entra no update do upsert: empresa já existente mantém a competência em que entrou
      isDemo: false,
    };
    if (amostra.length < 2) amostra.push(row);
    if (conn) {
      lote.push(row);
      if (lote.length >= 500) await gravar();
    }
    if (stats.lidos % 100000 === 0) console.log(`${stats.lidos} lidos, ${stats.aceitos} aceitos`);
  }
  await gravar();

  // Empresas que já estão no banco e deixaram de ser ATIVAS (baixada, suspensa, inapta, nula).
  let fechadas = 0;
  const baseFile = arg("base");
  if (baseFile && !fs.existsSync(baseFile)) console.log(`--base ${baseFile} não existe: nenhuma empresa conhecida deixou de ser ativa.`);
  if (baseFile && fs.existsSync(baseFile)) {
    let pendentes: { cnpj: string; situacao: string; desde: string | null }[] = [];
    const aplicar = async () => {
      if (!conn || !pendentes.length) return;
      const { db, schema } = conn;
      const valores = schema.sql.join(pendentes.map((p) => schema.sql`(${p.cnpj}, ${p.situacao}, ${p.desde}::date)`), schema.sql`, `);
      const r = await db.execute(schema.sql`
        update companies c set situacao = v.situacao, situacao_desde = v.desde, updated_at = now()
        from (values ${valores}) as v(cnpj, situacao, desde)
        where c.cnpj = v.cnpj and c.source = 'receita' and c.situacao <> v.situacao
        returning c.id`);
      fechadas += Array.isArray(r) ? r.length : ((r as { rows?: unknown[] }).rows?.length ?? 0);
      pendentes = [];
    };
    for await (const cols of lines(baseFile)) {
      const e = parseEstabelecimento(cols);
      if (!e || e.situacao === "ATIVA") continue;
      if (!conn) { fechadas++; continue; }
      pendentes.push({ cnpj: e.cnpj, situacao: e.situacao, desde: e.situacaoDesde });
      if (pendentes.length >= 500) await aplicar();
    }
    await aplicar();
  }

  let novas = 0;
  if (conn && entrouEm) {
    const [{ n }] = await conn.db
      .select({ n: conn.schema.sql<number>`count(*)::int` })
      .from(conn.schema.companies)
      .where(conn.schema.eq(conn.schema.companies.entrouEm, entrouEm));
    novas = n;
  }

  console.log(JSON.stringify({ competencia, ...stats, novas, fechadas, porUf }, null, 2));
  if (dry) {
    console.log("dry-run: nada gravado. Amostra:", JSON.stringify(amostra, null, 2));
    return;
  }
  const { db, schema, close } = conn!;
  await db
    .update(schema.ingestionRuns)
    .set({ read: stats.lidos, inserted: novas, updated: stats.aceitos - novas + fechadas, rejected: stats.lidos - stats.aceitos, finishedAt: new Date() })
    .where(schema.eq(schema.ingestionRuns.id, run!.id));
  await close();
  console.log(`Gravadas/atualizadas ${stats.aceitos} empresas; ${novas} novas na base; ${fechadas} saíram por situação cadastral.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
