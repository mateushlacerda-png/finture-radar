/**
 * Apoio à atualização mensal (workflow .github/workflows/receita-mensal.yml).
 *
 *   npx tsx scripts/receita-verificar.ts                       diz se há competência nova na RFB
 *   npx tsx scripts/receita-verificar.ts --competencia 2026-11 confere só essa competência
 *   npx tsx scripts/receita-verificar.ts --exportar-cnpjs f    grava os CNPJs da Receita que já estão no banco
 *
 * "Nova" = a pasta mais recente do compartilhamento público da RFB tem todos os arquivos usados e é
 * posterior à última carga concluída no banco. A pasta costuma aparecer antes de todos os zips subirem;
 * por isso a lista de arquivos é conferida. Com GITHUB_OUTPUT definido, grava competencia= e nova=.
 */
import fs from "node:fs";
import { getScriptDb } from "./script-db";

const TOKEN = "gn672Ad4CF8N6TK"; // link público da RFB, o mesmo de receita-baixar-filtrar.py
const RAIZ = "https://arquivos.receitafederal.gov.br/public.php/webdav/Dados/Cadastros/CNPJ/";
const NECESSARIOS = ["Municipios.zip", ...Array.from({ length: 10 }, (_, i) => [`Estabelecimentos${i}.zip`, `Empresas${i}.zip`]).flat()];

const args = process.argv.slice(2);
const arg = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};

// O servidor da RFB falha de vez em quando sem resposta; tenta de novo antes de desistir.
async function listar(url: string, tentativas = 5): Promise<string[]> {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, {
        method: "PROPFIND",
        headers: { Depth: "1", Authorization: `Basic ${Buffer.from(`${TOKEN}:`).toString("base64")}` },
        signal: AbortSignal.timeout(60_000),
      });
      if (r.status >= 400) throw new Error(`RFB respondeu ${r.status} em ${url}`);
      const xml = await r.text();
      return [...xml.matchAll(/<d:href>([^<]+)<\/d:href>/g)].map((m) => decodeURIComponent(m[1]));
    } catch (e) {
      if (i >= tentativas) throw e;
      await new Promise((r) => setTimeout(r, i * 5000));
    }
  }
}

async function competenciaPublicada(pedida?: string): Promise<string | null> {
  const pastas = pedida
    ? [pedida]
    : [...new Set((await listar(RAIZ)).map((h) => h.match(/\/CNPJ\/(\d{4}-\d{2})\/$/)?.[1]).filter((x): x is string => !!x))].sort().reverse();
  for (const p of pastas) {
    const arquivos = new Set((await listar(`${RAIZ}${p}/`)).map((h) => h.split("/").filter(Boolean).pop()!));
    const faltando = NECESSARIOS.filter((a) => !arquivos.has(a));
    if (!faltando.length) return p;
    console.log(`${p}: ainda faltam ${faltando.length} arquivos (${faltando.slice(0, 3).join(", ")}…)`);
    if (pedida) return null;
  }
  return null;
}

async function main() {
  const { db, schema, close } = await getScriptDb();
  try {
    const destino = arg("exportar-cnpjs");
    if (destino) {
      const rows = await db.select({ cnpj: schema.companies.cnpj }).from(schema.companies).where(schema.eq(schema.companies.source, "receita"));
      fs.writeFileSync(destino, rows.map((r) => r.cnpj).join("\n") + "\n");
      console.log(`${rows.length} CNPJs exportados para ${destino}`);
      return;
    }

    const [ultima] = await db
      .select({ c: schema.ingestionRuns.competencia })
      .from(schema.ingestionRuns)
      .where(schema.sql`${schema.ingestionRuns.source} = 'receita' and ${schema.ingestionRuns.finishedAt} is not null`)
      .orderBy(schema.sql`${schema.ingestionRuns.competencia} desc`)
      .limit(1);
    const publicada = await competenciaPublicada(arg("competencia"));
    const nova = !!publicada && (!!arg("competencia") || !ultima?.c || publicada > ultima.c);
    console.log(`Banco: ${ultima?.c ?? "vazio"} · RFB: ${publicada ?? "nada completo"} · ${nova ? "vai importar" : "nada a fazer"}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `competencia=${publicada ?? ""}\nnova=${nova}\n`);
  } finally {
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
