"use client";

import { useState, useTransition } from "react";
import { generateOverview } from "@/lib/actions/companies";
import { SOLUCOES, type Solucao } from "@/lib/domain";
import type { CompanyDetail } from "@/lib/queries/companies";
import { Badge, Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { nomeExibicao } from "@/lib/nome";

const linkCls = "inline-flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-1 text-xs font-medium hover:border-ink/40";

export function OverviewBlock({ data, onDone }: { data: CompanyDetail; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const toast = useToast();
  const c = data.company;
  const nome = nomeExibicao(c);
  const ov = data.overview;

  const gerar = () =>
    start(async () => {
      setErro(null);
      const r = await generateOverview({ companyId: c.id });
      if (!r.ok) setErro(r.error);
      else {
        toast("Overview gerado.");
        onDone();
      }
    });

  return (
    <section className="border-b border-line px-5 py-4" aria-labelledby="ov-h">
      <h3 id="ov-h" className="eyebrow mb-2.5">Visão geral</h3>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {c.site && !c.isDemo && (
          <a className={linkCls} href={c.site} target="_blank" rel="noopener noreferrer nofollow">Site</a>
        )}
        {c.linkedin && (
          <a className={linkCls} href={c.linkedin} target="_blank" rel="noopener noreferrer nofollow">LinkedIn da empresa</a>
        )}
        {c.instagram && (
          <a className={linkCls} href={c.instagram} target="_blank" rel="noopener noreferrer nofollow">Instagram</a>
        )}
        <a
          className={linkCls}
          href={`https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(nome)}`}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title="Abre a busca do LinkedIn no seu navegador"
        >
          Buscar no LinkedIn
        </a>
      </div>
      {!c.linkedin && c.siteColetadoEm && <p className="-mt-1 mb-3 text-xs text-muted">LinkedIn: não consta no site da empresa.</p>}

      <div className="space-y-1.5 text-sm leading-relaxed text-ink/90">
        {data.factual.paragrafos.map((p) => <p key={p}>{p}</p>)}
      </div>
      <p className="mt-1.5 text-[11px] text-muted">Fonte: {data.factual.fontes.join("; ")}.</p>

      <div className="mt-4 rounded-lg border border-line bg-cream/50 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Briefing para o primeiro contato</p>
          <Badge tone="gold" title="Texto gerado por IA a partir do cadastro e do site. Confira antes de usar.">IA</Badge>
        </div>

        {pending ? (
          <p className="mt-2 text-sm text-muted" role="status">Lendo o site e o cadastro e montando o briefing. Leva de 15 a 60 segundos.</p>
        ) : ov ? (
          <div className="mt-2 space-y-3 text-sm">
            <p className="leading-relaxed">{ov.conteudo.resumo}</p>
            {ov.conteudo.publico_e_oferta && <p className="leading-relaxed text-ink/80">{ov.conteudo.publico_e_oferta}</p>}
            {ov.conteudo.sinais.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted">Sinais para a conversa</p>
                <ul className="space-y-1">
                  {ov.conteudo.sinais.map((s) => (
                    <li key={s.fato} className="flex gap-1.5">
                      <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-orange" />
                      <span>{s.fato} <span className="text-[11px] text-muted">({s.fonte})</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Como abordar</p>
              <ul className="space-y-2">
                {ov.conteudo.abordagem.map((a) => (
                  <li key={a.solucao + a.como_abrir} className="rounded-md border border-line bg-paper p-2.5">
                    <Badge>{SOLUCOES[a.solucao as Solucao]?.label ?? a.solucao}</Badge>
                    <p className="mt-1.5 text-xs text-muted">Objetivo do cliente: {a.objetivo_do_cliente}</p>
                    <p className="mt-1">“{a.como_abrir}”</p>
                  </li>
                ))}
              </ul>
            </div>
            {ov.conteudo.perguntas.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted">Perguntas de descoberta</p>
                <ol className="list-decimal space-y-0.5 pl-4">{ov.conteudo.perguntas.map((q) => <li key={q}>{q}</li>)}</ol>
              </div>
            )}
            {ov.conteudo.lacunas.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted">O que as fontes não dizem</p>
                <ul className="list-disc space-y-0.5 pl-4 text-ink/75">{ov.conteudo.lacunas.map((q) => <li key={q}>{q}</li>)}</ul>
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-muted">
              Gerado por IA ({ov.modelo}) em {new Date(ov.geradoEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
              {ov.geradoPor ? ` por ${ov.geradoPor}` : ""}. Confira antes de usar. Fontes: {ov.fontes.join("; ")}.
            </p>
            {data.iaDisponivel && <Button size="sm" variant="ghost" onClick={gerar}>Gerar de novo</Button>}
          </div>
        ) : (
          <div className="mt-2">
            <p className="mb-2.5 text-xs text-muted">
              A IA lê o cadastro{c.site && !c.isDemo ? " e o site da empresa" : ""} e sugere o gancho de abordagem, perguntas de descoberta e o que ainda falta saber. Não inventa dados: o que as fontes não dizem aparece como lacuna.
            </p>
            {data.iaDisponivel ? (
              <Button size="sm" variant="primary" onClick={gerar}>Gerar briefing com IA</Button>
            ) : (
              <p className="text-xs font-medium text-ink/70">Disponível em breve na versão online.</p>
            )}
          </div>
        )}
        {erro && <p role="alert" className="mt-2 text-sm text-wine">{erro}</p>}
      </div>
    </section>
  );
}
