// Conexão para scripts de linha de comando (fora do Next): mesmo critério de src/lib/db/client.ts.
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import * as tables from "../src/lib/db/schema";

export async function getScriptDb() {
  const schema = { ...tables, sql, eq };
  if (process.env.DATABASE_URL) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(process.env.DATABASE_URL, { max: 4 });
    return { db: drizzle(client, { schema: tables }), close: () => client.end(), schema };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const root = path.resolve(__dirname, "..");
  const client = new PGlite(path.resolve(root, process.env.RADAR_DB_DIR ?? path.join(".data", "pglite")));
  const db = drizzle(client, { schema: tables });
  await migrate(db, { migrationsFolder: path.join(root, "drizzle") });
  return { db, close: () => client.close(), schema };
}
