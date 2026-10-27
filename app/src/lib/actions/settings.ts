"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { scoreConfigs } from "@/lib/db/schema";
import { requireApiSession } from "@/lib/auth/session";
import { searchCompaniesWith } from "@/lib/queries/companies";
import { weightsSchema, DEFAULT_WEIGHTS } from "@/lib/scoring/weights";
import { audit, run } from "./_util";

/** Calibração: cada gravação cria uma versão nova; a anterior fica no histórico. */
export async function saveWeights(input: unknown) {
  return run(async () => {
    const s = await requireApiSession(["admin"]);
    const weights = weightsSchema.parse(input);
    const db = await getDb();
    const [last] = await db
      .select({ version: scoreConfigs.version })
      .from(scoreConfigs)
      .where(eq(scoreConfigs.orgId, s.orgId))
      .orderBy(desc(scoreConfigs.version))
      .limit(1);
    const version = (last?.version ?? 0) + 1;
    await db.insert(scoreConfigs).values({ orgId: s.orgId, version, weights, createdBy: s.userId });
    await audit(s, "calibrar_score", "score_config", version, weights);
    revalidatePath("/", "layout");
    return { version };
  });
}

export async function resetWeights() {
  return saveWeights(DEFAULT_WEIGHTS);
}

/** Prévia da calibração: distribuição dos scores da base ativa com os pesos propostos, sem gravar. */
export async function previewWeights(input: unknown) {
  return run(async () => {
    const s = await requireApiSession(["admin", "gestor"]);
    const weights = weightsSchema.parse(input);
    const rows = await searchCompaniesWith(s.orgId, weights);
    const keys = ["geral", "saude", "seguro", "credito", "parceria"] as const;
    const faixas = (vals: number[]) => [
      vals.filter((v) => v < 40).length,
      vals.filter((v) => v >= 40 && v < 60).length,
      vals.filter((v) => v >= 60 && v < 80).length,
      vals.filter((v) => v >= 80).length,
    ];
    return Object.fromEntries(keys.map((k) => [k, faixas(rows.map((r) => r.scores[k]))])) as Record<(typeof keys)[number], number[]>;
  });
}
