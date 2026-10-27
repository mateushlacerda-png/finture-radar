import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activities, companies, lists, listItems, opportunities, savedSearches, tasks, users } from "@/lib/db/schema";
import type { Funil } from "@/lib/domain";
import { nomeExibicao } from "@/lib/nome";

export async function listUsers(orgId: string) {
  const db = await getDb();
  return db
    .select({ id: users.id, name: users.name, role: users.role, email: users.email })
    .from(users)
    .where(eq(users.orgId, orgId))
    .orderBy(asc(users.name));
}

export async function getBoard(orgId: string, funnel: Funil, ownerId?: string) {
  const db = await getDb();
  const openTasks = sql<number>`(select count(*)::int from ${tasks} where ${tasks.opportunityId} = ${opportunities.id} and ${tasks.done} = false)`;
  const rows = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      solution: opportunities.solution,
      funnel: opportunities.funnel,
      nextAction: opportunities.nextAction,
      nextActionAt: opportunities.nextActionAt,
      updatedAt: opportunities.updatedAt,
      ownerId: opportunities.ownerId,
      ownerName: users.name,
      companyId: companies.id,
      nomeFantasia: companies.nomeFantasia,
      razaoSocial: companies.razaoSocial,
      uf: companies.uf,
      municipio: companies.municipio,
      // Selo de simulado segue a empresa: oportunidade criada na demo sobre empresa fictícia também é demo.
      isDemo: sql<boolean>`(${opportunities.isDemo} or ${companies.isDemo})`,
      openTasks,
    })
    .from(opportunities)
    .innerJoin(companies, eq(companies.id, opportunities.companyId))
    .leftJoin(users, eq(users.id, opportunities.ownerId))
    .where(
      and(
        eq(opportunities.orgId, orgId),
        eq(opportunities.funnel, funnel),
        ownerId ? eq(opportunities.ownerId, ownerId) : undefined,
      ),
    )
    .orderBy(desc(opportunities.updatedAt));
  return rows.map(({ nomeFantasia, razaoSocial, ...r }) => ({ ...r, companyName: nomeExibicao({ nomeFantasia, razaoSocial }) }));
}
export type BoardCard = Awaited<ReturnType<typeof getBoard>>[number];

export async function getOpportunity(orgId: string, id: string) {
  const db = await getDb();
  const [op] = await db
    .select({ op: opportunities, ownerName: users.name, company: companies })
    .from(opportunities)
    .innerJoin(companies, eq(companies.id, opportunities.companyId))
    .leftJoin(users, eq(users.id, opportunities.ownerId))
    .where(and(eq(opportunities.orgId, orgId), eq(opportunities.id, id)))
    .limit(1);
  if (!op) return null;
  const [acts, tks] = await Promise.all([
    db
      .select({ id: activities.id, type: activities.type, body: activities.body, createdAt: activities.createdAt, userName: users.name })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.userId))
      .where(and(eq(activities.orgId, orgId), eq(activities.opportunityId, id)))
      .orderBy(desc(activities.createdAt)),
    db
      .select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt, done: tasks.done, assigneeName: users.name })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.assigneeId))
      .where(and(eq(tasks.orgId, orgId), eq(tasks.opportunityId, id)))
      .orderBy(asc(tasks.done), asc(tasks.dueAt)),
  ]);
  return { ...op, activities: acts, tasks: tks };
}

export async function getLists(orgId: string) {
  const db = await getDb();
  const [ls, searches] = await Promise.all([
    db
      .select({
        id: lists.id,
        name: lists.name,
        createdAt: lists.createdAt,
        createdByName: users.name,
        count: sql<number>`(select count(*)::int from ${listItems} where ${listItems.listId} = ${lists.id})`,
      })
      .from(lists)
      .leftJoin(users, eq(users.id, lists.createdBy))
      .where(eq(lists.orgId, orgId))
      .orderBy(desc(lists.createdAt)),
    db
      .select({ id: savedSearches.id, name: savedSearches.name, query: savedSearches.query, createdAt: savedSearches.createdAt, createdByName: users.name })
      .from(savedSearches)
      .leftJoin(users, eq(users.id, savedSearches.createdBy))
      .where(eq(savedSearches.orgId, orgId))
      .orderBy(desc(savedSearches.createdAt)),
  ]);
  return { lists: ls, searches };
}

export async function getList(orgId: string, id: string) {
  const db = await getDb();
  const [l] = await db.select().from(lists).where(and(eq(lists.orgId, orgId), eq(lists.id, id))).limit(1);
  return l ?? null;
}
