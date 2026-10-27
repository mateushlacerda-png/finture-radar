/**
 * Copia a base local (PGlite) para um Postgres gerenciado (ex.: Neon na Vercel).
 *
 *   TARGET_DATABASE_URL=postgres://... npx tsx scripts/copiar-para-postgres.ts [--aplicar]
 *
 * Sem --aplicar, só mostra o que seria copiado. Com --aplicar, roda as migrações no destino e copia
 * tabela por tabela via COPY, na ordem das chaves estrangeiras. Recusa destino que já tenha dados.
 * PGlite é processo único: pare o servidor local antes de rodar.
 */
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const aplicar = process.argv.includes("--aplicar");
const url = process.env.TARGET_DATABASE_URL;
if (!url) throw new Error("Defina TARGET_DATABASE_URL com a URL do Postgres de destino.");

// Sessões de login não migram: cada ambiente tem as suas.
const IGNORAR = new Set(["sessions", "__drizzle_migrations"]);

const origem = new PGlite(path.resolve(process.env.RADAR_DB_DIR ?? ".data/pglite"));
const destino = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

async function tabelasEmOrdem(): Promise<string[]> {
  const { rows: ts } = await origem.query<{ t: string }>(
    "select table_name as t from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
  );
  const { rows: deps } = await origem.query<{ filha: string; mae: string }>(`
    select tc.table_name as filha, ccu.table_name as mae
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'`);
  const nomes = ts.map((r) => r.t).filter((t) => !IGNORAR.has(t));
  const ordem: string[] = [];
  const visit = (t: string, pilha = new Set<string>()) => {
    if (ordem.includes(t) || pilha.has(t)) return;
    pilha.add(t);
    for (const d of deps) if (d.filha === t && d.mae !== t && nomes.includes(d.mae)) visit(d.mae, pilha);
    ordem.push(t);
  };
  nomes.sort().forEach((t) => visit(t));
  return ordem;
}

async function colunas(t: string): Promise<string[]> {
  const { rows } = await origem.query<{ c: string }>(
    "select column_name as c from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
    [t],
  );
  return rows.map((r) => r.c);
}

const contar = async (t: string) => Number((await origem.query<{ n: number }>(`select count(*)::int as n from "${t}"`)).rows[0].n);

async function main() {
  const tabelas = await tabelasEmOrdem();
  console.log("Origem:", origem.dataDir ?? "PGlite");
  for (const t of tabelas) console.log(`  ${t.padEnd(24)} ${(await contar(t)).toLocaleString("pt-BR")}`);
  if (!aplicar) {
    console.log("\nSimulação. Rode com --aplicar para copiar.");
    return;
  }

  console.log("\nMigrações no destino…");
  await migrate(drizzle(destino), { migrationsFolder: path.resolve("drizzle") });

  for (const t of tabelas) {
    const [{ n }] = await destino.unsafe<{ n: number }[]>(`select count(*)::int as n from "${t}"`);
    if (n > 0) throw new Error(`Destino já tem dados em "${t}" (${n} linhas). Nada foi copiado depois disso.`);
  }

  for (const t of tabelas) {
    const cols = (await colunas(t)).map((c) => `"${c}"`).join(", ");
    const inicio = Date.now();
    const r = await origem.query(`copy "${t}" (${cols}) to '/dev/blob' with (format csv)`);
    const blob = r.blob;
    if (blob && blob.size > 0) {
      const writable = await destino.unsafe(`copy "${t}" (${cols}) from stdin with (format csv)`).writable();
      await pipeline(Readable.fromWeb(blob.stream() as never), writable);
    }
    const [{ n }] = await destino.unsafe<{ n: number }[]>(`select count(*)::int as n from "${t}"`);
    const esperado = await contar(t);
    if (n !== esperado) throw new Error(`"${t}": copiou ${n} de ${esperado} linhas.`);
    console.log(`  ✓ ${t.padEnd(24)} ${n.toLocaleString("pt-BR").padStart(8)}  ${((Date.now() - inicio) / 1000).toFixed(1)} s`);
  }

  // Colunas serial: a sequência continua depois do maior id copiado.
  const { rows: seqs } = await origem.query<{ t: string; c: string }>(
    "select table_name as t, column_name as c from information_schema.columns where table_schema = 'public' and column_default like 'nextval(%'",
  );
  for (const { t, c } of seqs) {
    if (IGNORAR.has(t)) continue;
    await destino.unsafe(`select setval(pg_get_serial_sequence('"${t}"', '${c}'), coalesce((select max("${c}") from "${t}"), 1), (select count(*) > 0 from "${t}"))`);
  }
  console.log("\nCópia concluída e conferida.");
}

main()
  .catch((e) => {
    console.error("\nFalhou:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await destino.end();
    await origem.close();
  });
