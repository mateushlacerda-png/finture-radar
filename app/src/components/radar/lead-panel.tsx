"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { restoreCompany } from "@/lib/actions/companies";
import { TIPOS_PARCEIRO } from "@/lib/cnaes";
import { naturezaLabel } from "@/lib/naturezas";
import { etapaLabel, formatActivityBody, FAIXAS_FUNCIONARIOS, FUNIS, PORTES, SCORE_LABELS, SOLUCOES, STATUS_EMPRESA, TIPOS_ATIVIDADE, type ScoreKey, type Solucao } from "@/lib/domain";
import type { CompanyDetail } from "@/lib/queries/companies";
import type { Origin, ScoreResult } from "@/lib/scoring/engine";
import { Badge, Button, cx, DemoBadge, ScorePill, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { IconBan, IconBookmark, IconClose, IconPhone, IconPlus, IconShield } from "@/components/icons";
import { OverviewBlock } from "./overview-block";
import { AddToCrmModal, DiscardModal, LogContactModal, SaveToListModal, SuppressionModal, type Ctx } from "./modals";
import { fantasiaValida, nomeExibicao } from "@/lib/nome";

const ORIGEM: Record<Origin, { label: string; tone: "neutral" | "wine" | "gold" | "success" | "orange" | "ink"; title: string }> = {
  receita: { label: "Receita", tone: "success", title: "Dado do cadastro público da Receita Federal" },
  enriquecimento: { label: "Enriquecimento", tone: "neutral", title: "Dado de provedor de enriquecimento" },
  demo: { label: "Simulado", tone: "wine", title: "Dado gerado para demonstração" },
  premissa: { label: "Premissa", tone: "gold", title: "Hipótese comercial calibrável, não é fato sobre a empresa" },
  calculado: { label: "Calculado", tone: "neutral", title: "Derivado de outros critérios" },
  ausente: { label: "Sem dado", tone: "neutral", title: "Informação não disponível; o critério pontua zero" },
};

const CONF = { alta: "Confiança alta", media: "Confiança média", baixa: "Confiança baixa" };

async function fetchDetail(id: number): Promise<{ data: CompanyDetail } | { error: string }> {
  try {
    const r = await fetch(`/api/companies/${id}`, { cache: "no-store" });
    if (!r.ok) return { error: (await r.json().catch(() => null))?.error ?? "Não foi possível carregar a empresa." };
    return { data: await r.json() };
  } catch {
    return { error: "Sem conexão com o servidor." };
  }
}

const fmtDate = (d: string | Date | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "Não informado");
const fmtCnpj = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);

export function LeadPanel({ id, onClose, ctx, onChanged }: { id: number; onClose: () => void; ctx: Ctx; onChanged: () => void }) {
  const [data, setData] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ScoreKey>("geral");
  const [modal, setModal] = useState<null | "crm" | "list" | "contact" | "discard" | "lgpd">(null);
  const [restoring, startRestore] = useTransition();
  const toast = useToast();

  // O painel é remontado por empresa (key={id} no pai); `version` recarrega depois de uma ação.
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchDetail(id).then((res) => {
      if (!alive) return;
      if ("error" in res) setError(res.error);
      else {
        setError(null);
        setData(res.data);
      }
    });
    return () => {
      alive = false;
    };
  }, [id, version]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !modal && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, modal]);

  const done = () => {
    setModal(null);
    setVersion((v) => v + 1);
    onChanged();
  };

  return (
    <aside className="flex h-full flex-col bg-paper" aria-label="Ficha da empresa" data-company-id={id}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-4 pt-4">
        {data ? (
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              {data.company.isDemo && <DemoBadge />}
              <Badge tone={data.status === "descartado" ? "wine" : data.status === "prospectado" ? "orange" : "neutral"}>
                {STATUS_EMPRESA[data.status as keyof typeof STATUS_EMPRESA]}
              </Badge>
              {data.cnae?.parceria && <Badge tone="ink">{TIPOS_PARCEIRO[data.cnae.parceria].label}</Badge>}
            </div>
            <h2 className="font-display text-xl font-semibold leading-tight">{nomeExibicao(data.company)}</h2>
            {fantasiaValida(data.company.nomeFantasia) && <p className="mt-0.5 truncate text-xs text-muted">{data.company.razaoSocial}</p>}
            <p className="mt-0.5 text-xs text-muted tabular">
              CNPJ {fmtCnpj(data.company.cnpj)}
              {data.company.isDemo && <span className="text-wine"> (fictício)</span>}
            </p>
          </div>
        ) : (
          <div className="w-full space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        )}
        <button onClick={onClose} className="-mr-1 rounded p-1 text-muted hover:bg-ink/5 hover:text-ink" aria-label="Fechar ficha">
          <IconClose />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && <p className="p-5 text-sm text-wine" role="alert">{error}</p>}
        {data && (
          <>
            {data.status === "descartado" && (
              <div className="flex items-center justify-between gap-3 border-b border-line bg-wine/[0.05] px-5 py-2.5 text-sm">
                <span className="text-wine">Descartado: {data.discardReason}</span>
                <Button size="sm" loading={restoring} onClick={() => startRestore(async () => {
                  const r = await restoreCompany({ companyId: id });
                  if (r.ok) { toast("Lead restaurado."); done(); } else toast(r.error, "error");
                })}>Restaurar</Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 border-b border-line px-5 py-3 sm:grid-cols-4">
              <Button variant="primary" size="sm" onClick={() => setModal("crm")} disabled={data.company.situacao !== "ATIVA"}><IconPlus width={15} />CRM</Button>
              <Button size="sm" onClick={() => setModal("list")}><IconBookmark width={15} />Lista</Button>
              <Button size="sm" onClick={() => setModal("contact")}><IconPhone width={15} />Contato</Button>
              <Button size="sm" variant="danger" onClick={() => setModal("discard")} disabled={data.status === "descartado"}><IconBan width={15} />Descartar</Button>
            </div>

            <OverviewBlock data={data} onDone={() => setVersion((v) => v + 1)} />

            <ScoreSection data={data} tab={tab} setTab={setTab} />

            <Block title="Soluções recomendadas">
              {data.recomendadas.length ? (
                <ul className="space-y-2">
                  {data.recomendadas.map((k) => (
                    <li key={k} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{SOLUCOES[k].label}</p>
                        <p className="text-xs text-muted">{SOLUCOES[k].desc}</p>
                      </div>
                      <ScorePill value={data.scores[k].value} size="sm" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Nenhuma solução com score 60 ou mais. Vale qualificar antes de investir tempo.</p>
              )}
            </Block>

            <Block title="Oportunidades">
              {data.opportunities.length ? (
                <ul className="space-y-2">
                  {data.opportunities.map((o) => (
                    <li key={o.id}>
                      <Link href={`/crm/${o.id}`} className="block rounded-md border border-line p-2.5 hover:border-ink/30">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-medium">{SOLUCOES[o.solution as Solucao]?.label ?? o.solution}</span>
                          <Badge tone={o.stage === "ganho" ? "success" : o.stage === "perdido" ? "wine" : "orange"}>{etapaLabel(o.stage)}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {FUNIS[o.funnel as keyof typeof FUNIS]} · {o.ownerName ?? "Sem responsável"}
                          {o.nextAction && ` · Próxima: ${o.nextAction}${o.nextActionAt ? ` (${fmtDate(o.nextActionAt)})` : ""}`}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Ainda não está no CRM.</p>
              )}
            </Block>

            <Block title="Dados cadastrais">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <Dt>Situação</Dt><Dd>{data.company.situacao} {data.company.situacaoDesde && <span className="text-muted">desde {fmtDate(data.company.situacaoDesde)}</span>}</Dd>
                <Dt>Abertura</Dt><Dd>{fmtDate(data.company.dataAbertura)}</Dd>
                <Dt>CNAE principal</Dt><Dd>{data.cnae ? `${data.cnae.code} · ${data.cnae.descricao}` : data.company.cnaePrincipal}</Dd>
                {data.company.cnaesSecundarios.length > 0 && (<><Dt>Secundários</Dt><Dd>{data.company.cnaesSecundarios.join(", ")}</Dd></>)}
                <Dt>Setor</Dt><Dd>{data.cnae?.setorLabel ?? "Não classificado"}</Dd>
                <Dt>Natureza</Dt><Dd>{naturezaLabel(data.company.naturezaJuridica) ?? <NaoConsta />}</Dd>
                <Dt>Porte</Dt><Dd>{PORTES[(data.company.porte ?? "NI") as keyof typeof PORTES]}</Dd>
                <Dt>Capital social</Dt><Dd>{data.company.capitalSocial ? data.company.capitalSocial.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "Não informado"}</Dd>
                <Dt>Funcionários</Dt>
                <Dd>
                  {data.company.funcionariosFaixa ? (
                    <>
                      {FAIXAS_FUNCIONARIOS[data.company.funcionariosFaixa as keyof typeof FAIXAS_FUNCIONARIOS]}{" "}
                      <Badge tone="gold" title={data.company.funcionariosFonte ?? "Estimativa"}>estimativa</Badge>
                    </>
                  ) : (
                    <span className="text-muted" title="Não há fonte pública de número de funcionários por empresa">Não consta</span>
                  )}
                </Dd>
                <Dt>Local</Dt>
                <Dd>
                  {[data.company.bairro, `${data.company.municipio}/${data.company.uf}`].filter(Boolean).join(", ")}
                  <span className="block text-xs text-muted">Precisão no mapa: {data.company.geoPrecision === "endereco" ? "endereço" : data.company.geoPrecision === "cep" ? "CEP" : "município (ponto aproximado)"}</span>
                </Dd>
              </dl>
            </Block>

            <Block title="Contatos cadastrais">
              <p className="mb-2 text-xs text-muted">Contato declarado no cadastro da empresa. Não é contato pessoal de sócio nem garante falar com o decisor.</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <Dt>Telefone</Dt><Dd>{data.company.telefone ?? <NaoConsta />}</Dd>
                <Dt>E-mail</Dt><Dd className="break-all">{data.company.email ?? <NaoConsta />}</Dd>
                <Dt>Site</Dt>
                <Dd className="break-all">
                  {data.company.site ? (
                    <>
                      <a href={data.company.isDemo ? undefined : data.company.site} target="_blank" rel="noopener noreferrer nofollow" className="text-orange-deep hover:underline">
                        {data.company.site.replace(/^https?:\/\//, "")}
                      </a>
                      {data.company.siteFonte && <span className="block text-xs text-muted">{data.company.siteFonte}</span>}
                    </>
                  ) : <NaoConsta />}
                </Dd>
              </dl>
              {data.company.isDemo ? (
                <p className="mt-2 text-xs text-wine">Contatos simulados: telefone com prefixo inexistente e domínios .example.</p>
              ) : (
                <p className="mt-2 text-xs text-muted">Telefone e e-mail: {data.company.sourceRef ?? "cadastro CNPJ da Receita Federal"}.</p>
              )}
            </Block>

            <Block title="Histórico">
              {data.activities.length ? (
                <ol className="space-y-2.5">
                  {data.activities.map((a) => (
                    <li key={a.id} className="border-l-2 border-line pl-3 text-sm">
                      <p className="text-xs text-muted">{new Date(a.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {TIPOS_ATIVIDADE[a.type as keyof typeof TIPOS_ATIVIDADE] ?? a.type} · {a.userName ?? "Sistema"}</p>
                      <p>{formatActivityBody(a.type, a.body)}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">Nenhuma interação registrada.</p>
              )}
            </Block>

            {data.lists.length > 0 && (
              <Block title="Listas">
                <div className="flex flex-wrap gap-1.5">
                  {data.lists.map((l) => <Link key={l.id} href={`/listas/${l.id}`}><Badge>{l.name}</Badge></Link>)}
                </div>
              </Block>
            )}

            {ctx.me.canManage && (
              <div className="px-5 py-4">
                <button onClick={() => setModal("lgpd")} className="flex items-center gap-1.5 text-xs text-muted underline-offset-2 hover:text-wine hover:underline">
                  <IconShield width={14} /> Registrar pedido de oposição ou remoção (LGPD)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {data && (
        <>
          {modal === "crm" && (
            <AddToCrmModal open onClose={() => setModal(null)} onDone={done} ctx={ctx}
              company={{ id, nome: nomeExibicao(data.company), isParceiro: !!data.cnae?.parceria, recomendada: data.recomendadas[0] }} />
          )}
          {modal === "list" && <SaveToListModal open onClose={() => setModal(null)} onDone={done} ctx={ctx} companyIds={[id]} />}
          {modal === "contact" && (
            <LogContactModal open onClose={() => setModal(null)} onDone={done} companyId={id}
              opportunities={data.opportunities.filter((o) => o.stage !== "ganho" && o.stage !== "perdido").map((o) => ({ id: o.id, label: `${SOLUCOES[o.solution as Solucao]?.label} · ${etapaLabel(o.stage)}` }))} />
          )}
          {modal === "discard" && <DiscardModal open onClose={() => setModal(null)} onDone={done} companyId={id} />}
          {modal === "lgpd" && <SuppressionModal open onClose={() => setModal(null)} onDone={() => { setModal(null); onChanged(); onClose(); }} companyId={id} />}
        </>
      )}
    </aside>
  );
}

function ScoreSection({ data, tab, setTab }: { data: CompanyDetail; tab: ScoreKey; setTab: (k: ScoreKey) => void }) {
  const keys: ScoreKey[] = ["geral", "saude", "seguro", "credito", "parceria"];
  const r: ScoreResult = data.scores[tab];
  const total = r.criteria.reduce((a, c) => a + c.weight, 0) || 1;
  return (
    <section className="border-b border-line px-5 py-4" aria-labelledby="score-h">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="score-h" className="eyebrow">Score e justificativa</h3>
        <span className={cx("text-xs", r.confidence === "baixa" ? "text-wine" : "text-muted")}>{CONF[r.confidence]}</span>
      </div>
      <div className="mb-4 grid grid-cols-5 gap-1.5" role="tablist" aria-label="Scores">
        {keys.map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={cx("pressable flex flex-col items-center gap-1 rounded-md border px-1 py-2 transition-[background-color,border-color,box-shadow,transform] duration-150", tab === k ? "border-ink bg-cream-2/60 shadow-[var(--shadow-card)]" : "border-line hover:border-ink/30")}>
            <ScorePill value={data.scores[k].value} size="sm" label={SCORE_LABELS[k]} />
            <span className="text-[11px] text-ink/75">{SCORE_LABELS[k]}</span>
          </button>
        ))}
      </div>
      {r.note && <p className="mb-3 rounded-md bg-cream-2 px-3 py-2 text-xs text-ink/80">{r.note}</p>}
      <ul className="space-y-3" role="tabpanel">
        {r.criteria.map((c) => {
          const share = Math.round((c.weight / total) * 100);
          const o = ORIGEM[c.origin];
          return (
            <li key={c.key}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{c.label}</span>
                <span className="shrink-0 text-xs text-muted tabular">peso {share}% · {Math.round(c.points * 100)} pts</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]" aria-hidden>
                <div className="h-full origin-left animate-grow-x rounded-full bg-orange [animation-duration:450ms]" style={{ width: `${c.points * 100}%` }} />
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink/75">
                <span>{c.evidence}</span>
                <Badge tone={o.tone} title={o.title}>{o.label}</Badge>
                {c.isEstimate && <Badge tone="gold" title="Valor estimado, não observado">estimativa</Badge>}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-4">
      <h3 className="eyebrow mb-2.5">{title}</h3>
      {children}
    </section>
  );
}
const NaoConsta = () => <span className="text-muted">Não consta</span>;
const Dt = ({ children }: { children: React.ReactNode }) => <dt className="text-muted">{children}</dt>;
const Dd = ({ children, className }: { children: React.ReactNode; className?: string }) => <dd className={cx("min-w-0", className)}>{children}</dd>;
