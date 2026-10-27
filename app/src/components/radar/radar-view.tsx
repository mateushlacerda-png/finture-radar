"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { saveSearch } from "@/lib/actions/lists";
import { SETORES, TIPOS_PARCEIRO, type TipoParceiro } from "@/lib/cnaes";
import { FAIXAS_FUNCIONARIOS, REGIOES, SCORE_LABELS, SOLUCOES, type Solucao } from "@/lib/domain";
import { countActive, parseFilters, serializeFilters, scoreKeyOf, type Filters } from "@/lib/filters";
import type { RadarRow } from "@/lib/queries/companies";
import { Badge, Button, cx, DemoBadge, EmptyState, Input, Label, Modal, ScorePill, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { IconBookmark, IconChevron, IconClose, IconDownload, IconFilter, IconList, IconMap, IconSearch } from "@/components/icons";
import { FilterPanel } from "./filter-panel";
import { RadarIntro, type Escolha } from "./intro";
import { LeadPanel } from "./lead-panel";
import { SaveToListModal, type Ctx } from "./modals";
import type { Point } from "./map-view";

const MapView = dynamic(() => import("./map-view").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-cream-2/60" />,
});

type ListResp = { total: number; page: number; size: number; scoreKey: string; rows: RadarRow[] };
type GeoResp = { total: number; scoreKey: string; limitado: boolean; points: Point[] };

// Larguras dos painéis flutuantes no desktop (px); o mapa centraliza no espaço que sobra.
const FILTROS_W = 300;
const LISTA_W = 384;
const GAP = 12;

const MODOS = [
  ["parceiro", "Parceiros"],
  ["cliente", "Clientes"],
  [undefined, "Todos"],
] as const;

const STATUS_LABEL: Record<string, string> = { novo: "Só não prospectadas", prospectado: "Só prospectadas", descartado: "Só descartadas", todos: "Inclui descartadas" };

function useDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 768px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => true,
  );
}

/** Filtros ativos em forma de etiqueta removível (o tipo e a busca já aparecem na barra). */
function chipsOf(f: Filters): { key: string; label: string; clear: Partial<Filters> }[] {
  const c: { key: string; label: string; clear: Partial<Filters> }[] = [];
  if (f.solucao) c.push({ key: "solucao", label: SOLUCOES[f.solucao as Solucao].label, clear: { solucao: undefined } });
  if (f.scoreMin) c.push({ key: "score", label: `Score ${f.scoreMin}+`, clear: { scoreMin: undefined } });
  if (f.regiao) c.push({ key: "regiao", label: REGIOES[f.regiao].label, clear: { regiao: undefined } });
  if (f.uf.length) c.push({ key: "uf", label: f.uf.join(", "), clear: { uf: [] } });
  if (f.municipio) c.push({ key: "mun", label: f.municipio, clear: { municipio: undefined } });
  if (f.setor) c.push({ key: "setor", label: SETORES[f.setor as keyof typeof SETORES], clear: { setor: undefined, cnae: undefined } });
  if (f.cnae) c.push({ key: "cnae", label: `CNAE ${f.cnae}`, clear: { cnae: undefined } });
  if (f.porte.length) c.push({ key: "porte", label: `Porte ${f.porte.map((p) => (p === "DEMAIS" ? "médio/grande" : p === "NI" ? "n/i" : p)).join("/")}`, clear: { porte: [] } });
  if (f.func.length) c.push({ key: "func", label: `${f.func.map((x) => FAIXAS_FUNCIONARIOS[x]).join(", ")} func.`, clear: { func: [] } });
  if (f.idadeMin !== undefined || f.idadeMax !== undefined) c.push({ key: "idade", label: `${f.idadeMin ?? 0} a ${f.idadeMax ?? "∞"} anos`, clear: { idadeMin: undefined, idadeMax: undefined } });
  if (f.status) c.push({ key: "status", label: STATUS_LABEL[f.status] ?? f.status, clear: { status: undefined } });
  if (f.contato) c.push({ key: "contato", label: "Com contato", clear: { contato: undefined } });
  if (f.recentes) c.push({ key: "recentes", label: "Novas na base", clear: { recentes: undefined } });
  return c;
}

export type Novidades = { competencia: string; total: number } | null;

export function RadarView({ initialQuery, ctx, municipios, listName, initialSelected, novidades }: { initialQuery: string; ctx: Ctx; municipios: { uf: string; municipio: string }[]; listName?: string; initialSelected?: number; novidades?: Novidades }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const desktop = useDesktop();
  // Sem filtro nenhum na URL, o Radar começa perguntando quem a pessoa procura.
  const [stage, setStage] = useState<"ask" | "ready">(initialQuery || initialSelected ? "ready" : "ask");
  const [filters, setFilters] = useState<Filters>(() => parseFilters(new URLSearchParams(initialQuery)));
  const query = useMemo(() => serializeFilters(filters), [filters]);
  const [selected, setSelected] = useState<number | null>(initialSelected ?? null);
  const [points, setPoints] = useState<Point[]>([]);
  const [list, setList] = useState<RadarRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  // Carregando = a última resposta recebida não é da consulta atual (derivado, sem setState no efeito).
  const [loaded, setLoaded] = useState<{ key: string; error: string | null } | null>(null);
  const [mobileTab, setMobileTab] = useState<"mapa" | "lista">("lista");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [modal, setModal] = useState<null | "search" | "bulk">(null);
  const [allIds, setAllIds] = useState<number[]>([]);
  const [geoKey, setGeoKey] = useState<string | null>(null);
  const [mapaInfo, setMapaInfo] = useState<{ mostrados: number; total: number } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [q, setQ] = useState(filters.q ?? "");
  const reqId = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const scoreKey = scoreKeyOf(filters);

  // URL é a fonte de verdade dos filtros (link compartilhável).
  useEffect(() => {
    const url = query ? `${pathname}?${query}` : pathname;
    window.history.replaceState(null, "", url);
  }, [query, pathname]);

  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.q ?? "") !== q) setFilters((f) => ({ ...f, q: q || undefined }));
    }, 350);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  // "/" leva à busca, como em ferramentas de desenvolvedor.
  useEffect(() => {
    if (stage !== "ready") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key !== "/" || t.closest("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage]);

  const loadKey = `${query}#${reloadKey}`;
  const loading = loaded?.key !== loadKey;
  const error = loading ? null : loaded.error;

  useEffect(() => {
    if (stage !== "ready") return;
    const id = ++reqId.current;
    const key = `${query}#${reloadKey}`;
    // Lista e mapa chegam separados: a lista (40 linhas) aparece sem esperar o mapa (até 120 mil pontos).
    const falhou = (r: Response | undefined) => {
      if (id !== reqId.current) return;
      if (r?.status === 401) router.push("/login");
      setLoaded({ key, error: "Não foi possível carregar as empresas. Tente de novo." });
    };
    fetch(`/api/companies?${query}&page=0`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((l: ListResp) => {
        if (id !== reqId.current) return;
        setList(l.rows);
        setTotal(l.total);
        setPage(0);
        setLoaded({ key, error: null });
      })
      .catch(falhou);
    fetch(`/api/companies/geo?${query}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((geo: GeoResp) => {
        if (id !== reqId.current) return;
        setPoints(geo.points);
        setAllIds(geo.limitado ? [] : geo.points.map((p) => p[0]));
        setMapaInfo(geo.limitado ? { mostrados: geo.points.length, total: geo.total } : null);
        setGeoKey(key);
      })
      .catch(falhou);
  }, [query, reloadKey, router, stage]);

  const loadMore = async () => {
    const next = page + 1;
    const r = await fetch(`/api/companies?${query}&page=${next}`, { cache: "no-store" });
    if (!r.ok) return;
    const l: ListResp = await r.json();
    setList((prev) => [...prev, ...l.rows]);
    setPage(next);
  };

  const patch = useCallback((p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p })), []);
  const reset = () => {
    setQ("");
    setFilters((f) => ({ ...parseFilters(new URLSearchParams(f.lista ? `lista=${f.lista}` : "")), tipo: f.tipo }));
  };
  const setTipo = (v: Filters["tipo"]) =>
    patch({ tipo: v, solucao: v === "parceiro" ? undefined : v === "cliente" && filters.solucao === "parceria" ? undefined : filters.solucao });
  const pick = (e: Escolha) => {
    if (e === "novas") patch({ recentes: "1" });
    else if (e !== "todos") patch({ tipo: e });
    setStage("ready");
  };

  const fitKey = [filters.uf.join(), filters.regiao, filters.municipio, filters.lista, filters.tipo, filters.setor, filters.cnae].join("|");
  const nAtivos = countActive(filters) - (filters.tipo ? 1 : 0) - (filters.q ? 1 : 0);
  const chips = chipsOf(filters);
  const modoIdx = MODOS.findIndex(([v]) => v === filters.tipo);

  const pad = useMemo(
    () =>
      desktop
        ? { top: 76 + (chips.length || listName ? 36 : 0), right: listOpen ? LISTA_W + GAP * 2 : 0, bottom: 0, left: filtersOpen ? FILTROS_W + GAP * 2 : 0 }
        : { top: 140, right: 0, bottom: 0, left: 0 },
    [desktop, chips.length, listName, listOpen, filtersOpen],
  );

  if (stage === "ask") return <RadarIntro onPick={pick} novidades={novidades ?? null} />;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Mapa: tela inteira, por baixo de tudo */}
      <div className={cx("absolute inset-0", mobileTab === "lista" && "max-md:hidden")}>
        <MapView points={points} selectedId={selected} onSelect={setSelected} fitKey={fitKey} loading={geoKey !== loadKey} pad={pad} />
        {mapaInfo && geoKey === loadKey && (
          <p
            className="pointer-events-none absolute z-10 w-max max-w-[min(420px,calc(100%-2rem))] -translate-x-1/2 rounded-xl bg-ink/85 px-3 py-1.5 text-center text-[11px] leading-snug text-cream shadow-[var(--shadow-pop)] backdrop-blur max-md:top-3"
            style={{ left: `calc(${pad.left}px + (100% - ${pad.left + pad.right}px) / 2)`, top: pad.top ? pad.top + 8 : undefined }}
          >
            O mapa mostra as {mapaInfo.mostrados.toLocaleString("pt-BR")} de maior score, de {mapaInfo.total.toLocaleString("pt-BR")}. Refine os filtros para ver todas.
          </p>
        )}
      </div>

      {/* Camada flutuante: barra, etiquetas, filtros e lista */}
      <div className="relative flex min-h-0 flex-1 flex-col md:pointer-events-none md:gap-3 md:p-3">
        <div className="stagger flex flex-col gap-2 max-md:border-b max-md:border-line max-md:bg-paper max-md:p-2.5">
          {/* Barra de comando */}
          <div className="glass pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl p-1.5 max-md:!border-0 max-md:!bg-transparent max-md:!p-0 max-md:!shadow-none max-md:backdrop-blur-none">
            <div className="relative grid grid-cols-3 rounded-xl bg-ink/[0.05] p-1 max-md:w-full" role="radiogroup" aria-label="Quem procurar">
              <span
                aria-hidden
                className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_2px_6px_-2px_rgba(27,26,26,0.5)] transition-transform duration-300 ease-[var(--ease-out)]"
                style={{ transform: `translateX(${Math.max(modoIdx, 0) * 100}%)` }}
              />
              {MODOS.map(([v, l]) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={filters.tipo === v}
                  onClick={() => setTipo(v)}
                  className={cx("pressable relative z-10 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200", filters.tipo === v ? "text-cream" : "text-ink/60 hover:text-ink")}
                >
                  {l}
                </button>
              ))}
            </div>

            <div className="relative min-w-[160px] flex-1">
              <IconSearch width={16} height={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nome ou CNPJ"
                aria-label="Buscar por nome ou CNPJ"
                className="h-9 w-full rounded-xl bg-transparent pl-9 pr-9 text-sm outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-muted focus:bg-paper focus:shadow-[0_0_0_1px_rgba(234,98,45,0.5),0_0_0_4px_rgba(234,98,45,0.12)] focus-visible:outline-none max-md:border max-md:border-line max-md:bg-paper"
              />
              {q ? (
                <button onClick={() => setQ("")} className="pressable absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-ink/5 hover:text-ink" aria-label="Limpar busca">
                  <IconClose width={13} height={13} />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 text-[10px] text-muted md:block">/</kbd>
              )}
            </div>

            {novidades && novidades.total > 0 && !filters.recentes && (
              <button
                type="button"
                onClick={() => patch({ recentes: "1" })}
                title={`Empresas que entraram na base com a atualização da Receita de ${novidades.competencia}`}
                className="pressable flex h-9 items-center gap-1.5 rounded-xl bg-success/10 px-3 text-[13px] font-medium text-success transition-colors hover:bg-success/15"
              >
                <span className="relative flex size-1.5" aria-hidden>
                  <span className="absolute inset-0 rounded-full bg-success [animation:ping-soft_1.6s_var(--ease-out)_3]" />
                  <span className="relative size-1.5 rounded-full bg-success" />
                </span>
                {novidades.total.toLocaleString("pt-BR")} novas
              </button>
            )}

            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              aria-controls="radar-filtros"
              className={cx(
                "pressable flex h-9 items-center gap-2 rounded-xl px-3 text-[13px] font-medium transition-colors duration-150",
                filtersOpen ? "bg-ink text-cream" : "text-ink/75 hover:bg-ink/5 hover:text-ink max-md:border max-md:border-line max-md:bg-paper",
              )}
            >
              <IconFilter width={15} height={15} />
              Filtros
              {nAtivos > 0 && <span className="grid min-w-4 place-items-center rounded-full bg-orange px-1 text-[10px] font-semibold leading-4 text-white tabular">{nAtivos}</span>}
            </button>

            <span className="mx-0.5 hidden h-5 w-px bg-line md:block" aria-hidden />
            <div className="flex items-center gap-0.5">
              <IconBtn label="Salvar pesquisa" onClick={() => setModal("search")}><IconBookmark width={16} height={16} /></IconBtn>
              <IconBtn label="Salvar resultado em lista" onClick={() => setModal("bulk")} disabled={!allIds.length || allIds.length > 5000 || (total ?? 0) > 5000}><IconList width={16} height={16} /></IconBtn>
              <a
                href={`/api/companies/export?${query}`}
                download
                aria-label="Exportar CSV"
                title="Exportar CSV"
                className="pressable grid size-9 place-items-center rounded-xl text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink"
              >
                <IconDownload width={16} height={16} />
              </a>
            </div>
          </div>

          {/* Etiquetas dos filtros ativos */}
          {(chips.length > 0 || listName) && (
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5" aria-label="Filtros ativos">
              {listName && (
                <span className="flex h-7 items-center gap-1.5 rounded-full bg-ink pl-3 pr-1 text-xs text-cream shadow-[var(--shadow-lift)]">
                  Lista: {listName}
                  <button onClick={() => { patch({ lista: undefined }); router.replace("/radar"); }} aria-label="Sair da lista" className="pressable grid size-5 place-items-center rounded-full hover:bg-white/10">
                    <IconClose width={11} height={11} />
                  </button>
                </span>
              )}
              {chips.map((c) => (
                <span key={c.key} className="animate-enter flex h-7 items-center gap-1 rounded-full border border-line bg-paper/90 pl-3 pr-1 text-xs text-ink/80 shadow-[var(--shadow-card)] backdrop-blur [animation-duration:250ms]">
                  {c.label}
                  <button onClick={() => patch(c.clear)} aria-label={`Remover filtro ${c.label}`} className="pressable grid size-5 place-items-center rounded-full text-muted transition-colors hover:bg-ink/5 hover:text-ink">
                    <IconClose width={11} height={11} />
                  </button>
                </span>
              ))}
              {chips.length > 1 && (
                <button onClick={reset} className="pressable h-7 rounded-full px-2.5 text-xs text-muted transition-colors hover:bg-paper/80 hover:text-ink">
                  Limpar tudo
                </button>
              )}
            </div>
          )}
        </div>

        {/* Abas mobile */}
        <div className="relative grid grid-cols-2 border-b border-line bg-paper md:hidden" role="tablist">
          <span aria-hidden className="absolute bottom-0 left-0 h-0.5 w-1/2 bg-orange transition-transform duration-300 ease-[var(--ease-out)]" style={{ transform: `translateX(${mobileTab === "lista" ? 0 : 100}%)` }} />
          {(["lista", "mapa"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={mobileTab === t} onClick={() => setMobileTab(t)}
              className={cx("flex items-center justify-center gap-1.5 py-2 text-sm transition-colors", mobileTab === t ? "font-medium text-ink" : "text-muted")}>
              {t === "lista" ? <IconList width={15} /> : <IconMap width={15} />}{t === "lista" ? "Lista" : "Mapa"}
            </button>
          ))}
        </div>

        <div className="relative flex min-h-0 flex-1 gap-3">
          {/* Filtros: painel flutuante no desktop, gaveta no mobile */}
          <div
            id="radar-filtros"
            inert={!filtersOpen}
            aria-label="Filtros"
            className={cx(
              "glass pointer-events-auto flex flex-col overflow-hidden",
              "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-[300px] max-md:!bg-paper",
              "md:max-h-full md:shrink-0 md:self-start md:rounded-2xl",
              "transition-[opacity,transform] duration-300 ease-[var(--ease-drawer)]",
              filtersOpen ? "translate-x-0 opacity-100" : "pointer-events-none opacity-0 max-md:-translate-x-full md:-translate-x-2",
            )}
            style={desktop ? { width: FILTROS_W } : undefined}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="font-display text-sm font-semibold">Filtros {nAtivos > 0 && <span className="text-orange">· {nAtivos}</span>}</p>
              <div className="flex items-center gap-1">
                {nAtivos > 0 && <button onClick={reset} className="pressable rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-ink/5 hover:text-ink">Limpar</button>}
                <button onClick={() => setFiltersOpen(false)} aria-label="Fechar filtros" className="pressable grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-ink/5 hover:text-ink">
                  <IconClose width={15} height={15} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <FilterPanel filters={filters} onChange={patch} municipios={municipios} ultimaCompetencia={novidades?.competencia ?? null} />
            </div>
          </div>
          <div
            className={cx("fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] transition-opacity duration-300 md:hidden", filtersOpen ? "opacity-100" : "pointer-events-none opacity-0")}
            onClick={() => setFiltersOpen(false)}
            aria-hidden
          />

          <div className="flex-1" />

          {/* Lista de resultados */}
          <div
            inert={desktop && !listOpen}
            className={cx(
              "glass pointer-events-auto flex min-h-0 flex-col overflow-hidden",
              "max-md:absolute max-md:inset-0 max-md:!rounded-none max-md:!border-0 max-md:!bg-paper max-md:!shadow-none",
              "md:shrink-0 md:rounded-2xl",
              "transition-[opacity,transform] duration-300 ease-[var(--ease-drawer)]",
              mobileTab === "mapa" && "max-md:hidden",
              !listOpen && "md:pointer-events-none md:translate-x-3 md:opacity-0",
            )}
            style={desktop ? { width: LISTA_W } : undefined}
          >
            <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <p className="min-w-0 truncate text-xs text-muted" aria-live="polite">
                {total === null ? "Carregando…" : <><strong className="font-display text-sm font-semibold text-ink tabular">{total.toLocaleString("pt-BR")}</strong> empresas · ordenadas por score {SCORE_LABELS[scoreKey]}</>}
              </p>
              <button onClick={() => setListOpen(false)} className="pressable hidden size-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-ink/5 hover:text-ink md:grid" aria-label="Recolher lista" title="Recolher lista">
                <IconChevron width={15} height={15} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {error ? (
                <EmptyState title="Erro ao carregar">{error} <Button size="sm" className="mt-3" onClick={() => setReloadKey((k) => k + 1)}>Tentar de novo</Button></EmptyState>
              ) : loading && !list.length ? (
                <ul className="divide-y divide-line">{Array.from({ length: 8 }, (_, i) => <li key={i} className="flex gap-3 p-4"><Skeleton className="size-8 shrink-0" /><span className="flex-1 space-y-2"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/2" /></span></li>)}</ul>
              ) : list.length === 0 ? (
                <EmptyState title="Nenhuma empresa com esses filtros">Afrouxe o score mínimo ou amplie a região.</EmptyState>
              ) : (
                <>
                  <ul className={cx("divide-y divide-line/70 transition-[opacity,filter] duration-200", loading && "opacity-50 blur-[1px]")}>
                    {list.map((r) => (
                      <li key={r.id}>
                        <button onClick={() => setSelected(r.id)} aria-current={selected === r.id || undefined}
                          className={cx("group relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-ink/[0.03]", selected === r.id && "bg-orange-soft/50")}>
                          <span aria-hidden className={cx("absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-orange transition-transform duration-200 ease-[var(--ease-out)]", selected === r.id ? "scale-y-100" : "scale-y-0")} />
                          <ScorePill value={r.scores[scoreKey]} size="sm" label={`Score ${SCORE_LABELS[scoreKey]}`} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium transition-colors group-hover:text-orange-deep">{r.nome}</span>
                            <span className="block truncate text-xs text-muted">
                              {r.municipio}/{r.uf} · {r.parceiroTipo ? TIPOS_PARCEIRO[r.parceiroTipo as TipoParceiro].label : r.setor}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            {r.nova && <Badge tone="success" title={novidades ? `Entrou na base com a atualização de ${novidades.competencia}` : undefined}>Nova na base</Badge>}
                            {r.status === "prospectado" && <Badge tone="orange">Prospectada</Badge>}
                            {r.status === "descartado" && <Badge tone="wine">Descartada</Badge>}
                            {r.confianca === "baixa" && <Badge tone="gold" title="Poucos critérios com dado real">incompleto</Badge>}
                          </span>
                          <IconChevron width={14} height={14} className="shrink-0 -translate-x-1 text-muted opacity-0 transition-[opacity,transform] duration-200 ease-[var(--ease-out)] group-hover:translate-x-0 group-hover:opacity-100" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  {total !== null && list.length < total && (
                    <div className="p-3"><Button size="sm" className="w-full" onClick={loadMore}>Carregar mais ({(total - list.length).toLocaleString("pt-BR")} restantes)</Button></div>
                  )}
                  {list.some((r) => r.isDemo) && (
                    <p className="flex items-center justify-center gap-2 px-4 pb-4 pt-1 text-center text-[11px] text-muted"><DemoBadge /> Base de demonstração</p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Lista recolhida: só a contagem, para reabrir */}
          {desktop && !listOpen && (
            <button
              onClick={() => setListOpen(true)}
              className="glass pressable animate-enter pointer-events-auto absolute right-0 top-0 flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13px] font-medium"
            >
              <IconList width={15} height={15} className="text-orange" />
              {total === null ? "Lista" : <><span className="font-display tabular">{total.toLocaleString("pt-BR")}</span> empresas</>}
            </button>
          )}
        </div>
      </div>

      {/* Ficha */}
      {selected !== null && (
        <div className="drawer-right fixed inset-0 z-50 md:absolute md:inset-y-3 md:left-auto md:right-3 md:w-[440px] md:overflow-hidden md:rounded-2xl md:border md:border-line md:shadow-[var(--shadow-pop)]">
          <LeadPanel key={selected} id={selected} ctx={ctx} onClose={() => setSelected(null)} onChanged={() => setReloadKey((k) => k + 1)} />
        </div>
      )}

      {modal === "search" && <SaveSearchModal query={query} onClose={() => setModal(null)} onSaved={() => { setModal(null); toast("Pesquisa salva em Listas."); }} />}
      {modal === "bulk" && (
        <SaveToListModal open onClose={() => setModal(null)} onDone={() => setModal(null)} ctx={ctx} companyIds={allIds} title="Salvar resultado em lista" />
      )}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="pressable grid size-9 place-items-center rounded-xl text-ink/70 transition-colors hover:bg-ink/5 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SaveSearchModal({ query, onClose, onSaved }: { query: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="Salvar pesquisa">
      <form onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveSearch({ name, query }); if (r.ok) onSaved(); else setError(r.error); }); }} className="space-y-3">
        <p className="text-sm text-muted">Guarda a combinação de filtros atual para reabrir depois. Os resultados são recalculados a cada abertura.</p>
        <div>
          <Label htmlFor="ss-name">Nome</Label>
          <Input id="ss-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={80} placeholder="Ex.: Imobiliárias RJ, score 70+" />
        </div>
        {error && <p role="alert" className="text-sm text-wine">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" loading={pending} disabled={name.trim().length < 2}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}
