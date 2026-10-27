import "server-only";
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activities, companies, companyStatus, opportunities, suppressions, users } from "@/lib/db/schema";
import { ETAPAS, ETAPAS_ABERTAS, SOLUCAO_KEYS } from "@/lib/domain";

export const PERIODOS = { "30": "30 dias", "90": "90 dias", "180": "6 meses", "365": "12 meses" } as const;
export type Periodo = keyof typeof PERIODOS;

export async function getDashboard(orgId: string, periodo: Periodo) {
  const db = await getDb();
  const since = new Date(Date.now() - Number(periodo) * 86400000);
  // Em sql`` cru a data vai como texto: o driver postgres.js (Neon) não aceita Date ali; o PGlite aceitava.
  const sinceIso = since.toISOString();
  const inOrg = eq(opportunities.orgId, orgId);
  const inPeriod = gte(opportunities.createdAt, since);

  const [
    [{ n: totalEmpresas }],
    [{ n: emProspeccao }],
    [{ n: abertas }],
    [{ n: qualificados }],
    reached,
    porSolucao,
    porUf,
    porCidade,
    porDono,
    atividadesPorDono,
    semanal,
    [{ n: baseAtiva }],
  ] = await Promise.all([
    db
      .select({ n: count() })
      .from(companies)
      .where(sql`not exists (select 1 from ${suppressions} where ${suppressions.orgId} = ${orgId} and ${suppressions.cnpj} = ${companies.cnpj})`),
    db.select({ n: count() }).from(companyStatus).where(and(eq(companyStatus.orgId, orgId), eq(companyStatus.status, "prospectado"))),
    db.select({ n: count() }).from(opportunities).where(and(inOrg, inArray(opportunities.stage, ETAPAS_ABERTAS))),
    db.select({ n: count() }).from(opportunities).where(and(inOrg, inPeriod, gte(opportunities.maxStageIndex, 1))),
    // Conversão: quantas oportunidades do período chegaram a cada etapa (max_stage_index).
    db
      .select({ idx: opportunities.maxStageIndex, stage: opportunities.stage, n: count() })
      .from(opportunities)
      .where(and(inOrg, inPeriod))
      .groupBy(opportunities.maxStageIndex, opportunities.stage),
    db
      .select({ solution: opportunities.solution, stage: opportunities.stage, n: count() })
      .from(opportunities)
      .where(and(inOrg, inArray(opportunities.stage, [...ETAPAS_ABERTAS, "ganho"])))
      .groupBy(opportunities.solution, opportunities.stage),
    db
      .select({ uf: companies.uf, n: count() })
      .from(opportunities)
      .innerJoin(companies, eq(companies.id, opportunities.companyId))
      .where(and(inOrg, inPeriod))
      .groupBy(companies.uf)
      .orderBy(sql`count(*) desc`),
    db
      .select({ municipio: companies.municipio, uf: companies.uf, n: count() })
      .from(opportunities)
      .innerJoin(companies, eq(companies.id, opportunities.companyId))
      .where(and(inOrg, inPeriod))
      .groupBy(companies.municipio, companies.uf)
      .orderBy(sql`count(*) desc`)
      .limit(10),
    db
      .select({
        ownerId: opportunities.ownerId,
        name: users.name,
        abertas: sql<number>`count(*) filter (where ${opportunities.stage} in ${ETAPAS_ABERTAS})::int`,
        ganhas: sql<number>`count(*) filter (where ${opportunities.stage} = 'ganho' and ${opportunities.closedAt} >= ${sinceIso}::timestamptz)::int`,
        perdidas: sql<number>`count(*) filter (where ${opportunities.stage} = 'perdido' and ${opportunities.closedAt} >= ${sinceIso}::timestamptz)::int`,
      })
      .from(opportunities)
      .innerJoin(users, eq(users.id, opportunities.ownerId))
      .where(inOrg)
      .groupBy(opportunities.ownerId, users.name),
    db
      .select({ userId: activities.userId, n: count() })
      .from(activities)
      .where(and(eq(activities.orgId, orgId), gte(activities.createdAt, since), sql`${activities.type} <> 'etapa'`))
      .groupBy(activities.userId),
    db
      .select({
        semana: sql<string>`to_char(date_trunc('week', ${opportunities.createdAt}), 'YYYY-MM-DD')`,
        criadas: count(),
      })
      .from(opportunities)
      .where(and(inOrg, inPeriod))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    // Ativas no Radar = mesma regra da busca padrão (ATIVA, sem descarte nem oposição), contada no banco:
    // a página não carrega a base em memória (isso fica na API, que já está aquecida).
    db
      .select({ n: count() })
      .from(companies)
      .where(
        sql`${companies.situacao} = 'ATIVA'
          and not exists (select 1 from ${suppressions} where ${suppressions.orgId} = ${orgId} and ${suppressions.cnpj} = ${companies.cnpj})
          and not exists (select 1 from ${companyStatus} where ${companyStatus.orgId} = ${orgId} and ${companyStatus.companyId} = ${companies.id} and ${companyStatus.status} = 'descartado')`,
      ),
  ]);

  const ganhosSemana = await db
    .select({ semana: sql<string>`to_char(date_trunc('week', ${opportunities.closedAt}), 'YYYY-MM-DD')`, ganhas: count() })
    .from(opportunities)
    .where(and(inOrg, eq(opportunities.stage, "ganho"), gte(opportunities.closedAt, since)))
    .groupBy(sql`1`);

  // Funil de conversão sobre as 8 etapas positivas (perdido fica fora da escada).
  const etapasEscada = ETAPAS.filter((e) => e.key !== "perdido");
  const funil = etapasEscada.map((e, i) => ({
    etapa: e.label,
    n: reached.filter((r) => r.idx >= i).reduce((a, r) => a + r.n, 0),
  }));
  const conversao = funil.map((f, i) => ({ ...f, taxa: i === 0 ? null : funil[i - 1].n ? Math.round((f.n / funil[i - 1].n) * 100) : null }));

  const pipeline = SOLUCAO_KEYS.map((s) => ({
    solucao: s,
    abertas: porSolucao.filter((r) => r.solution === s && r.stage !== "ganho").reduce((a, r) => a + r.n, 0),
    ganhas: porSolucao.filter((r) => r.solution === s && r.stage === "ganho").reduce((a, r) => a + r.n, 0),
  }));

  const ativ = new Map(atividadesPorDono.map((a) => [a.userId, a.n]));
  const responsaveis = porDono
    .map((d) => ({ ...d, atividades: ativ.get(d.ownerId) ?? 0, conversao: d.ganhas + d.perdidas ? Math.round((d.ganhas / (d.ganhas + d.perdidas)) * 100) : null }))
    .sort((a, b) => b.ganhas - a.ganhas || b.abertas - a.abertas);

  const ganhosMap = new Map(ganhosSemana.map((g) => [g.semana, g.ganhas]));
  const semanas = Array.from(new Set([...semanal.map((s) => s.semana), ...ganhosMap.keys()])).sort();
  const criadasMap = new Map(semanal.map((s) => [s.semana, s.criadas]));
  const evolucao = semanas.map((w) => ({ semana: w, criadas: criadasMap.get(w) ?? 0, ganhas: ganhosMap.get(w) ?? 0 }));

  return {
    kpis: { totalEmpresas, qualificados, emProspeccao, abertas, ganhas: funil[funil.length - 1].n },
    conversao,
    pipeline,
    porUf,
    porCidade,
    responsaveis,
    evolucao,
    baseAtiva,
  };
}
export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
