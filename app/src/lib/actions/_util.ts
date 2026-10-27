import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";
import { AuthError, type Session } from "@/lib/auth/session";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export class UserError extends Error {}

/** Envolve a action: converte erros conhecidos em mensagem para a interface, sem vazar detalhe interno. */
export async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof AuthError || e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Dados inválidos." };
    console.error("[action]", e);
    return { ok: false, error: "Não foi possível concluir. Tente de novo." };
  }
}

export async function audit(s: Session, action: string, entity: string, entityId: string | number | null, data?: unknown) {
  const db = await getDb();
  await db.insert(auditEvents).values({
    orgId: s.orgId,
    userId: s.userId,
    action,
    entity,
    entityId: entityId === null ? null : String(entityId),
    data: data ?? null,
  });
}
