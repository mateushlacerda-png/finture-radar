"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { activities, companies, companyStatus, opportunities, tasks, users } from "@/lib/db/schema";
import { canManage, requireApiSession, type Session } from "@/lib/auth/session";
import { ETAPA_KEYS, SOLUCAO_KEYS, TIPOS_ATIVIDADE, etapaIndex, etapaLabel, type Etapa } from "@/lib/domain";
import { audit, run, UserError } from "./_util";

const uuid = z.string().uuid();
const optDate = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Data inválida." });
      return z.NEVER;
    }
    return d;
  });

async function assertUserInOrg(orgId: string, userId: string) {
  const db = await getDb();
  const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.orgId, orgId))).limit(1);
  if (!u) throw new UserError("Responsável inválido.");
}

/** Executivo só mexe na oportunidade da qual é responsável; gestor e admin, em todas. */
async function editableOpp(s: Session, id: string) {
  const db = await getDb();
  const [op] = await db.select().from(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.orgId, s.orgId))).limit(1);
  if (!op) throw new UserError("Oportunidade não encontrada.");
  if (!canManage(s) && op.ownerId !== s.userId) throw new UserError("Só o responsável ou um gestor pode alterar esta oportunidade.");
  return op;
}

export async function createOpportunity(input: {
  companyId: number;
  funnel: "parceiro" | "cliente";
  solution: string;
  ownerId?: string;
  nextAction?: string;
  nextActionAt?: string;
}) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z
      .object({
        companyId: z.number().int().positive(),
        funnel: z.enum(["parceiro", "cliente"]),
        solution: z.enum(SOLUCAO_KEYS as [string, ...string[]]),
        ownerId: uuid.optional(),
        nextAction: z.string().trim().max(200).optional(),
        nextActionAt: optDate,
      })
      .refine((x) => (x.funnel === "parceiro") === (x.solution === "parceria"), {
        message: "No funil de parceiros a solução é Parceria white-label; no de clientes, escolha saúde, seguro ou crédito.",
      })
      .parse(input);
    const ownerId = canManage(s) ? (v.ownerId ?? s.userId) : s.userId;
    await assertUserInOrg(s.orgId, ownerId);
    const db = await getDb();
    const [c] = await db.select({ id: companies.id, situacao: companies.situacao }).from(companies).where(eq(companies.id, v.companyId));
    if (!c) throw new UserError("Empresa não encontrada.");
    if (c.situacao !== "ATIVA") throw new UserError(`Empresa com situação ${c.situacao} não pode entrar no CRM.`);
    const [dup] = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(and(eq(opportunities.orgId, s.orgId), eq(opportunities.companyId, v.companyId), eq(opportunities.solution, v.solution)))
      .limit(1);
    if (dup) throw new UserError("Já existe oportunidade desta solução para a empresa.");

    const [op] = await db
      .insert(opportunities)
      .values({
        orgId: s.orgId,
        companyId: v.companyId,
        funnel: v.funnel,
        solution: v.solution,
        stage: "lead_identificado",
        maxStageIndex: 0,
        ownerId,
        nextAction: v.nextAction || null,
        nextActionAt: v.nextActionAt,
      })
      .returning({ id: opportunities.id });
    await db.insert(activities).values({ orgId: s.orgId, opportunityId: op.id, companyId: v.companyId, userId: s.userId, type: "etapa", body: "Etapa: lead_identificado" });
    await db
      .insert(companyStatus)
      .values({ orgId: s.orgId, companyId: v.companyId, status: "prospectado", updatedBy: s.userId })
      .onConflictDoUpdate({ target: [companyStatus.orgId, companyStatus.companyId], set: { status: "prospectado", discardReason: null, updatedBy: s.userId, updatedAt: new Date() } });
    await audit(s, "criar_oportunidade", "opportunity", op.id, { companyId: v.companyId, funnel: v.funnel, solution: v.solution });
    revalidatePath("/crm");
    revalidatePath("/radar");
    return { id: op.id };
  });
}

export async function moveStage(input: { id: string; stage: string; lostReason?: string }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z
      .object({ id: uuid, stage: z.enum(ETAPA_KEYS as [Etapa, ...Etapa[]]), lostReason: z.string().trim().max(300).optional() })
      .refine((x) => x.stage !== "perdido" || !!x.lostReason, { message: "Informe o motivo da perda." })
      .parse(input);
    const op = await editableOpp(s, v.id);
    if (op.stage === v.stage) return;
    const idx = etapaIndex(v.stage);
    const closing = v.stage === "ganho" || v.stage === "perdido";
    const db = await getDb();
    await db
      .update(opportunities)
      .set({
        stage: v.stage,
        maxStageIndex: v.stage === "perdido" ? op.maxStageIndex : Math.max(op.maxStageIndex, idx),
        lostReason: v.stage === "perdido" ? v.lostReason : null,
        closedAt: closing ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(opportunities.id, v.id));
    await db.insert(activities).values({
      orgId: s.orgId,
      opportunityId: v.id,
      companyId: op.companyId,
      userId: s.userId,
      type: "etapa",
      body: `Etapa: ${v.stage}${v.lostReason ? `. Motivo: ${v.lostReason}` : ""}`,
    });
    await audit(s, "mover_etapa", "opportunity", v.id, { de: op.stage, para: v.stage });
    revalidatePath("/crm");
    revalidatePath(`/crm/${v.id}`);
    return { label: etapaLabel(v.stage) };
  });
}

export async function updateOpportunity(input: { id: string; ownerId?: string; nextAction?: string; nextActionAt?: string }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z
      .object({ id: uuid, ownerId: uuid.optional(), nextAction: z.string().trim().max(200).optional(), nextActionAt: optDate })
      .parse(input);
    const op = await editableOpp(s, v.id);
    const set: Partial<typeof opportunities.$inferInsert> = { updatedAt: new Date(), nextAction: v.nextAction || null, nextActionAt: v.nextActionAt };
    if (v.ownerId && v.ownerId !== op.ownerId) {
      if (!canManage(s)) throw new UserError("Só gestores redistribuem oportunidades.");
      await assertUserInOrg(s.orgId, v.ownerId);
      set.ownerId = v.ownerId;
    }
    const db = await getDb();
    await db.update(opportunities).set(set).where(eq(opportunities.id, v.id));
    await audit(s, "editar_oportunidade", "opportunity", v.id, { ownerId: set.ownerId });
    revalidatePath(`/crm/${v.id}`);
    revalidatePath("/crm");
  });
}

export async function addActivity(input: { id: string; type: string; body: string }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z
      .object({
        id: uuid,
        type: z.enum(Object.keys(TIPOS_ATIVIDADE).filter((t) => t !== "etapa" && t !== "sistema" && t !== "tarefa") as [string, ...string[]]),
        body: z.string().trim().min(2, "Escreva a nota.").max(4000),
      })
      .parse(input);
    const op = await editableOpp(s, v.id);
    const db = await getDb();
    await db.insert(activities).values({ orgId: s.orgId, opportunityId: v.id, companyId: op.companyId, userId: s.userId, type: v.type, body: v.body });
    await db.update(opportunities).set({ updatedAt: new Date() }).where(eq(opportunities.id, v.id));
    revalidatePath(`/crm/${v.id}`);
  });
}

export async function addTask(input: { id: string; title: string; dueAt?: string; assigneeId?: string }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z
      .object({ id: uuid, title: z.string().trim().min(2, "Descreva a tarefa.").max(200), dueAt: optDate, assigneeId: uuid.optional() })
      .parse(input);
    const op = await editableOpp(s, v.id);
    const assignee = v.assigneeId ?? op.ownerId ?? s.userId;
    await assertUserInOrg(s.orgId, assignee);
    const db = await getDb();
    await db.insert(tasks).values({ orgId: s.orgId, opportunityId: v.id, title: v.title, dueAt: v.dueAt, assigneeId: assignee });
    const when = v.dueAt ? ` para ${v.dueAt.toLocaleDateString("pt-BR")}` : "";
    await db.insert(activities).values({ orgId: s.orgId, opportunityId: v.id, companyId: op.companyId, userId: s.userId, type: "tarefa", body: `Tarefa criada: ${v.title}${when}` });
    revalidatePath(`/crm/${v.id}`);
    revalidatePath("/crm");
  });
}

export async function toggleTask(input: { taskId: string }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z.object({ taskId: uuid }).parse(input);
    const db = await getDb();
    const [t] = await db.select().from(tasks).where(and(eq(tasks.id, v.taskId), eq(tasks.orgId, s.orgId))).limit(1);
    if (!t) throw new UserError("Tarefa não encontrada.");
    await editableOpp(s, t.opportunityId);
    await db.update(tasks).set({ done: !t.done }).where(eq(tasks.id, t.id));
    revalidatePath(`/crm/${t.opportunityId}`);
    revalidatePath("/crm");
  });
}
