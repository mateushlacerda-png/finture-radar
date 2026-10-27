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
import { parseFilters, scoreKeyOf, serializeFilters, type Filters, type ScoreSort } from "@/lib/filters";
import { RANKING_TTL_MS, rankings } from "./ranking-cache";
import { perfilDoScore, scoreCompany, solucoesRecomendadas, type CompanyScores } from "@/lib/scoring/engine";
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

function toRow({ r, status, nova }: Hit, s: ScoreSummary): RadarRow {
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
    status: status ?? "novo",
    temContato: !!(r.telefone || r.email),
    telefone: r.telefone,
    email: r.email,
    site: r.site,
    isDemo: r.isDemo,
    nova,
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
type BaseRow = Awaited<ReturnType<typeof loadBaseRows>>[number] & { busca: string | null; geo: string | null };
// ultima = competência mais recente em que empresas entraram pela atualização mensal (nula até a 1ª).
type Base = { key: string; rows: BaseRow[]; ultima: string | null };
type Hit = { r: BaseRow; status: "novo" | "prospectado" | "descartado" | null; nova: boolean };
const gb = globalThis as unknown as { __radarBase?: Base; __radarBaseLoading?: Promise<Base> };

// Ordem alfabética do nome exibido feita no banco: a ordenação por score (por baldes) herda o desempate.
// Mesma regra de lib/nome.ts (fantasia só com duas letras ou mais).
async function loadBaseRows() {
  const db = await getDb();
  return db
    .select(publicCols)
    .from(companies)
    .orderBy(sql`lower(case when ${companies.nomeFantasia} ~ '[[:alpha:]].*[[:alpha:]]' then ${companies.nomeFantasia} else ${companies.razaoSocial} end)`, companies.id);
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// A base só muda na ingestão mensal ou num ajuste de dados: conferir a versão a cada 30 s basta,
// e poupa uma contagem sobre centenas de milhares de linhas em toda requisição.
const BASE_CHECK_MS = 30_000;
const gc = globalThis as unknown as { __radarBaseCheck?: { at: number; key: string } };

async function getBase(): Promise<Base> {
  const agora = Date.now();
  if (gb.__radarBase && gc.__radarBaseCheck && agora - gc.__radarBaseCheck.at < BASE_CHECK_MS && gc.__radarBaseCheck.key === gb.__radarBase.key) return gb.__radarBase;
  const db = await getDb();
  const [v] = await db.select({ n: sql<number>`count(*)::int`, m: sql<string>`max(${companies.updatedAt})::text` }).from(companies);
  const key = `${v.n}|${v.m}`;
  gc.__radarBaseCheck = { at: agora, key };
  if (gb.__radarBase?.key === key) return gb.__radarBase;
  const t0 = performance.now();
  gb.__radarBaseLoading ??= loadBaseRows()
    .then((rows) => {
      if (process.env.RADAR_TIMING) console.log(`[timing] base lida em ${(performance.now() - t0).toFixed(0)}ms (${rows.length} linhas)`);
      // Texto de busca sem acento fica para a primeira busca por nome (normalize em 500 mil nomes custava segundos).
      const ordenadas: BaseRow[] = rows.map((r) => ({
        ...r,
        busca: null,
        // "id,lng,lat" pronto para o JSON do mapa (4 casas, ~11 m); montar isso a cada busca custava ~1 s.
        geo: r.lat === null || r.lng === null ? null : `${r.id},${Math.round(r.lng * 1e4) / 1e4},${Math.round(r.lat * 1e4) / 1e4}`,
      }));
      let ultima: string | null = null;
      for (const r of rows) if (r.entrouEm && (!ultima || r.entrouEm > ultima)) ultima = r.entrouEm;
      const base: Base = {
        key,
        rows: ordenadas,
        ultima,
      };
      // Base nova (ingestão): situação e dados mudaram, então os scores guardados também.
      scoreCaches.clear();
      if (process.env.RADAR_TIMING) console.log(`[timing] base pronta em ${(performance.now() - t0).toFixed(0)}ms`);
      gb.__radarBase = base;
      return base;
    })
    .finally(() => (gb.__radarBaseLoading = undefined));
  return gb.__radarBaseLoading;
}

/** Municípios presentes na base (autocompletar do filtro). Consulta direta: a página não carrega a base. */
export async function getMunicipios(): Promise<{ uf: string; municipio: string }[]> {
  const db = await getDb();
  return db.selectDistinct({ uf: companies.uf, municipio: companies.municipio }).from(companies).orderBy(companies.municipio);
}

/** Quantas empresas ativas entraram na última atualização mensal (para o aviso do Radar). */
export async function getNovidades(): Promise<{ competencia: string; total: number } | null> {
  const db = await getDb();
  const [row] = await db
    .select({ competencia: companies.entrouEm, total: sql<number>`count(*)::int` })
    .from(companies)
    .where(sql`${companies.entrouEm} = (select max(${companies.entrouEm}) from ${companies}) and ${companies.situacao} = 'ATIVA'`)
    .groupBy(companies.entrouEm);
  return row?.competencia ? { competencia: row.competencia, total: row.total } : null;
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

  // Sem copiar a linha da base: com 500 mil empresas, cada cópia por busca custava centenas de MB.
  const out: Hit[] = [];
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
    if (q && !(r.busca ??= semAcento(`${r.razaoSocial} ${r.nomeFantasia ?? ""}`) + " " + r.cnpj).includes(q) && !(qDigits.length >= 4 && r.cnpj.includes(qDigits))) continue;
    if (naLista && !naLista.has(r.id)) continue;
    if (suprimidos.has(r.cnpj)) continue;
    const s = st.get(r.id) ?? null;
    if (status === "ativos" && s === "descartado") continue;
    if (status === "novo" && s && s !== "novo") continue;
    if (status === "prospectado" && s !== "prospectado") continue;
    if (status === "descartado" && s !== "descartado") continue;
    out.push({ r, status: s, nova });
  }
  return out;
}

// Cache de scores: empresas só mudam na ingestão, e o score depende só dos pesos e da data
// (tempo de atividade). Chave = pesos + dia. Fase 2: tabela company_scores (ARQUITETURA.md).
// Dois níveis: por empresa (consulta direta) e por perfil (perfilDoScore), que evita recalcular o
// mesmo score para centenas de milhares de empresas parecidas.
type ScoreCache = { porId: Map<number, ScoreSummary>; porPerfil: Map<string, ScoreSummary>; now: Date };
const g = globalThis as unknown as { __radarScoreCache?: Map<string, ScoreCache> };
const scoreCaches = (g.__radarScoreCache ??= new Map());

function scoreCacheFor(weights: Weights): ScoreCache {
  const key = new Date().toISOString().slice(0, 10) + JSON.stringify(weights);
  let c = scoreCaches.get(key);
  if (!c) {
    if (scoreCaches.size >= 8) scoreCaches.delete(scoreCaches.keys().next().value!);
    c = { porId: new Map(), porPerfil: new Map(), now: new Date() };
    scoreCaches.set(key, c);
  }
  return c;
}

function cachedScore(cache: ScoreCache, r: BaseRow, weights: Weights): ScoreSummary {
  let s = cache.porId.get(r.id);
  if (!s) {
    const c = { ...r, capitalSocial: r.capitalSocial === null ? null : Number(r.capitalSocial) };
    const perfil = perfilDoScore(c, cache.now);
    s = cache.porPerfil.get(perfil);
    if (!s) {
      s = summarize(scoreCompany(c, weights, cache.now));
      cache.porPerfil.set(perfil, s);
    }
    cache.porId.set(r.id, s);
  }
  return s;
}

export type Ranked = Hit & { s: ScoreSummary };
type Ranking = { total: number; ranked: Ranked[]; scoreKey: ScoreSort };

/**
 * Busca + score + ordenação, sem montar as linhas completas (com 500 mil empresas, montar tudo custava
 * segundos). Resultado reaproveitado por RANKING_TTL_MS para a lista e o mapa da mesma busca.
 */
async function rankCompanies(orgId: string, f: Filters): Promise<Ranking> {
  const [{ weights, version }, base] = await Promise.all([getWeights(orgId), getBase()]);
  const chave = `${orgId}|${base.key}|${version}|${new Date().toISOString().slice(0, 10)}|${serializeFilters(f)}`;
  const hit = rankings.get(chave);
  if (hit && Date.now() - hit.at < RANKING_TTL_MS) return hit.p as Promise<Ranking>;
  const p = (async () => {
    const t0 = performance.now();
    const raw = await rawSearch(orgId, f);
    const t1 = performance.now();
    const key = scoreKeyOf(f);
    const cache = scoreCacheFor(weights);
    // Ordenação por baldes: o score é inteiro de 0 a 100 e a base já está em ordem alfabética,
    // então score decrescente com desempate pelo nome sai numa passada, sem comparar textos.
    const baldes: Ranked[][] = Array.from({ length: 101 }, () => []);
    const min = f.scoreMin ?? 0;
    for (const h of raw) {
      const sc = cachedScore(cache, h.r, weights);
      const v = sc.scores[key];
      if (v >= min) baldes[v].push({ ...h, s: sc });
    }
    const ranked: Ranked[] = [];
    for (let v = 100; v >= 0; v--) for (const x of baldes[v]) ranked.push(x);
    if (process.env.RADAR_TIMING) console.log(`[timing] filtro=${(t1 - t0).toFixed(0)}ms score+ordem=${(performance.now() - t1).toFixed(0)}ms linhas=${ranked.length}`);
    return { total: ranked.length, ranked, scoreKey: key };
  })();
  if (rankings.size >= 6) rankings.delete(rankings.keys().next().value!);
  rankings.set(chave, { at: Date.now(), p });
  p.catch(() => rankings.delete(chave));
  return p;
}

/** Busca do Radar. `rows` é a página pedida; `ranked` é o resultado inteiro, leve (mapa e contagens). */
export async function searchCompanies(orgId: string, f: Filters, opts: { offset?: number; limit?: number } = {}) {
  const { total, ranked, scoreKey } = await rankCompanies(orgId, f);
  const offset = opts.offset ?? 0;
  const slice = opts.limit === undefined ? ranked : ranked.slice(offset, offset + opts.limit);
  return {
    total,
    scoreKey,
    ranked,
    rows: slice.map((x) => toRow(x, x.s)),
    /** Todas as linhas completas: só para exportação e listas (caro com a base inteira). */
    get all() {
      return ranked.map((x) => toRow(x, x.s));
    },
  };
}

/** Base ativa pontuada com pesos arbitrários (prévia da calibração). */
export async function searchCompaniesWith(orgId: string, weights: Weights) {
  const raw = await rawSearch(orgId, parseFilters({}));
  const now = new Date();
  // Só os números, e uma vez por perfil (perfilDoScore): a prévia conta faixas de score.
  const porPerfil = new Map<string, ScoreSummary>();
  return raw.map(({ r }) => {
    const c = { ...r, capitalSocial: r.capitalSocial === null ? null : Number(r.capitalSocial) };
    const perfil = perfilDoScore(c, now);
    let s = porPerfil.get(perfil);
    if (!s) porPerfil.set(perfil, (s = summarize(scoreCompany(c, weights, now))));
    return s;
  });
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
