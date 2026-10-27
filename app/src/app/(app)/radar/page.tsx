import type { Metadata } from "next";
import { RadarView } from "@/components/radar/radar-view";
import { canManage, requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { companies } from "@/lib/db/schema";
import { parseFilters, serializeFilters } from "@/lib/filters";
import { getNovidades } from "@/lib/queries/companies";
import { getList, getLists, listUsers } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "Radar" };

export default async function RadarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const empresa = typeof sp.empresa === "string" && /^\d+$/.test(sp.empresa) ? Number(sp.empresa) : undefined;
  const db = await getDb();
  const [users, { lists }, municipios, list, novidades] = await Promise.all([
    listUsers(s.orgId),
    getLists(s.orgId),
    db.selectDistinct({ uf: companies.uf, municipio: companies.municipio }).from(companies).orderBy(companies.municipio),
    filters.lista ? getList(s.orgId, filters.lista) : Promise.resolve(null),
    getNovidades(),
  ]);
  return (
    <RadarView
      // Nova navegação para o Radar (ex.: menu lateral) recomeça do zero, com a pergunta inicial.
      key={`${serializeFilters(filters)}#${empresa ?? ""}`}
      initialQuery={serializeFilters(filters)}
      municipios={municipios}
      listName={list?.name}
      initialSelected={empresa}
      novidades={novidades}
      ctx={{
        users: users.map((u) => ({ id: u.id, name: u.name })),
        lists: lists.map((l) => ({ id: l.id, name: l.name })),
        me: { id: s.userId, canManage: canManage(s) },
      }}
    />
  );
}
