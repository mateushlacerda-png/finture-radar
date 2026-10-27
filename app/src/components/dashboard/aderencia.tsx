"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconArrowRight } from "@/components/icons";
import { Skeleton } from "@/components/ui";
import { SOLUCOES, type Solucao } from "@/lib/domain";
import { SERIE_1 } from "./palette";

type Item = { solucao: Solucao; empresas: number; fortes: number };
const n = (v: number) => v.toLocaleString("pt-BR");

/** Score 60+ e 80+ por solução sobre a base inteira; vem da API para a página abrir sem esperar a base. */
export function Aderencia() {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch("/api/companies/aderencia", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((d: { aderencia: Item[] }) => vivo && setItens(d.aderencia))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, []);

  if (erro) return <p className="py-6 text-center text-sm text-muted">Não foi possível calcular a aderência agora.</p>;
  const max = Math.max(1, ...(itens ?? []).map((a) => a.empresas));
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy={!itens}>
      {(itens ?? (Object.keys(SOLUCOES) as Solucao[]).map((s) => ({ solucao: s, empresas: -1, fortes: -1 }))).map((a) => (
        <li key={a.solucao}>
          <Link href={`/radar?solucao=${a.solucao}&scoreMin=60`} className="lift pressable group block rounded-lg border border-line bg-paper p-3.5 hover:border-orange/40">
            <p className="flex items-center justify-between text-sm font-medium">
              {SOLUCOES[a.solucao].label}
              <IconArrowRight width={14} height={14} className="-translate-x-1 text-orange opacity-0 transition-[opacity,transform] duration-200 ease-[var(--ease-out)] group-hover:translate-x-0 group-hover:opacity-100" />
            </p>
            {a.empresas < 0 ? (
              <>
                <Skeleton className="mt-2 h-7 w-24" />
                <Skeleton className="mt-1.5 h-3 w-28" />
                <Skeleton className="mt-2.5 h-1.5 w-full" />
              </>
            ) : (
              <>
                <p className="mt-1 animate-enter font-display text-2xl font-semibold tabular">{n(a.empresas)}</p>
                <p className="text-xs text-muted">{n(a.fortes)} com score 80+</p>
                <div className="mt-2 h-1.5 rounded-full bg-ink/[0.06]" aria-hidden>
                  <div className="h-full origin-left animate-grow-x rounded-full" style={{ width: `${(a.empresas / max) * 100}%`, background: SERIE_1 }} />
                </div>
              </>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
