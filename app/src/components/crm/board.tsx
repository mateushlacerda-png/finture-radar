"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moveStage } from "@/lib/actions/crm";
import { ETAPAS, SOLUCOES, type Etapa, type Solucao } from "@/lib/domain";
import type { BoardCard } from "@/lib/queries/crm";
import { Badge, Button, cx, Input, Label, Modal } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

const fmt = (d: Date | string | null) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : null);

export function Board({ cards: initial, canEditAll, me }: { cards: BoardCard[]; canEditAll: boolean; me: string }) {
  const [cards, setCards] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Etapa | null>(null);
  const [lostFor, setLostFor] = useState<{ id: string; from: string } | null>(null);
  const [, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  // Dados novos do servidor (router.refresh) substituem o estado otimista.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setCards(initial);
  }

  const canEdit = (c: BoardCard) => canEditAll || c.ownerId === me;

  function move(id: string, stage: Etapa, lostReason?: string) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === stage) return;
    if (stage === "perdido" && !lostReason) {
      setLostFor({ id, from: card.stage });
      return;
    }
    const prev = cards;
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage } : c))); // otimista
    start(async () => {
      const r = await moveStage({ id, stage, lostReason });
      if (!r.ok) {
        setCards(prev);
        toast(r.error, "error");
      } else {
        toast(`${card.companyName} → ${r.data?.label}`);
        router.refresh();
      }
    });
  }

  return (
    <>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 md:px-8" role="list" aria-label="Etapas do funil">
        {ETAPAS.map((e, i) => {
          const col = cards.filter((c) => c.stage === e.key);
          const terminal = e.key === "ganho" || e.key === "perdido";
          return (
            <section
              key={e.key}
              role="listitem"
              aria-label={`${e.label}, ${col.length} oportunidades`}
              onDragOver={(ev) => { ev.preventDefault(); setOver(e.key); }}
              onDragLeave={() => setOver((o) => (o === e.key ? null : o))}
              onDrop={(ev) => { ev.preventDefault(); setOver(null); if (dragId) move(dragId, e.key); setDragId(null); }}
              className={cx(
                "flex w-[264px] shrink-0 animate-enter flex-col rounded-lg border transition-[background-color,border-color,box-shadow] duration-200",
                over === e.key ? "border-orange bg-orange-soft/40 shadow-[0_0_0_4px_rgba(234,98,45,0.1)]" : "border-line bg-cream-2/50",
              )}
              data-stage={e.key}
              style={{ animationDelay: `${i * 35}ms` }}
            >
              <header className="flex items-center justify-between px-3 py-2.5">
                <h2 className={cx("text-sm font-semibold", e.key === "ganho" && "text-success", e.key === "perdido" && "text-wine")}>{e.label}</h2>
                <span className="rounded-sm bg-paper px-1.5 text-xs tabular text-muted">{col.length}</span>
              </header>
              <ul className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {col.map((c) => {
                  const atrasada = c.nextActionAt && !terminal && new Date(c.nextActionAt) < new Date();
                  return (
                    <li
                      key={c.id}
                      draggable={canEdit(c)}
                      onDragStart={() => setDragId(c.id)}
                      onDragEnd={() => setDragId(null)}
                      className={cx("lift group rounded-md border border-line bg-paper p-2.5 shadow-[var(--shadow-card)] hover:border-ink/20", canEdit(c) && "cursor-grab active:cursor-grabbing", dragId === c.id && "scale-[0.98] opacity-40")}
                      data-card={c.companyName}
                      data-company-id={c.companyId}
                    >
                      <Link href={`/crm/${c.id}`} className="block text-sm font-medium leading-snug transition-colors hover:text-orange-deep">{c.companyName}</Link>
                      <p className="mt-0.5 text-xs text-muted">{c.municipio}/{c.uf}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <Badge>{SOLUCOES[c.solution as Solucao]?.curto ?? c.solution}</Badge>
                        {c.openTasks > 0 && <Badge tone="gold">{c.openTasks} tarefa{c.openTasks > 1 ? "s" : ""}</Badge>}
                        {c.isDemo && <Badge tone="wine" title="Oportunidade simulada">demo</Badge>}
                      </div>
                      {c.nextAction && !terminal && (
                        <p className={cx("mt-2 text-xs", atrasada ? "text-wine" : "text-ink/70")}>
                          {atrasada ? "Atrasada: " : ""}{c.nextAction}{c.nextActionAt ? ` · ${fmt(c.nextActionAt)}` : ""}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
                        <span className="truncate text-[11px] text-muted">{c.ownerName ?? "Sem responsável"}</span>
                        {canEdit(c) && (
                          <select
                            aria-label={`Mover ${c.companyName} para outra etapa`}
                            value={c.stage}
                            onChange={(ev) => move(c.id, ev.target.value as Etapa)}
                            className="h-6 max-w-[140px] rounded border border-line bg-paper px-1 text-[11px] text-ink/80"
                          >
                            {ETAPAS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                          </select>
                        )}
                      </div>
                    </li>
                  );
                })}
                {col.length === 0 && <li className="rounded-md border border-dashed border-line px-2 py-6 text-center text-xs text-muted">Arraste um card para cá</li>}
              </ul>
            </section>
          );
        })}
      </div>
      {lostFor && (
        <LostModal
          onClose={() => setLostFor(null)}
          onConfirm={(reason) => { const id = lostFor.id; setLostFor(null); move(id, "perdido", reason); }}
        />
      )}
    </>
  );
}

function LostModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (r: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open onClose={onClose} title="Marcar como perdida">
      <form onSubmit={(e) => { e.preventDefault(); onConfirm(reason.trim()); }} className="space-y-3">
        <div>
          <Label htmlFor="lost-r">Motivo da perda</Label>
          <Input id="lost-r" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={300} placeholder="Ex.: já trabalha com outro distribuidor" />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="danger" disabled={reason.trim().length < 3}>Confirmar perda</Button>
        </div>
      </form>
    </Modal>
  );
}
