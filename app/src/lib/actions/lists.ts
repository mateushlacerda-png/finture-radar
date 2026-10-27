"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { companies, listItems, lists, savedSearches } from "@/lib/db/schema";
import { requireApiSession } from "@/lib/auth/session";
import { parseFilters, serializeFilters } from "@/lib/filters";
import { audit, run, UserError } from "./_util";

const name = z.string().trim().min(2, "Dê um nome com pelo menos 2 letras.").max(80);

async function ownedList(orgId: string, listId: string) {
  const db = await getDb();
  const [l] = await db.select({ id: lists.id }).from(lists).where(and(eq(lists.id, listId), eq(lists.orgId, orgId))).limit(1);
  if (!l) throw new UserError("Lista não encontrada.");
  return l;
}

export async function createList(input: { name: string; companyIds?: number[] }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z.object({ name, companyIds: z.array(z.number().int().positive()).max(5000).optional() }).parse(input);
    const db = await getDb();
    const [l] = await db.insert(lists).values({ orgId: s.orgId, name: v.name, createdBy: s.userId }).returning({ id: lists.id });
    if (v.companyIds?.length) await addItems(l.id, v.companyIds, s.userId);
    await audit(s, "criar_lista", "list", l.id, { name: v.name, itens: v.companyIds?.length ?? 0 });
    revalidatePath("/listas");
    return { id: l.id };
  });
}

async function addItems(listId: string, ids: number[], userId: string) {
  const db = await getDb();
  const existing = await db.select({ id: companies.id }).from(companies).where(inArray(companies.id, ids));
  if (!existing.length) return 0;
  await db
    .insert(listItems)
    .values(existing.map((c) => ({ listId, companyId: c.id, addedBy: userId })))
    .onConflictDoNothing();
  return existing.length;
}

export async function addToList(input: { listId: string; companyIds: number[] }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z.object({ listId: z.string().uuid(), companyIds: z.array(z.number().int().positive()).min(1).max(5000) }).parse(input);
    await ownedList(s.orgId, v.listId);
    const n = await addItems(v.listId, v.companyIds, s.userId);
    await audit(s, "adicionar_lista", "list", v.listId, { itens: n });
    revalidatePath("/listas");
    return { added: n };
  });
}

export async function removeFromList(input: { listId: string; companyId: number }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z.object({ listId: z.string().uuid(), companyId: z.number().int().positive() }).parse(input);
    await ownedList(s.orgId, v.listId);
    const db = await getDb();
    await db.delete(listItems).where(and(eq(listItems.listId, v.listId), eq(listItems.companyId, v.companyId)));
    revalidatePath(`/listas/${v.listId}`);
  });
}

export async function renameList(input: { listId: string; name: string }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z.object({ listId: z.string().uuid(), name }).parse(input);
    await ownedList(s.orgId, v.listId);
    const db = await getDb();
    await db.update(lists).set({ name: v.name }).where(eq(lists.id, v.listId));
    revalidatePath("/listas");
  });
}

export async function deleteList(input: { listId: string }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z.object({ listId: z.string().uuid() }).parse(input);
    await ownedList(s.orgId, v.listId);
    const db = await getDb();
    await db.delete(lists).where(eq(lists.id, v.listId));
    await audit(s, "excluir_lista", "list", v.listId);
    revalidatePath("/listas");
  });
}

export async function saveSearch(input: { name: string; query: string }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z.object({ name, query: z.string().max(2000) }).parse(input);
    // Normaliza pelo parser: só filtros válidos entram na pesquisa salva.
    const f = parseFilters(new URLSearchParams(v.query));
    const query = serializeFilters({ ...f, lista: undefined });
    const db = await getDb();
    const [row] = await db.insert(savedSearches).values({ orgId: s.orgId, name: v.name, query, createdBy: s.userId }).returning({ id: savedSearches.id });
    revalidatePath("/listas");
    return { id: row.id };
  });
}

export async function deleteSearch(input: { id: string }) {
  return run(async () => {
    const s = await requireApiSession();
    const v = z.object({ id: z.string().uuid() }).parse(input);
    const db = await getDb();
    await db.delete(savedSearches).where(and(eq(savedSearches.id, v.id), eq(savedSearches.orgId, s.orgId)));
    revalidatePath("/listas");
  });
}
