"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addActivity, addTask, moveStage, toggleTask, updateOpportunity } from "@/lib/actions/crm";
import { ETAPAS, formatActivityBody, TIPOS_ATIVIDADE, type Etapa } from "@/lib/domain";
import { Badge, Button, cx, Input, Label, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

type Act = { id: string; type: string; body: string; createdAt: Date | string; userName: string | null };
type Task = { id: string; title: string; dueAt: Date | string | null; done: boolean; assigneeName: string | null };

const toInputDate = (d: Date | string | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");

function useAction() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const exec = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast(r.error ?? "Erro.", "error");
      else {
        if (ok) toast(ok);
        after?.();
        router.refresh();
      }
    });
  return { pending, exec };
}

export function StageControl({ id, stage, editable }: { id: string; stage: Etapa; editable: boolean }) {
  const [value, setValue] = useState<Etapa>(stage);
  const [reason, setReason] = useState("");
  const { pending, exec } = useAction();
  const idx = ETAPAS.findIndex((e) => e.key === stage);
  return (
    <div>
      <ol className="mb-4 flex gap-1" aria-label="Progresso no funil">
        {ETAPAS.filter((e) => e.key !== "perdido").map((e, i) => (
          <li key={e.key} title={e.label} className={cx("h-1.5 flex-1 rounded-full", stage === "perdido" ? "bg-wine/25" : i <= idx ? "bg-orange" : "bg-ink/10")} />
        ))}
      </ol>
      {editable ? (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); exec(() => moveStage({ id, stage: value, lostReason: reason || undefined }), "Etapa atualizada."); }}>
          <div className="min-w-48 flex-1">
            <Label htmlFor="op-stage">Etapa</Label>
            <Select id="op-stage" value={value} onChange={(e) => setValue(e.target.value as Etapa)}>
              {ETAPAS.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
            </Select>
          </div>
          {value === "perdido" && value !== stage && (
            <div className="min-w-48 flex-1">
              <Label htmlFor="op-lost">Motivo da perda</Label>
              <Input id="op-lost" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </div>
          )}
          <Button type="submit" variant="primary" loading={pending} disabled={value === stage || (value === "perdido" && reason.trim().length < 3)}>Mover</Button>
        </form>
      ) : (
        <p className="text-sm text-muted">Só o responsável ou um gestor altera esta oportunidade.</p>
      )}
    </div>
  );
}

export function DetailsForm({ id, ownerId, nextAction, nextActionAt, users, canReassign, editable }: {
  id: string; ownerId: string | null; nextAction: string | null; nextActionAt: Date | string | null;
  users: { id: string; name: string }[]; canReassign: boolean; editable: boolean;
}) {
  const [owner, setOwner] = useState(ownerId ?? "");
  const [na, setNa] = useState(nextAction ?? "");
  const [when, setWhen] = useState(toInputDate(nextActionAt));
  const { pending, exec } = useAction();
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); exec(() => updateOpportunity({ id, ownerId: owner || undefined, nextAction: na, nextActionAt: when || undefined }), "Oportunidade atualizada."); }}>
      <div>
        <Label htmlFor="op-owner">Responsável comercial</Label>
        <Select id="op-owner" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!canReassign}>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="op-na">Próxima ação</Label>
        <Input id="op-na" value={na} onChange={(e) => setNa(e.target.value)} maxLength={200} disabled={!editable} />
      </div>
      <div>
        <Label htmlFor="op-when">Data</Label>
        <Input id="op-when" type="date" value={when} onChange={(e) => setWhen(e.target.value)} disabled={!editable} />
      </div>
      {editable && <Button type="submit" loading={pending} className="w-full">Salvar</Button>}
    </form>
  );
}

export function Composer({ id, editable }: { id: string; editable: boolean }) {
  const [type, setType] = useState("nota");
  const [body, setBody] = useState("");
  const { pending, exec } = useAction();
  if (!editable) return null;
  return (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); exec(() => addActivity({ id, type, body }), "Registrado no histórico.", () => setBody("")); }}>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de registro">
        {(["nota", "ligacao", "email", "whatsapp", "reuniao"] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)}
            className={cx("rounded-md border px-2 py-1 text-xs", type === t ? "border-ink bg-ink text-cream" : "border-line bg-paper text-ink/75")}>
            {TIPOS_ATIVIDADE[t]}
          </button>
        ))}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={4000} aria-label="Conteúdo do registro"
        placeholder={type === "nota" ? "Anote o que importa para o próximo passo." : "Resumo do contato: com quem, o que ficou combinado."}
        className="w-full rounded-md border border-line bg-paper p-2.5 text-sm focus:border-orange focus:outline-none" />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="sm" loading={pending} disabled={body.trim().length < 2}>Registrar</Button>
      </div>
    </form>
  );
}

export function Tasks({ id, tasks, users, editable }: { id: string; tasks: Task[]; users: { id: string; name: string }[]; editable: boolean }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");
  // Marcação otimista: o checkbox responde na hora; se a action falhar, volta ao valor do servidor.
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const { pending, exec } = useAction();
  return (
    <div>
      <ul className="space-y-1.5">
        {tasks.map((t) => {
          const done = local[t.id] ?? t.done;
          const late = !done && t.dueAt && new Date(t.dueAt) < new Date();
          return (
            <li key={t.id} className="flex items-start gap-2.5 text-sm">
              <input type="checkbox" checked={done} disabled={!editable} aria-label={`Concluir: ${t.title}`}
                onChange={() => {
                  setLocal((m) => ({ ...m, [t.id]: !done }));
                  exec(async () => {
                    const r = await toggleTask({ taskId: t.id });
                    if (!r.ok) setLocal((m) => ({ ...m, [t.id]: t.done }));
                    return r;
                  });
                }}
                className="mt-0.5 size-4 accent-[var(--color-orange)]" />
              <span className={cx("flex-1", done && "text-muted line-through")}>
                {t.title}
                <span className={cx("block text-xs", late ? "text-wine" : "text-muted")}>
                  {t.dueAt ? new Date(t.dueAt).toLocaleDateString("pt-BR") : "Sem data"}{late ? " · atrasada" : ""} · {t.assigneeName ?? "Sem responsável"}
                </span>
              </span>
            </li>
          );
        })}
        {tasks.length === 0 && <li className="text-sm text-muted">Nenhuma tarefa.</li>}
      </ul>
      {editable && (
        <form className="mt-3 space-y-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); exec(() => addTask({ id, title, dueAt: due || undefined, assigneeId: assignee || undefined }), "Tarefa criada.", () => { setTitle(""); setDue(""); }); }}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa ou compromisso" aria-label="Título da tarefa" maxLength={200} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Data da tarefa" />
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Responsável pela tarefa">
              <option value="">Responsável da oportunidade</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
          <Button type="submit" size="sm" loading={pending} disabled={title.trim().length < 2} className="w-full">Adicionar tarefa</Button>
        </form>
      )}
    </div>
  );
}

export function Timeline({ items }: { items: Act[] }) {
  return (
    <ol className="space-y-3">
      {items.map((a) => (
        <li key={a.id} className="relative border-l-2 border-line pl-4 text-sm">
          <span className={cx("absolute -left-[5px] top-1.5 size-2 rounded-full", a.type === "etapa" ? "bg-orange" : "bg-ink/30")} aria-hidden />
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <Badge tone={a.type === "etapa" ? "orange" : "neutral"}>{TIPOS_ATIVIDADE[a.type as keyof typeof TIPOS_ATIVIDADE] ?? a.type}</Badge>
            {new Date(a.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {a.userName ?? "Sistema"}
          </p>
          <p className="mt-1 whitespace-pre-line">{formatActivityBody(a.type, a.body)}</p>
        </li>
      ))}
    </ol>
  );
}

