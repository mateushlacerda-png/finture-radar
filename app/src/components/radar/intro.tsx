"use client";

import { useEffect, useState, type PointerEvent, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { IconArrowRight, IconShield, IconTarget } from "@/components/icons";

export type Escolha = "parceiro" | "cliente" | "todos" | "novas";

const OPCOES: { key: Exclude<Escolha, "todos">; atalho: string; titulo: string; texto: string; tags: string[]; icon: ReactNode }[] = [
  {
    key: "parceiro",
    atalho: "1",
    titulo: "Parceiros",
    texto: "Quem pode distribuir as soluções Finture com a própria marca.",
    tags: ["Escritórios de investimento", "Family offices", "Consultorias CVM", "Imobiliárias"],
    icon: <IconShield width={20} height={20} />,
  },
  {
    key: "cliente",
    atalho: "2",
    titulo: "Clientes",
    texto: "Empresas com perfil para contratar uma solução Finture.",
    tags: ["Saúde empresarial", "Seguro empresarial", "Crédito"],
    icon: <IconTarget width={20} height={20} />,
  },
];

const trackPointer = (e: PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
};

async function contar(tipo: string): Promise<number | null> {
  try {
    const r = await fetch(`/api/companies?tipo=${tipo}&page=0`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as { total: number }).total : null;
  } catch {
    return null;
  }
}

/** Primeira pergunta do Radar: quem a pessoa procura. Só depois o mapa e os filtros aparecem. */
export function RadarIntro({ onPick, novidades }: { onPick: (e: Escolha) => void; novidades: { competencia: string; total: number } | null }) {
  const [totais, setTotais] = useState<Record<string, number | null>>({});
  const [saindo, setSaindo] = useState<Escolha | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([contar("parceiro"), contar("cliente")]).then(([p, c]) => vivo && setTotais({ parceiro: p, cliente: c }));
    return () => {
      vivo = false;
    };
  }, []);

  const escolher = (e: Escolha) => {
    if (saindo) return;
    setSaindo(e);
    // Saída curta antes de trocar de tela; o sistema responde rápido.
    setTimeout(() => onPick(e), 180);
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.target instanceof HTMLInputElement || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === "1") escolher("parceiro");
      else if (ev.key === "2") escolher("cliente");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      className={cx(
        "relative flex h-full min-h-[560px] flex-col items-center justify-center overflow-hidden px-4 py-10 transition-[opacity,transform,filter] duration-200 ease-[var(--ease-out)]",
        saindo && "scale-[0.985] opacity-0 blur-[2px]",
      )}
    >
      <Fundo />

      <div className="stagger relative flex w-full max-w-3xl flex-col items-center text-center">
        {novidades && novidades.total > 0 ? (
          <button
            type="button"
            onClick={() => escolher("novas")}
            className="pressable group mb-5 inline-flex items-center gap-2 rounded-full border border-success/25 bg-paper/80 px-3 py-1 text-xs text-ink/75 shadow-[var(--shadow-card)] backdrop-blur transition-colors hover:border-success/50"
          >
            <span className="relative flex size-1.5" aria-hidden>
              <span className="absolute inset-0 rounded-full bg-success [animation:ping-soft_1.6s_var(--ease-out)_infinite]" />
              <span className="relative size-1.5 rounded-full bg-success" />
            </span>
            <strong className="font-semibold text-success tabular">{novidades.total.toLocaleString("pt-BR")}</strong> empresas novas na base com a atualização de {novidades.competencia}
            <IconArrowRight width={12} height={12} className="text-success transition-transform duration-200 ease-[var(--ease-out)] group-hover:translate-x-0.5" />
          </button>
        ) : (
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-paper/80 px-3 py-1 text-xs text-ink/70 shadow-[var(--shadow-card)] backdrop-blur">
            <span className="relative flex size-1.5" aria-hidden>
              <span className="absolute inset-0 rounded-full bg-orange [animation:ping-soft_1.6s_var(--ease-out)_infinite]" />
              <span className="relative size-1.5 rounded-full bg-orange" />
            </span>
            Radar comercial
          </p>
        )}
        <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight md:text-[44px]">
          Quem você quer encontrar hoje?
        </h1>
        <p className="mt-3 max-w-md text-[15px] text-muted">Escolha um caminho. O mapa abre já ordenado para ele, e os filtros finos ficam à mão quando precisar.</p>

        <div className="mt-10 grid w-full gap-3 text-left md:grid-cols-2" role="group" aria-label="O que você procura">
          {OPCOES.map((o) => {
            const total = totais[o.key];
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => escolher(o.key)}
                onPointerMove={trackPointer}
                aria-keyshortcuts={o.atalho}
                className={cx(
                  "spotlight lift pressable group flex flex-col items-start rounded-2xl text-left border bg-paper/90 p-5 shadow-[var(--shadow-card)] backdrop-blur md:p-6",
                  "transition-[border-color,box-shadow,transform] duration-200",
                  saindo === o.key ? "border-orange shadow-[0_0_0_4px_rgba(234,98,45,0.14)]" : "border-line hover:border-orange/45",
                )}
              >
                <span className="flex w-full items-start justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-ink text-orange shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-200 ease-[var(--ease-out)] group-hover:-rotate-6">
                    {o.icon}
                  </span>
                  <kbd className="rounded-md border border-line bg-cream/60 px-1.5 py-0.5 font-sans text-[11px] text-muted">{o.atalho}</kbd>
                </span>
                <span className="mt-5 flex items-center gap-2 font-display text-xl font-semibold">
                  {o.titulo}
                  <IconArrowRight width={17} height={17} className="-translate-x-1 text-orange opacity-0 transition-[opacity,transform] duration-200 ease-[var(--ease-out)] group-hover:translate-x-0 group-hover:opacity-100" />
                </span>
                <span className="mt-1.5 text-sm text-ink/70">{o.texto}</span>
                <span className="mb-5 mt-4 flex flex-wrap gap-1.5">
                  {o.tags.map((t) => (
                    <span key={t} className="rounded-md bg-cream-2/70 px-2 py-0.5 text-[11px] text-ink/70">{t}</span>
                  ))}
                </span>
                <span className="mt-auto flex w-full items-center gap-2 border-t border-line pt-4 text-xs text-muted">
                  {total === undefined ? (
                    <span className="skeleton h-3.5 w-28 rounded" />
                  ) : total === null ? (
                    "Base indisponível no momento"
                  ) : (
                    <span className="animate-enter">
                      <strong className="font-display text-sm font-semibold text-ink tabular">{total.toLocaleString("pt-BR")}</strong> empresas no mapa
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <button type="button" onClick={() => escolher("todos")} className="pressable mt-6 rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-ink/5 hover:text-ink">
          Ver toda a base, sem escolher
        </button>
      </div>
    </div>
  );
}

/** Malha de pontos e anéis de radar ao fundo, bem discretos. */
function Fundo() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_45%,#000_30%,transparent_100%)]" />
      <div className="absolute left-1/2 top-1/2 size-[900px] -translate-1/2">
        {[0, 16, 32].map((i) => (
          <div key={i} className="absolute rounded-full border border-ink/[0.05]" style={{ inset: `${i}%` }} />
        ))}
        <div className="animate-sweep absolute inset-0 rounded-full [animation:sweep_8s_linear_infinite] [background:conic-gradient(from_0deg,transparent_0deg,transparent_300deg,rgba(234,98,45,0.08)_360deg)] [mask-image:radial-gradient(circle,#000_40%,transparent_70%)]" />
      </div>
    </div>
  );
}
