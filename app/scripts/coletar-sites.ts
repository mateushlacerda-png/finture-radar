/**
 * Lê a página inicial do site confirmado de cada empresa e guarda título, descrição, LinkedIn e Instagram
 * (só perfis de empresa; perfil pessoal /in/ é ignorado). Nada é buscado no LinkedIn: o link vem do
 * próprio site da empresa.
 *
 *   npx tsx scripts/coletar-sites.ts --exportar   lista os sites do banco em .data/sites/coleta-fila.json (servidor parado)
 *   npx tsx scripts/coletar-sites.ts --coletar    baixa e extrai, grava .data/sites/coleta.jsonl (retoma; pode rodar com o servidor no ar)
 *   npx tsx scripts/coletar-sites.ts --aplicar    grava no banco (servidor parado)
 * --exportar --entrou-em 2026-11 limita às empresas novas daquela competência (atualização mensal).
 */
import fs from "node:fs";
import path from "node:path";
import { extractMeta, extractSocial, fetchPage } from "../src/lib/site-extract";
import { getScriptDb } from "./script-db";

const args = process.argv.slice(2);
const i = args.indexOf("--concorrencia");
const CONCORRENCIA = i >= 0 ? Number(args[i + 1]) : 24;
const DIR = path.resolve(__dirname, "..", ".data", "sites");
const FILA = path.join(DIR, "coleta-fila.json");
const SAIDA = path.join(DIR, "coleta.jsonl");

type Coleta = { site: string; titulo: string | null; descricao: string | null; linkedin: string | null; instagram: string | null; ok: boolean; em: string };

async function exportar() {
  const { db, schema, close } = await getScriptDb();
  const { companies } = schema;
  const ENTROU_EM = args.includes("--entrou-em") ? args[args.indexOf("--entrou-em") + 1] : null;
  const rows = await db
    .select({ id: companies.id, site: companies.site })
    .from(companies)
    .where(ENTROU_EM ? schema.sql`${companies.site} is not null and ${companies.entrouEm} = ${ENTROU_EM}` : schema.sql`${companies.site} is not null`);
  await close();
  const porSite: Record<string, number[]> = {};
  for (const r of rows) (porSite[r.site!] ??= []).push(r.id);
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILA, JSON.stringify(porSite));
  console.log(`${Object.keys(porSite).length} sites (${rows.length} empresas)`);
}

async function coletar() {
  const porSite: Record<string, number[]> = JSON.parse(fs.readFileSync(FILA, "utf8"));
  const feitos = new Set<string>();
  if (fs.existsSync(SAIDA)) for (const l of fs.readFileSync(SAIDA, "utf8").split("\n")) if (l) feitos.add(JSON.parse(l).site);
  const fila = Object.keys(porSite).filter((s) => !feitos.has(s));
  console.log(`${fila.length} sites a coletar (${feitos.size} já coletados)`);
  const out = fs.createWriteStream(SAIDA, { flags: "a" });
  let n = 0;
  let li = 0;
  let desc = 0;
  async function trabalhador() {
    for (;;) {
      const site = fila.shift();
      if (!site) return;
      const p = await fetchPage(site);
      const c: Coleta = p
        ? { site, ...extractMeta(p.html), ...extractSocial(p.html), ok: true, em: new Date().toISOString() }
        : { site, titulo: null, descricao: null, linkedin: null, instagram: null, ok: false, em: new Date().toISOString() };
      if (c.linkedin) li++;
      if (c.descricao) desc++;
      out.write(JSON.stringify(c) + "\n");
      if (++n % 500 === 0) console.log(`${n} sites lidos; ${li} com LinkedIn, ${desc} com descrição`);
    }
  }
  await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador));
  await new Promise((r) => out.end(r));
  console.log(`FIM: ${n} sites lidos; ${li} com LinkedIn, ${desc} com descrição`);
}

async function aplicar() {
  const porSite: Record<string, number[]> = JSON.parse(fs.readFileSync(FILA, "utf8"));
  const coletas = fs.readFileSync(SAIDA, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Coleta);
  const { db, schema, close } = await getScriptDb();
  const { companies } = schema;
  let empresas = 0;
  for (const c of coletas) {
    const ids = porSite[c.site];
    if (!ids || !c.ok) continue;
    await db
      .update(companies)
      .set({ siteTitulo: c.titulo, siteDescricao: c.descricao, linkedin: c.linkedin, instagram: c.instagram, siteColetadoEm: new Date(c.em), updatedAt: new Date() })
      .where(schema.sql`${companies.id} in ${ids}`);
    empresas += ids.length;
  }
  await close();
  const comLinkedin = coletas.filter((c) => c.linkedin).length;
  console.log(`Aplicado em ${empresas} empresas; ${comLinkedin} sites com LinkedIn da empresa.`);
}

const etapa = args.includes("--exportar") ? exportar : args.includes("--coletar") ? coletar : args.includes("--aplicar") ? aplicar : null;
if (!etapa) {
  console.error("Use --exportar, --coletar ou --aplicar (veja o cabeçalho).");
  process.exit(1);
}
etapa().catch((e) => {
  console.error(e);
  process.exit(1);
});
