/**
 * Descobre o site da empresa a partir do domínio do e-mail cadastral (Receita) e confirma que ele responde.
 * Sem busca no Google: raspagem automática viola os termos de uso e é bloqueada. Para busca, usar API
 * oficial (Google Custom Search ou Brave Search) com chave própria; ver src/lib/integrations (Enricher).
 *
 * Regras (para não atribuir site errado):
 * - ignora webmail (gmail, hotmail, uol, bol…);
 * - ignora domínio que aparece no e-mail de mais de MAX_COMPARTILHADO empresas: quase sempre é o
 *   escritório de contabilidade que fez o cadastro, não a empresa;
 * - aceita só resposta HTML com status < 400 em https://www.<domínio> ou https://<domínio>;
 * - recusa página de domínio estacionado, à venda ou padrão de hospedagem.
 * Sem site confirmado, o campo fica vazio e a interface mostra "Não consta".
 *
 * Três etapas, para o teste (lento, rede) não travar o banco (PGlite é processo único):
 *   npx tsx scripts/enriquecer-sites.ts --exportar   lê o banco e grava .data/sites/candidatos.json   (servidor parado)
 *   npx tsx scripts/enriquecer-sites.ts --testar     testa os domínios e grava .data/sites/resultados.jsonl
 *                                                    (pode rodar com o servidor no ar; retoma de onde parou)
 *   npx tsx scripts/enriquecer-sites.ts --aplicar    grava os sites confirmados no banco          (servidor parado)
 * Opção de --testar: --concorrencia 24. Acima disso o DNS do Windows satura e quase tudo vira falha.
 * Opção de --exportar: --entrou-em 2026-11 limita os candidatos às empresas novas daquela competência
 * (usado pela atualização mensal); a contagem de domínio compartilhado continua sobre a base inteira.
 */
import fs from "node:fs";
import path from "node:path";
import { getScriptDb } from "./script-db";

const args = process.argv.slice(2);
const num = (k: string, d: number) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const CONCORRENCIA = num("concorrencia", 24);
const ENTROU_EM = args.includes("--entrou-em") ? args[args.indexOf("--entrou-em") + 1] : null;
const MAX_COMPARTILHADO = 3;
const TIMEOUT_MS = 10000;
const DIR = path.resolve(__dirname, "..", ".data", "sites");
const CANDIDATOS = path.join(DIR, "candidatos.json");
const RESULTADOS = path.join(DIR, "resultados.jsonl");

const WEBMAIL = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.br", "outlook.com", "outlook.com.br", "live.com", "msn.com",
  "yahoo.com", "yahoo.com.br", "ymail.com", "rocketmail.com", "icloud.com", "me.com", "mac.com", "aol.com", "protonmail.com",
  "proton.me", "bol.com.br", "uol.com.br", "terra.com.br", "ig.com.br", "globo.com", "globomail.com", "r7.com", "zipmail.com.br",
  "oi.com.br", "click21.com.br", "superig.com.br", "pop.com.br", "itelefonica.com.br", "veloxmail.com.br", "brturbo.com.br",
  "gmx.com", "zoho.com", "mail.com", "yandex.com", "email.com", "hotmail.es", "live.com.br",
]);

const ESTACIONADO = /(domain (is )?for sale|este dom[ií]nio (est[aá] )?[àa] venda|comprar este dom[ií]nio|dom[ií]nio dispon[ií]vel|parked (domain|free)|domain parking|sedoparking|hugedomains|dan\.com|index of \/|default web site page|it works!|hostgator|site em constru[cç][aã]o|website coming soon|account suspended|conta suspensa)/i;

const TLS = /CERT|SSL|TLS|LEAF|ISSUER|SELF_SIGNED|ECONNREFUSED/;

type Tentativa = { site: string | null; falha?: string };

async function tentar(url: string): Promise<Tentativa> {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "FintureRadar/1.0 (verificacao de site cadastral)" },
      });
      if (r.status >= 400) return { site: null, falha: `http_${r.status}` };
      if (!(r.headers.get("content-type") ?? "").includes("text/html")) return { site: null, falha: "nao_html" };
      const corpo = (await r.text()).slice(0, 60_000);
      if (corpo.length < 200 || ESTACIONADO.test(corpo)) return { site: null, falha: "estacionado" };
      return { site: new URL(r.url).origin };
    } catch (e) {
      const code = (e as { cause?: { code?: string } }).cause?.code ?? (e as Error).name;
      // DNS inexistente não melhora com nova tentativa; timeout e reset de conexão às vezes sim.
      if (code === "ENOTFOUND" || i === 1) return { site: null, falha: code };
    }
  }
  return { site: null, falha: "desconhecida" };
}

const dominio = (e: string) => e.split("@")[1]?.trim().toLowerCase().replace(/\.$/, "") ?? "";

async function exportar() {
  const { db, schema, close } = await getScriptDb();
  const { companies } = schema;
  const rows = await db
    .select({ id: companies.id, email: companies.email, site: companies.site, entrouEm: companies.entrouEm })
    .from(companies)
    .where(schema.sql`${companies.email} is not null and ${companies.source} = 'receita'`);
  await close();
  const freq = new Map<string, number>();
  for (const r of rows) freq.set(dominio(r.email!), (freq.get(dominio(r.email!)) ?? 0) + 1);
  const candidatos: Record<string, number[]> = {};
  const motivo = { webmail: 0, compartilhado: 0, invalido: 0, jaTemSite: 0 };
  for (const r of rows) {
    const d = dominio(r.email!);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) { motivo.invalido++; continue; }
    if (WEBMAIL.has(d)) { motivo.webmail++; continue; }
    if ((freq.get(d) ?? 0) > MAX_COMPARTILHADO) { motivo.compartilhado++; continue; }
    if (r.site) { motivo.jaTemSite++; continue; }
    if (ENTROU_EM && r.entrouEm !== ENTROU_EM) continue;
    (candidatos[d] ??= []).push(r.id);
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(CANDIDATOS, JSON.stringify(candidatos));
  console.log(JSON.stringify({ comEmail: rows.length, ...motivo, dominios: Object.keys(candidatos).length }));
}

async function testar() {
  const candidatos: Record<string, number[]> = JSON.parse(fs.readFileSync(CANDIDATOS, "utf8"));
  const feitos = new Set<string>();
  // Retoma: pula o que já foi testado, menos falhas de TLS, que agora têm a tentativa sem TLS.
  if (fs.existsSync(RESULTADOS))
    for (const l of fs.readFileSync(RESULTADOS, "utf8").split("\n")) {
      if (!l) continue;
      const r = JSON.parse(l);
      if (r.site || !TLS.test(r.falha ?? "")) feitos.add(r.d);
    }
  const fila = Object.keys(candidatos).filter((d) => !feitos.has(d));
  console.log(`${fila.length} domínios a testar (${feitos.size} já testados)`);
  const out = fs.createWriteStream(RESULTADOS, { flags: "a" });
  const falhas: Record<string, number> = {};
  let n = 0;
  let achados = 0;
  async function trabalhador() {
    for (;;) {
      const d = fila.shift();
      if (!d) return;
      let t = await tentar(`https://www.${d}`);
      if (!t.site) {
        const t2 = await tentar(`https://${d}`);
        if (t2.site) t = t2;
      }
      // Site que existe mas tem certificado vencido ou inválido: tenta sem TLS. O site responde, então conta.
      if (!t.site && TLS.test(t.falha ?? "")) {
        const t3 = await tentar(`http://www.${d}`);
        if (t3.site) t = t3;
      }
      if (t.site) achados++;
      else falhas[t.falha ?? "?"] = (falhas[t.falha ?? "?"] ?? 0) + 1;
      out.write(JSON.stringify({ d, site: t.site, falha: t.falha ?? null, em: new Date().toISOString() }) + "\n");
      if (++n % 500 === 0) console.log(`${n} domínios testados, ${achados} sites confirmados; falhas ${JSON.stringify(falhas)}`);
    }
  }
  await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador));
  await new Promise((r) => out.end(r));
  console.log(`FIM: ${n} domínios testados, ${achados} sites confirmados; falhas ${JSON.stringify(falhas)}`);
}

async function aplicar() {
  const candidatos: Record<string, number[]> = JSON.parse(fs.readFileSync(CANDIDATOS, "utf8"));
  const resultados = fs
    .readFileSync(RESULTADOS, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { d: string; site: string | null; em: string });
  const { db, schema, close } = await getScriptDb();
  const { companies } = schema;
  let empresas = 0;
  for (const r of resultados) {
    if (!r.site || !candidatos[r.d]) continue;
    const quando = new Date(r.em).toLocaleDateString("pt-BR");
    await db
      .update(companies)
      .set({ site: r.site, siteFonte: `Domínio do e-mail cadastral (${r.d}); site respondeu em ${quando}`, updatedAt: new Date() })
      .where(schema.sql`${companies.id} in ${candidatos[r.d]}`);
    empresas += candidatos[r.d].length;
  }
  await close();
  console.log(`Aplicado: ${resultados.filter((r) => r.site).length} sites em ${empresas} empresas.`);
}

const etapa = args.includes("--exportar") ? exportar : args.includes("--testar") ? testar : args.includes("--aplicar") ? aplicar : null;
if (!etapa) {
  console.error("Use --exportar, --testar ou --aplicar (veja o cabeçalho).");
  process.exit(1);
}
etapa().catch((e) => {
  console.error(e);
  process.exit(1);
});
