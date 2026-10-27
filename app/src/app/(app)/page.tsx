import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell";
import { Card } from "@/components/ui";
import { IconArrowRight } from "@/components/icons";
import { cx } from "@/lib/cx";
import { EvolucaoChart, UfChart } from "@/components/dashboard/charts";
import { SERIE_1, SERIE_2 } from "@/components/dashboard/palette";
import { requireSession } from "@/lib/auth/session";
import { SOLUCOES } from "@/lib/domain";
import { getDashboard, PERIODOS, type Periodo } from "@/lib/queries/dashboard";
import { getDataMode } from "@/lib/queries/data-mode";

export const metadata: Metadata = { title: "Dashboard" };

const n = (v: number) => v.toLocaleString("pt-BR");

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const s = await requireSession();
  const { periodo: p } = await searchParams;
  const periodo: Periodo = p && p in PERIODOS ? (p as Periodo) : "90";
  const [d, mode] = await Promise.all([getDashboard(s.orgId, periodo), getDataMode()]);
  const maxFunil = d.conversao[0]?.n || 1;
  const maxPipe = Math.max(1, ...d.pipeline.map((x) => x.abertas + x.ganhas));
  const maxAder = Math.max(1, ...d.aderencia.map((x) => x.empresas));
  const maxCid = Math.max(1, ...d.porCidade.map((x) => x.n));

  return (
    <div className="pb-10">
      <PageHeader eyebrow={`Olá, ${s.name.split(" ")[0]}`} title="Visão comercial">
        <nav className="flex rounded-lg border border-line bg-paper p-0.5 text-sm shadow-[var(--shadow-card)]" aria-label="Período">
          {(Object.entries(PERIODOS) as [Periodo, string][]).map(([k, l]) => (
            <Link key={k} href={`/?periodo=${k}`} aria-current={k === periodo ? "true" : undefined}
              className={cx("pressable rounded-md px-2.5 py-1 transition-colors duration-150", k === periodo ? "bg-ink text-cream shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]" : "text-ink/65 hover:bg-ink/5 hover:text-ink")}>
              {l}
            </Link>
          ))}
        </nav>
      </PageHeader>

      <div className="stagger space-y-4 px-4 md:px-8">
        <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Kpi label="Empresas mapeadas" value={n(d.kpis.totalEmpresas)} hint={`${n(d.baseAtiva)} ativas no Radar`} href="/radar" />
          <Kpi label="Leads qualificados" value={n(d.kpis.qualificados)} hint={`criados em ${PERIODOS[periodo]}`} />
          <Kpi label="Em prospecção" value={n(d.kpis.emProspeccao)} hint="empresas com contato ou CRM" href="/radar?status=prospectado" />
          <Kpi label="Oportunidades abertas" value={n(d.kpis.abertas)} hint="todas as etapas abertas" href="/crm" accent />
          <Kpi label="Ganhas" value={n(d.kpis.ganhas)} hint={`das criadas em ${PERIODOS[periodo]}`} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
          <Panel title="Conversão por etapa" sub={`Oportunidades criadas em ${PERIODOS[periodo]} que chegaram a cada etapa`}>
            <ol className="space-y-1.5">
              {d.conversao.map((c, i) => (
                <li key={c.etapa} className="grid grid-cols-[10rem_1fr_3rem] items-center gap-3 text-sm" title={`${c.etapa}: ${c.n}`}>
                  <span className="truncate text-ink/80">{c.etapa}</span>
                  <span className="h-5 rounded-sm bg-ink/[0.05]">
                    <span className="block h-full origin-left animate-grow-x rounded-sm" style={{ width: `${(c.n / maxFunil) * 100}%`, background: SERIE_1, opacity: 1 - i * 0.07, animationDelay: `${120 + i * 45}ms` }} />
                  </span>
                  <span className="text-right tabular">
                    <strong className="font-display">{c.n}</strong>
                    {c.taxa !== null && <span className="block text-[10px] leading-none text-muted">{c.taxa}%</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title="Pipeline por solução" sub="Oportunidades abertas e ganhas, todas as datas">
            <Legend items={[["Abertas", SERIE_1], ["Ganhas", SERIE_2]]} />
            <ul className="mt-3 space-y-3">
              {d.pipeline.map((x) => (
                <li key={x.solucao} className="text-sm">
                  <div className="mb-1 flex justify-between">
                    <span>{SOLUCOES[x.solucao].label}</span>
                    <span className="text-muted tabular">{x.abertas} {x.abertas === 1 ? "aberta" : "abertas"} · {x.ganhas} {x.ganhas === 1 ? "ganha" : "ganhas"}</span>
                  </div>
                  <div className="flex h-3 origin-left animate-grow-x gap-[2px]" aria-hidden>
                    <span className="rounded-l-sm" style={{ width: `${(x.abertas / maxPipe) * 100}%`, background: SERIE_1 }} />
                    <span className="rounded-r-sm" style={{ width: `${(x.ganhas / maxPipe) * 100}%`, background: SERIE_2 }} />
                  </div>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Evolução da prospecção" sub="Por semana">
            <Legend items={[["Oportunidades criadas", SERIE_1], ["Ganhas", SERIE_2]]} />
            {d.evolucao.length ? <EvolucaoChart data={d.evolucao} /> : <p className="py-10 text-center text-sm text-muted">Sem movimento no período.</p>}
          </Panel>
          <Panel title="Oportunidades por estado" sub={`Criadas em ${PERIODOS[periodo]}`}>
            {d.porUf.length ? <UfChart data={d.porUf} /> : <p className="py-10 text-center text-sm text-muted">Sem oportunidades no período.</p>}
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="Desempenho por responsável" sub={`Abertas hoje; ganhas, perdidas e atividades em ${PERIODOS[periodo]}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="py-2 font-medium">Responsável</th>
                    <th className="py-2 text-right font-medium">Abertas</th>
                    <th className="py-2 text-right font-medium">Ganhas</th>
                    <th className="py-2 text-right font-medium">Perdidas</th>
                    <th className="py-2 text-right font-medium">Taxa de ganho</th>
                    <th className="py-2 text-right font-medium">Atividades</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {d.responsaveis.map((r) => (
                    <tr key={r.ownerId} className="border-b border-line last:border-0">
                      <td className="py-2">{r.name}</td>
                      <td className="py-2 text-right">{r.abertas}</td>
                      <td className="py-2 text-right font-medium">{r.ganhas}</td>
                      <td className="py-2 text-right text-muted">{r.perdidas}</td>
                      <td className="py-2 text-right">{r.conversao === null ? "–" : `${r.conversao}%`}</td>
                      <td className="py-2 text-right">{r.atividades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Cidades com mais oportunidades" sub={`Criadas em ${PERIODOS[periodo]}`}>
            <ul className="space-y-1.5">
              {d.porCidade.map((c) => (
                <li key={c.municipio + c.uf} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
                  <span className="relative">
                    <span className="absolute inset-y-0 left-0 origin-left animate-grow-x rounded-sm bg-orange-soft" style={{ width: `${(c.n / maxCid) * 100}%` }} aria-hidden />
                    <span className="relative px-1.5">{c.municipio}/{c.uf}</span>
                  </span>
                  <span className="font-display font-semibold tabular">{c.n}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <Panel title="Aderência da base às soluções" sub="Empresas ativas no Radar com score 60+ e 80+ em cada solução, pelos pesos atuais">
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {d.aderencia.map((a) => (
              <li key={a.solucao}>
                <Link href={`/radar?solucao=${a.solucao}&scoreMin=60`} className="lift pressable group block rounded-lg border border-line bg-paper p-3.5 hover:border-orange/40">
                  <p className="flex items-center justify-between text-sm font-medium">{SOLUCOES[a.solucao].label}<IconArrowRight width={14} height={14} className="-translate-x-1 text-orange opacity-0 transition-[opacity,transform] duration-200 ease-[var(--ease-out)] group-hover:translate-x-0 group-hover:opacity-100" /></p>
                  <p className="mt-1 font-display text-2xl font-semibold tabular">{n(a.empresas)}</p>
                  <p className="text-xs text-muted">{n(a.fortes)} com score 80+</p>
                  <div className="mt-2 h-1.5 rounded-full bg-ink/[0.06]" aria-hidden>
                    <div className="h-full origin-left animate-grow-x rounded-full" style={{ width: `${(a.empresas / maxAder) * 100}%`, background: SERIE_1 }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        <p className="text-xs text-muted">
          {mode.kind === "demo"
            ? "Todos os números desta tela vêm da base de demonstração (dados simulados)."
            : `Empresas: cadastro CNPJ da Receita Federal${mode.competencia ? `, competência ${mode.competencia}` : ""}. Oportunidades e atividades: registradas pela equipe nesta plataforma.`}
        </p>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, href, accent }: { label: string; value: string; hint: string; href?: string; accent?: boolean }) {
  const body = (
    <Card spotlight className={cx("group h-full overflow-hidden p-4", href && "lift hover:border-ink/20", accent && "border-orange/40")}>
      {accent && <span className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-orange/15 blur-2xl" aria-hidden />}
      <p className="eyebrow flex items-center justify-between">
        {label}
        {href && <IconArrowRight width={13} height={13} className="-translate-x-1 text-orange opacity-0 transition-[opacity,transform] duration-200 ease-[var(--ease-out)] group-hover:translate-x-0 group-hover:opacity-100" />}
      </p>
      <p className={cx("mt-2.5 font-display text-[30px] font-semibold leading-none tracking-tight tabular", accent && "text-orange-deep")}>{value}</p>
      <p className="mt-2 text-xs text-muted">{hint}</p>
    </Card>
  );
  return href ? <Link href={href} className="pressable block">{body}</Link> : body;
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Card className="p-4 md:p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold"><span className="size-1.5 rounded-full bg-orange" aria-hidden />{title}</h2>
      {sub && <p className="mb-4 text-xs text-muted">{sub}</p>}
      {children}
    </Card>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-ink/75">
      {items.map(([l, c]) => (
        <li key={l} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: c }} />{l}</li>
      ))}
    </ul>
  );
}
