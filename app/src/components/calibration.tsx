"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { previewWeights, saveWeights } from "@/lib/actions/settings";
import { SCORE_LABELS, SOLUCOES, type ScoreKey } from "@/lib/domain";
import { CRITERIA_LABELS, DEFAULT_WEIGHTS, type Weights } from "@/lib/scoring/weights";
import { Button, Card, cx } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

const GROUPS: ScoreKey[] = ["geral", "saude", "seguro", "credito", "parceria"];
const FAIXAS = ["até 39", "40 a 59", "60 a 79", "80+"];

export function Calibration({ weights, version, editable, mostrarDistribuicao }: { weights: Weights; version: number; editable: boolean; mostrarDistribuicao: boolean }) {
  const [w, setW] = useState<Weights>(weights);
  const [preview, setPreview] = useState<Record<ScoreKey, number[]> | null>(null);
  // Distribuição com os pesos atuais vem da API (base já em memória lá), para a página abrir na hora.
  useEffect(() => {
    if (!mostrarDistribuicao) return;
    let vivo = true;
    fetch("/api/companies/aderencia", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { faixas: Record<ScoreKey, number[]> } | null) => vivo && d && setPreview((p) => p ?? d.faixas))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [mostrarDistribuicao]);
  const [dirty, setDirty] = useState(false);
  const [saving, startSave] = useTransition();
  const [previewing, startPreview] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const set = (g: ScoreKey, c: string, v: number) => {
    setW((prev) => ({ ...prev, [g]: { ...prev[g], [c]: Math.max(0, Math.min(100, Math.round(v || 0))) } }));
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {GROUPS.map((g) => {
          const group = w[g] as Record<string, number>;
          const total = Object.values(group).reduce((a, b) => a + b, 0) || 1;
          const dist = preview?.[g];
          const n = dist ? dist.reduce((a, b) => a + b, 0) || 1 : 1;
          return (
            <Card key={g} className="p-4">
              <h3 className="font-display text-sm font-semibold">Score {g === "geral" ? "Geral" : SOLUCOES[g].label}</h3>
              <p className="mb-3 text-xs text-muted">{g === "geral" ? "Combina a melhor solução, a qualidade do dado e o porte." : SOLUCOES[g].desc}</p>
              <ul className="space-y-2">
                {Object.entries(group).map(([c, v]) => (
                  <li key={c} className="grid grid-cols-[1fr_4rem_2.5rem] items-center gap-2 text-sm">
                    <label htmlFor={`w-${g}-${c}`}>{CRITERIA_LABELS[c]}</label>
                    <input id={`w-${g}-${c}`} type="number" min={0} max={100} value={v} disabled={!editable}
                      onChange={(e) => set(g, c, Number(e.target.value))}
                      className="h-8 rounded-md border border-line bg-paper px-2 text-right tabular disabled:bg-transparent" />
                    <span className="text-right text-xs text-muted tabular">{Math.round((v / total) * 100)}%</span>
                  </li>
                ))}
              </ul>
              {dist && (
                <div className="mt-4">
                  <p className="mb-1 text-[11px] text-muted">Distribuição na base ({SCORE_LABELS[g]})</p>
                  <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-sm" aria-hidden>
                    {dist.map((x, i) => (
                      <span key={i} style={{ width: `${(x / n) * 100}%`, background: ["#bdb6ad", "#f2b08f", "#ea622d", "#a8380f"][i] }} />
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-ink/70 tabular">
                    {dist.map((x, i) => `${FAIXAS[i]}: ${x}`).join(" · ")}
                  </p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" loading={previewing} onClick={() => startPreview(async () => {
          const r = await previewWeights(w);
          if (r.ok && r.data) setPreview(r.data); else if (!r.ok) toast(r.error, "error");
        })}>Pré-visualizar distribuição</Button>
        {editable && (
          <>
            <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => startSave(async () => {
              const r = await saveWeights(w);
              if (!r.ok) return toast(r.error, "error");
              toast(`Pesos salvos (versão ${r.data?.version}). Os scores já usam a calibração nova.`);
              setDirty(false);
              router.refresh();
            })}>Salvar como versão {version + 1}</Button>
            <Button variant="ghost" onClick={() => { setW(structuredClone(DEFAULT_WEIGHTS) as unknown as Weights); setDirty(true); }}>Voltar ao padrão</Button>
          </>
        )}
        <span className={cx("text-xs", dirty ? "text-orange-deep" : "text-muted")}>
          {dirty ? "Alterações não salvas." : `Versão vigente: ${version}.`}
        </span>
      </div>
    </div>
  );
}
