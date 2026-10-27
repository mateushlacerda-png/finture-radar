import "server-only";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// ADR-001: sem DATABASE_URL, usa PGlite (Postgres em WASM) em .data/pglite.
// Com DATABASE_URL, usa Postgres gerenciado; migrações rodam fora da app (npm run db:migrate).

export type DB = ReturnType<typeof drizzlePglite<typeof schema>>;

type Holder = { db?: DB; ready?: Promise<DB> };
const g = globalThis as unknown as { __radarDb?: Holder };
const holder: Holder = (g.__radarDb ??= {});

// RADAR_DB_DIR separa bases: a real em .data/pglite (padrão) e a de demonstração/testes em .data/pglite-demo.
export const PGLITE_DIR = path.resolve(process.cwd(), process.env.RADAR_DB_DIR ?? path.join(".data", "pglite"));
export const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

async function init(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const client = postgres(url, { max: 10, prepare: false });
    return drizzlePostgres(client, { schema }) as unknown as DB;
  }
  const client = new PGlite(PGLITE_DIR);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

export function getDb(): Promise<DB> {
  if (holder.db) return Promise.resolve(holder.db);
  holder.ready ??= init().then((db) => (holder.db = db));
  return holder.ready;
}
