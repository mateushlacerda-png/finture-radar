import "server-only";
import { and, desc, eq, gte, ilike, inArray, isNull, lte, ne, notExists, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  activities,
  companies,
  companyOverviews,
  companyStatus,
  listItems,
  lists,
  opportunities,
  scoreConfigs,
  suppressions,
  users,
} from "@/lib/db/schema";
import { CNAES_CLIENTE, CNAES_PARCEIRO, cnaeInfo, cnaesDoSetor, SETORES, type Setor } from "@/lib/cnaes";
import { REGIOES, type ScoreKey } from "@/lib/domain";
import { parseFilters, scoreKeyOf, type Filters } from "@/lib/filters";
import { scoreCompany, solucoesRecomendadas, type CompanyScores } from "@/lib/scoring/engine";
import { mergeWeights, type Weights } from "@/lib/scoring/weights";
import { factualOverview } from "@/lib/overview";
import { iaDisponivel, type AiOverview } from "@/lib/ai/overview";
import { nomeExibicao } from "@/lib/nome";

export async function getWeights(orgId: string): Promise<{ weights: Weights; version: number }> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(scoreConfigs)
    .where(eq(scoreConfigs.orgId, orgId))
    .orderBy(desc(scoreConfigs.version))
    .limit(1);
  return { weights: mergeWeights(row?.weights), version: row?.version ?? 0 };
}

const baseCols = {
  id: companies.id,
  cnpj: companies.cnpj,
  razaoSocial: companies.razaoSocial,
  nomeFantasia: companies.nomeFantasia,
  situacao: companies.situacao,
  cnaePrincipal: companies.cnaePrincipal,
  porte: companies.porte,
  capitalSocial: companies.capitalSocial,
  dataAbertura: companies.dataAbertura,
  uf: companies.uf,
  municipio: companies.municipio,
  lat: companies.lat,
  lng: companies.lng,
  geoPrecision: companies.geoPrecision,
  telefone: companies.telefone,
  email: companies.email,
  site: companies.site,
  funcionariosFaixa: companies.funcionariosFaixa,
  source: companies.source,
  entrouEm: companies.entrouEm,
  isDemo: companies.isDemo,
  status: companyStatus.status,
};

function whereFor(orgId: string, f: Filters): SQL {
  const conds: SQL[] = [];
  // Oposição/remoção LGPD: some do Radar da organização.
  conds.push(
    notExists(
      sql`(select 1 from ${suppressions} where ${suppressions.orgId} = ${orgId} and ${suppressions.cnpj} = ${companies.cnpj})`,
    ),
  );
  // UF e região se combinam por interseção: região Sudeste + UF BA não traz nada.
  let ufs: string[] = f.uf;
  if (f.regiao) {
    const daRegiao: string[] = REGIOES[f.regiao].ufs;
    ufs = ufs.length ? ufs.filter((u) => daRegiao.includes(u)) : daRegiao;
    if (ufs.length === 0) conds.push(sql`false`);
  }
  if (ufs.length) conds.push(inArray(companies.uf, ufs));
  if (f.municipio) conds.push(ilike(companies.municipio, `%${f.municipio.replace(/[%_]/g, "")}%`));
  if (f.cnae) conds.push(eq(companies.cnaePrincipal, f.cnae));
  if (f.setor) conds.push(inArray(companies.cnaePrincipal, cnaesDoSetor(f.setor as Setor)));
  if (f.tipo === "parceiro") conds.push(inArray(companies.cnaePrincipal, CNAES_PARCEIRO));
  if (f.tipo === "cliente") conds.push(inArray(companies.cnaePrincipal, CNAES_CLIENTE));
  if (f.porte.length) conds.push(inArray(companies.porte, f.porte));
  if (f.func.length) conds.push(inArray(companies.funcionariosFaixa, f.func));
  const hoje = new Date();
  const anosAtras = (n: number) => new Date(Date.UTC(hoje.getUTCFullYear() - n, hoje.getUTCMonth(), hoje.getUTCDate())).toISOString().slice(0, 10);
  if (f.idadeMin !== undefined) conds.push(lte(companies.dataAbertura, anosAtras(f.idadeMin)));
  if (f.idadeMax !== undefined) conds.push(gte(companies.dataAbertura, anosAtras(f.idadeMax)));
  if (f.contato) conds.push(or(sql`${companies.telefone} is not null`, sql`${companies.email} is not null`)!);
  if (f.recentes) conds.push(sql`${companies.entrouEm} = (select max(${companies.entrouEm}) from ${companies})`);
  if (f.q) {
    const digits = f.q.replace(/\D/g, "");
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    conds.push(
      or(
        ilike(companies.razaoSocial, like),
        ilike(companies.nomeFantasia, like),
        ...(digits.length >= 4 ? [ilike(companies.cnpj, `%${digits}%`)] : []),
      )!,
    );
  }
  const status = f.status ?? "ativos";
  if (status === "ativos") conds.push(or(isNull(companyStatus.status), ne(companyStatus.status, "descartado"))!);
  if (status === "novo") conds.push(or(isNull(companyStatus.status), eq(companyStatus.status, "novo"))!);
  if (status === "prospectado") conds.push(eq(companyStatus.status, "prospectado"));
  if (status === "descartado") conds.push(eq(companyStatus.status, "descartado"));
  if (f.lista) {
    conds.push(
      sql`${companies.id} in (select ${listItems.companyId} from ${listItems} inner join ${lists} on ${lists.id} = ${listItems.listId} where ${lists.id} = ${f.lista} and ${lists.orgId} = ${orgId})`,
    );
  }
  return and(...conds)!;
}

export type RadarRow = {
  id: number;
  cnpj: string;
  nome: string;
  razaoSocial: string;
  uf: string;
  municipio: string;
  lat: number | null;
  lng: number | null;
  porte: string | null;
  cnae: string | null;
  setor: string | null;
  parceiroTipo: string | null;
  status: string;
  temContato: boolean;
  telefone: string | null;
  email: string | null;
  site: string | null;
  isDemo: boolean;
  /** Entrou na base na última atualização mensal da Receita. */
  nova: boolean;
  scores: Record<ScoreKey, number>;
  confianca: string;
  recomendadas: string[];
};

/** Resumo do score guardado em cache: só números, para caber centenas de milhares de empresas na memória. */
type ScoreSummary = { scores: Record<ScoreKey, number>; confianca: string; recomendadas: string[] };

function summarize(s: CompanyScores): ScoreSummary {
  return {
    scores: { geral: s.geral.value, saude: s.saude.value, seguro: s.seguro.value, credito: s.credito.value, parceria: s.parceria.value },
    confianca: s.geral.confidence,
    recomendadas: solucoesRecomendadas(s),
  };
}

function toRow(r: Awaited<ReturnType<typeof rawSearch>>[number], s: ScoreSummary): RadarRow {
  const info = cnaeInfo(r.cnaePrincipal);
  return {
    id: r.id,
    cnpj: r.cnpj,
    nome: nomeExibicao(r),
    razaoSocial: r.razaoSocial,
    uf: r.uf,
    municipio: r.municipio,
    lat: r.lat,
    lng: r.lng,
    porte: r.porte,
    cnae: r.cnaePrincipal,
    setor: info ? SETORES[info.setor] : null,
    parceiroTipo: info?.parceria ?? null,
    status: r.status ?? "novo",
    temContato: !!(r.telefone || r.email),
    telefone: r.telefone,
    email: r.email,
    site: r.site,
    isDemo: r.isDemo,
    nova: r.nova,
    scores: s.scores,
    confianca: s.confianca,
    recomendadas: s.recomendadas,
  };
}

// ---------- base pública em memória ----------
// O cadastro de empresas só muda na ingestão. Ler dezenas de milhares de linhas do PGlite a cada
// filtro custava segundos; a base fica em memória (campos enxutos) e é recarregada quando
// count/max(updated_at) mudam. Do banco, por consulta, só vêm os dados da organização.
// Fase 2 (Postgres + PostGIS): voltar o filtro para o SQL com índices e consulta por viewport.
const { status: _status, ...publicCols } = baseCols;
void _status;
type BaseRow = Awaited<ReturnType<typeof loadBaseRows>>[number] & { busca: string };
// ultima = competência mais recente em que empresas entraram pela atualização mensal (nula até a 1ª).
type Base = { key: string; rows: BaseRow[]; ultima: string | null };
const gb = globalThis as unknown as { __radarBase?: Base; __radarBaseLoading?: Promise<Base> };

async function loadBaseRows() {
  const db = await getDb();
  return db.select(publicCols).from(companies);
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function getBase(): Promise<Base> {
  const db = await getDb();
  const [v] = await db.select({ n: sql<number>`count(*)::int`, m: sql<string>`max(${companies.updatedAt})::text` }).from(companies);
  const key = `${v.n}|${v.m}`;
  if (gb.__radarBase?.key === key) return gb.__radarBase;
  gb.__radarBaseLoading ??= loadBaseRows()
    .then((rows) => {
      let ultima: string | null = null;
      for (const r of rows) if (r.entrouEm && (!ultima || r.entrouEm > ultima)) ultima = r.entrouEm;
      const base: Base = {
        key,
        rows: rows.map((r) => ({ ...r, busca: semAcento(`${r.razaoSocial} ${r.nomeFantasia ?? ""}`) + " " + r.cnpj })),
        ultima,
      };
      // Base nova (ingestão): situação e dados mudaram, então os scores guardados também.
      scoreCaches.clear();
      gb.__radarBase = base;
      return base;
    })
    .finally(() => (gb.__radarBaseLoading = undefined));
  return gb.__radarBaseLoading;
}

/** Quantas empresas ativas entraram na última atualização mensal (para o aviso do Radar). */
export async function getNovidades(): Promise<{ competencia: string; total: number } | null> {
  const base = await getBase();
  if (!base.ultima) return null;
  let total = 0;
  for (const r of base.rows) if (r.entrouEm === base.ultima && r.situacao === "ATIVA") total++;
  return { competencia: base.ultima, total };
}

async function rawSearch(orgId: string, f: Filters) {
  const db = await getDb();
  const status = f.status ?? "ativos";
  const [base, statusRows, supp, lista] = await Promise.all([
    getBase(),
    db.select({ id: companyStatus.companyId, status: companyStatus.status }).from(companyStatus).where(eq(companyStatus.orgId, orgId)),
    db.select({ cnpj: suppressions.cnpj }).from(suppressions).where(eq(suppressions.orgId, orgId)),
    f.lista
      ? db
          .select({ id: listItems.companyId })
          .from(listItems)
          .innerJoin(lists, eq(lists.id, listItems.listId))
          .where(and(eq(lists.id, f.lista), eq(lists.orgId, orgId)))
      : Promise.resolve(null),
  ]);
  const st = new Map(statusRows.map((s) => [s.id, s.status]));
  const suprimidos = new Set(supp.map((s) => s.cnpj));
  const naLista = lista ? new Set(lista.map((l) => l.id)) : null;

  // Mesmas regras de whereFor (que segue valendo para a ficha).
  let ufs: string[] | null = f.uf.length ? f.uf : null;
  if (f.regiao) {
    const daRegiao: string[] = REGIOES[f.regiao].ufs;
    ufs = ufs ? ufs.filter((u) => daRegiao.includes(u)) : daRegiao;
  }
  const ufSet = ufs ? new Set(ufs) : null;
  const cnaeSet = f.setor ? new Set(cnaesDoSetor(f.setor as Setor)) : null;
  const tipoSet = f.tipo === "parceiro" ? new Set(CNAES_PARCEIRO) : f.tipo === "cliente" ? new Set(CNAES_CLIENTE) : null;
  const porteSet = f.porte.length ? new Set<string>(f.porte) : null;
  const funcSet = f.func.length ? new Set<string>(f.func) : null;
  const hoje = new Date();
  const anosAtras = (n: number) => new Date(Date.UTC(hoje.getUTCFullYear() - n, hoje.getUTCMonth(), hoje.getUTCDate())).toISOString().slice(0, 10);
  const abertaAte = f.idadeMin !== undefined ? anosAtras(f.idadeMin) : null;
  const abertaDesde = f.idadeMax !== undefined ? anosAtras(f.idadeMax) : null;
  const mun = f.municipio ? semAcento(f.municipio) : null;
  const q = f.q ? semAcento(f.q) : null;
  const qDigits = f.q ? f.q.replace(/\D/g, "") : "";

  const out: (BaseRow & { status: "novo" | "prospectado" | "descartado" | null; nova: boolean })[] = [];
  for (const r of base.rows) {
    // Baixada, suspensa ou inapta não pode ser abordada: some do Radar (a ficha e o CRM continuam abrindo).
    if (r.situacao !== "ATIVA") continue;
    const nova = !!base.ultima && r.entrouEm === base.ultima;
    if (f.recentes && !nova) continue;
    if (ufSet && !ufSet.has(r.uf)) continue;
    if (mun && !semAcento(r.municipio).includes(mun)) continue;
    if (f.cnae && r.cnaePrincipal !== f.cnae) continue;
    if (cnaeSet && !cnaeSet.has(r.cnaePrincipal ?? "")) continue;
    if (tipoSet && !tipoSet.has(r.cnaePrincipal ?? "")) continue;
    if (porteSet && !porteSet.has(r.porte ?? "")) continue;
    if (funcSet && !funcSet.has(r.funcionariosFaixa ?? "")) continue;
    if (abertaAte && !(r.dataAbertura && r.dataAbertura <= abertaAte)) continue;
    if (abertaDesde && !(r.dataAbertura && r.dataAbertura >= abertaDesde)) continue;
    if (f.contato && !r.telefone && !r.email) continue;
    if (q && !r.busca.includes(q) && !(qDigits.length >= 4 && r.cnpj.includes(qDigits))) continue;
    if (naLista && !naLista.has(r.id)) continue;
    if (suprimidos.has(r.cnpj)) continue;
    const s = st.get(r.id) ?? null;
    if (status === "ativos" && s === "descartado") continue;
    if (status === "novo" && s && s !== "novo") continue;
    if (status === "prospectado" && s !== "prospectado") continue;
    if (status === "descartado" && s !== "descartado") continue;
    out.push({ ...r, status: s, nova });
  }
  return out;
}

// Cache de scores: empresas só mudam na ingestão, e o score depende só dos pesos e da data
// (tempo de atividade). Chave = pesos + dia. Fase 2: tabela company_scores (ARQUITETURA.md).
type ScoreCache = Map<number, ScoreSummary>;
const g = globalThis as unknown as { __radarScoreCache?: Map<string, ScoreCache> };
const scoreCaches = (g.__radarScoreCache ??= new Map());

function scoreCacheFor(weights: Weights): ScoreCache {
  const key = new Date().toISOString().slice(0, 10) + JSON.stringify(weights);
  let c = scoreCaches.get(key);
  if (!c) {
    if (scoreCaches.size >= 8) scoreCaches.delete(scoreCaches.keys().next().value!);
    c = new Map();
    scoreCaches.set(key, c);
  }
  return c;
}

function cachedScore(cache: ScoreCache, r: Awaited<ReturnType<typeof rawSearch>>[number], weights: Weights): ScoreSummary {
  let s = cache.get(r.id);
  if (!s) {
    s = summarize(scoreCompany({ ...r, capitalSocial: r.capitalSocial === null ? null : Number(r.capitalSocial) }, weights));
    cache.set(r.id, s);
  }
  return s;
}

/** Busca + score + ordenação. ADR-002: score calculado em memória sobre o recorte do SQL. */
export async function searchCompanies(orgId: string, f: Filters, opts: { offset?: number; limit?: number } = {}) {
  const t0 = performance.now();
  const [{ weights }, raw] = await Promise.all([getWeights(orgId), rawSearch(orgId, f)]);
  const t1 = performance.now();
  const key = scoreKeyOf(f);
  const cache = scoreCacheFor(weights);
  let rows = raw.map((r) => toRow(r, cachedScore(cache, r, weights)));
  if (f.scoreMin !== undefined) rows = rows.filter((r) => r.scores[key] >= f.scoreMin!);
  rows.sort((a, b) => b.scores[key] - a.scores[key] || a.nome.localeCompare(b.nome));
  const total = rows.length;
  if (process.env.RADAR_TIMING) console.log(`[timing] sql=${(t1 - t0).toFixed(0)}ms score=${(performance.now() - t1).toFixed(0)}ms rows=${raw.length}`);
  const offset = opts.offset ?? 0;
  const page = opts.limit === undefined ? rows : rows.slice(offset, offset + opts.limit);
  return { total, rows: page, all: rows, scoreKey: key };
}

/** Base ativa pontuada com pesos arbitrários (prévia da calibração). */
export async function searchCompaniesWith(orgId: string, weights: Weights) {
  const raw = await rawSearch(orgId, parseFilters({}));
  const now = new Date();
  return raw.map((r) => toRow(r, summarize(scoreCompany({ ...r, capitalSocial: r.capitalSocial === null ? null : Number(r.capitalSocial) }, weights, now))));
}

export async function getCompanyDetail(orgId: string, id: number) {
  const db = await getDb();
  const [c] = await db
    .select({ company: companies, status: companyStatus.status, discardReason: companyStatus.discardReason })
    .from(companies)
    .leftJoin(companyStatus, and(eq(companyStatus.companyId, companies.id), eq(companyStatus.orgId, orgId)))
    .where(and(eq(companies.id, id), whereFor(orgId, parseFilters({ status: "todos" }))))
    .limit(1);
  if (!c) return null;
  const { weights } = await getWeights(orgId);
  const scores = scoreCompany(
    { ...c.company, capitalSocial: c.company.capitalSocial === null ? null : Number(c.company.capitalSocial) },
    weights,
  );
  const [opps, acts, inLists, [overview]] = await Promise.all([
    db
      .select({
        id: opportunities.id,
        funnel: opportunities.funnel,
        solution: opportunities.solution,
        stage: opportunities.stage,
        ownerName: users.name,
        nextAction: opportunities.nextAction,
        nextActionAt: opportunities.nextActionAt,
        updatedAt: opportunities.updatedAt,
      })
      .from(opportunities)
      .leftJoin(users, eq(users.id, opportunities.ownerId))
      .where(and(eq(opportunities.orgId, orgId), eq(opportunities.companyId, id)))
      .orderBy(desc(opportunities.updatedAt)),
    db
      .select({ id: activities.id, type: activities.type, body: activities.body, createdAt: activities.createdAt, userName: users.name })
      .from(activities)
      .leftJoin(users, eq(users.id, activities.userId))
      .where(and(eq(activities.orgId, orgId), eq(activities.companyId, id)))
      .orderBy(desc(activities.createdAt))
      .limit(30),
    db
      .select({ id: lists.id, name: lists.name })
      .from(listItems)
      .innerJoin(lists, eq(lists.id, listItems.listId))
      .where(and(eq(lists.orgId, orgId), eq(listItems.companyId, id))),
    db
      .select({ conteudo: companyOverviews.conteudo, fontes: companyOverviews.fontes, modelo: companyOverviews.modelo, geradoEm: companyOverviews.geradoEm, geradoPor: users.name })
      .from(companyOverviews)
      .leftJoin(users, eq(users.id, companyOverviews.geradoPor))
      .where(and(eq(companyOverviews.orgId, orgId), eq(companyOverviews.companyId, id)))
      .limit(1),
  ]);
  const info = cnaeInfo(c.company.cnaePrincipal);
  return {
    company: { ...c.company, capitalSocial: c.company.capitalSocial === null ? null : Number(c.company.capitalSocial) },
    cnae: info ? { ...info, setorLabel: SETORES[info.setor] } : null,
    status: c.status ?? "novo",
    discardReason: c.discardReason,
    scores,
    recomendadas: solucoesRecomendadas(scores),
    opportunities: opps,
    activities: acts,
    lists: inLists,
    factual: factualOverview({ ...c.company, capitalSocial: c.company.capitalSocial === null ? null : Number(c.company.capitalSocial) }),
    overview: overview
      ? { ...overview, conteudo: overview.conteudo as AiOverview, fontes: overview.fontes as string[] }
      : null,
    iaDisponivel: iaDisponivel(),
  };
}

export type CompanyDetail = NonNullable<Awaited<ReturnType<typeof getCompanyDetail>>>;
