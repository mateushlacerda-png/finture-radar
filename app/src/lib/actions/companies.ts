"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { activities, companies, companyOverviews, companyStatus, opportunities, suppressions } from "@/lib/db/schema";
import { requireApiSession } from "@/lib/auth/session";
import { MOTIVOS_DESCARTE, TIPOS_CONTATO } from "@/lib/domain";
import { audit, run, UserError } from "./_util";

const companyId = z.number().int().positive();

async function assertCompany(id: number) {
  const db = await getDb();
  const [c] = await db.select({ id: companies.id, cnpj: companies.cnpj }).from(companies).where(eq(companies.id, id)).limit(1);
  if (!c) throw new UserError("Empresa não encontrada.");
  return c;
}

export async function discardCompany(input: { companyId: number; reason: string; detail?: string }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z
      .object({ companyId, reason: z.enum(MOTIVOS_DESCARTE), detail: z.string().max(300).optional() })
      .parse(input);
    await assertCompany(v.companyId);
    const reason = v.detail ? `${v.reason}: ${v.detail}` : v.reason;
    const db = await getDb();
    await db
      .insert(companyStatus)
      .values({ orgId: s.orgId, companyId: v.companyId, status: "descartado", discardReason: reason, updatedBy: s.userId })
      .onConflictDoUpdate({
        target: [companyStatus.orgId, companyStatus.companyId],
        set: { status: "descartado", discardReason: reason, updatedBy: s.userId, updatedAt: new Date() },
      });
    await db.insert(activities).values({ orgId: s.orgId, companyId: v.companyId, userId: s.userId, type: "sistema", body: `Lead descartado. Motivo: ${reason}` });
    await audit(s, "descartar", "company", v.companyId, { reason });
    revalidatePath("/radar");
  });
}

export async function restoreCompany(input: { companyId: number }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z.object({ companyId }).parse(input);
    const db = await getDb();
    const [hasOpp] = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(and(eq(opportunities.orgId, s.orgId), eq(opportunities.companyId, v.companyId)))
      .limit(1);
    await db
      .update(companyStatus)
      .set({ status: hasOpp ? "prospectado" : "novo", discardReason: null, updatedBy: s.userId, updatedAt: new Date() })
      .where(and(eq(companyStatus.orgId, s.orgId), eq(companyStatus.companyId, v.companyId)));
    await db.insert(activities).values({ orgId: s.orgId, companyId: v.companyId, userId: s.userId, type: "sistema", body: "Lead restaurado ao Radar" });
    await audit(s, "restaurar", "company", v.companyId);
    revalidatePath("/radar");
  });
}

export async function logContact(input: { companyId: number; type: string; body: string; opportunityId?: string }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z
      .object({
        companyId,
        type: z.enum(TIPOS_CONTATO as [string, ...string[]]),
        body: z.string().trim().min(3, "Descreva o contato em poucas palavras.").max(2000),
        opportunityId: z.string().uuid().optional(),
      })
      .parse(input);
    await assertCompany(v.companyId);
    const db = await getDb();
    if (v.opportunityId) {
      const [op] = await db
        .select({ id: opportunities.id })
        .from(opportunities)
        .where(and(eq(opportunities.id, v.opportunityId), eq(opportunities.orgId, s.orgId), eq(opportunities.companyId, v.companyId)));
      if (!op) throw new UserError("Oportunidade não encontrada.");
    }
    await db.insert(activities).values({ orgId: s.orgId, companyId: v.companyId, opportunityId: v.opportunityId ?? null, userId: s.userId, type: v.type, body: v.body });
    // Contato registrado = empresa prospectada (sem rebaixar um descarte).
    await db
      .insert(companyStatus)
      .values({ orgId: s.orgId, companyId: v.companyId, status: "prospectado", updatedBy: s.userId })
      .onConflictDoUpdate({
        target: [companyStatus.orgId, companyStatus.companyId],
        set: { status: "prospectado", updatedBy: s.userId, updatedAt: new Date() },
        setWhere: eq(companyStatus.status, "novo"),
      });
    await audit(s, "registrar_contato", "company", v.companyId, { type: v.type });
    revalidatePath("/radar");
    if (v.opportunityId) revalidatePath(`/crm/${v.opportunityId}`);
  });
}

/** LGPD: oposição ou pedido de remoção. A empresa sai do Radar da organização. */
export async function registerSuppression(input: { companyId: number; kind: "oposicao" | "remocao"; requester: string; note?: string }) {
  return run(async () => {
    const s = await requireApiSession(["admin", "gestor"]);
    const v = z
      .object({
        companyId,
        kind: z.enum(["oposicao", "remocao"]),
        requester: z.string().trim().min(3, "Informe quem fez o pedido e por qual canal.").max(200),
        note: z.string().max(1000).optional(),
      })
      .parse(input);
    const c = await assertCompany(v.companyId);
    const db = await getDb();
    await db
      .insert(suppressions)
      .values({ orgId: s.orgId, cnpj: c.cnpj, kind: v.kind, requester: v.requester, note: v.note, createdBy: s.userId })
      .onConflictDoNothing();
    await audit(s, `lgpd_${v.kind}`, "company", v.companyId, { requester: v.requester });
    revalidatePath("/radar");
    revalidatePath("/configuracoes");
  });
}

/** Overview por IA (Claude Code local), sob demanda. Fica salvo por organização. */
export async function generateOverview(input: { companyId: number }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z.object({ companyId }).parse(input);
    const db = await getDb();
    const [c] = await db.select().from(companies).where(eq(companies.id, v.companyId)).limit(1);
    if (!c) throw new UserError("Empresa não encontrada.");
    const { gerarOverviewIA, iaDisponivel } = await import("@/lib/ai/overview");
    if (!iaDisponivel()) throw new UserError("O briefing por IA ainda não está ligado na versão online.");
    let r;
    try {
      r = await gerarOverviewIA({ ...c, capitalSocial: c.capitalSocial === null ? null : Number(c.capitalSocial) });
    } catch (e) {
      throw new UserError((e as Error).message);
    }
    await db
      .insert(companyOverviews)
      .values({ orgId: s.orgId, companyId: v.companyId, conteudo: r.conteudo, fontes: r.fontes, modelo: r.modelo, geradoPor: s.userId })
      .onConflictDoUpdate({
        target: [companyOverviews.orgId, companyOverviews.companyId],
        set: { conteudo: r.conteudo, fontes: r.fontes, modelo: r.modelo, geradoPor: s.userId, geradoEm: new Date() },
      });
    await audit(s, "gerar_overview_ia", "company", v.companyId, { modelo: r.modelo });
  });
}
