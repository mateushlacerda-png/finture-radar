import "server-only";
import { cache } from "react";
import { count, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { companies, ingestionRuns } from "@/lib/db/schema";

export type DataMode = { kind: "demo" | "real" | "misto" | "vazio"; competencia: string | null; total: number };

/** Diz se a base é simulada, real (Receita) ou mista, para o aviso no topo de toda tela. */
export const getDataMode = cache(async (): Promise<DataMode> => {
  const db = await getDb();
  const [[{ n: demo }], [{ n: total }], [run]] = await Promise.all([
    db.select({ n: count() }).from(companies).where(eq(companies.isDemo, true)),
    db.select({ n: count() }).from(companies),
    db
      .select({ competencia: ingestionRuns.competencia })
      .from(ingestionRuns)
      .where(eq(ingestionRuns.source, "receita"))
      .orderBy(desc(ingestionRuns.startedAt))
      .limit(1),
  ]);
  const real = total - demo;
  const kind = total === 0 ? "vazio" : demo === 0 ? "real" : real === 0 ? "demo" : "misto";
  return { kind, competencia: run?.competencia ?? null, total };
});
