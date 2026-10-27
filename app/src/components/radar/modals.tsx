"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOpportunity } from "@/lib/actions/crm";
import { discardCompany, logContact, registerSuppression } from "@/lib/actions/companies";
import { addToList, createList } from "@/lib/actions/lists";
import { MOTIVOS_DESCARTE, SOLUCOES, TIPOS_ATIVIDADE, TIPOS_CONTATO, type Solucao } from "@/lib/domain";
import { Button, Input, Label, Modal, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

export type Ctx = {
  users: { id: string; name: string }[];
  lists: { id: string; name: string }[];
  me: { id: string; canManage: boolean };
};

function Footer({ onCancel, pending, label, disabled }: { onCancel: () => void; pending: boolean; label: string; disabled?: boolean }) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
      <Button type="submit" variant="primary" loading={pending} disabled={disabled}>{label}</Button>
    </div>
  );
}

function useSubmit(onDone: () => void) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const submit = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Erro.");
      else {
        toast(okMsg);
        onDone();
      }
    });
  return { pending, error, submit };
}

const Err = ({ msg }: { msg: string | null }) => (msg ? <p role="alert" className="mt-3 text-sm text-wine">{msg}</p> : null);

export function AddToCrmModal({ open, onClose, onDone, company, ctx }: {
  open: boolean; onClose: () => void; onDone: () => void;
  company: { id: number; nome: string; isParceiro: boolean; recomendada?: Solucao }; ctx: Ctx;
}) {
  const [funnel, setFunnel] = useState<"parceiro" | "cliente">(company.isParceiro ? "parceiro" : "cliente");
  const [solution, setSolution] = useState<Solucao>(company.isParceiro ? "parceria" : company.recomendada && company.recomendada !== "parceria" ? company.recomendada : "saude");
  const [owner, setOwner] = useState(ctx.me.id);
  const [nextAction, setNextAction] = useState("Primeiro contato");
  const [when, setWhen] = useState("");
  const { pending, error, submit } = useSubmit(onDone);
  const router = useRouter();
  return (
    <Modal open={open} onClose={onClose} title="Adicionar ao CRM">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(async () => {
            const r = await createOpportunity({ companyId: company.id, funnel, solution, ownerId: owner, nextAction, nextActionAt: when || undefined });
            if (r.ok) router.refresh();
            return r;
          }, `${company.nome} entrou no CRM.`);
        }}
        className="space-y-3"
      >
        <p className="text-sm text-muted">{company.nome}</p>
        <div>
          <Label htmlFor="crm-funnel">Funil</Label>
          <Select id="crm-funnel" value={funnel} onChange={(e) => {
            const f = e.target.value as "parceiro" | "cliente";
            setFunnel(f);
            setSolution(f === "parceiro" ? "parceria" : "saude");
          }}>
            <option value="parceiro">Parceiro de distribuição</option>
            <option value="cliente">Cliente final</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="crm-sol">Solução</Label>
          <Select id="crm-sol" value={solution} onChange={(e) => setSolution(e.target.value as Solucao)} disabled={funnel === "parceiro"}>
            {(Object.keys(SOLUCOES) as Solucao[]).filter((k) => (funnel === "parceiro" ? k === "parceria" : k !== "parceria")).map((k) => (
              <option key={k} value={k}>{SOLUCOES[k].label}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="crm-owner">Responsável</Label>
          <Select id="crm-owner" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!ctx.me.canManage}>
            {ctx.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
          {!ctx.me.canManage && <p className="mt-1 text-xs text-muted">Executivos criam oportunidades para si. A redistribuição é feita pelo gestor.</p>}
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <Label htmlFor="crm-next">Próxima ação</Label>
            <Input id="crm-next" value={nextAction} onChange={(e) => setNextAction(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label htmlFor="crm-when">Quando</Label>
            <Input id="crm-when" type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
        </div>
        <Err msg={error} />
        <Footer onCancel={onClose} pending={pending} label="Criar oportunidade" />
      </form>
    </Modal>
  );
}

export function SaveToListModal({ open, onClose, onDone, companyIds, ctx, title }: {
  open: boolean; onClose: () => void; onDone: () => void; companyIds: number[]; ctx: Ctx; title?: string;
}) {
  const [listId, setListId] = useState(ctx.lists[0]?.id ?? "__new");
  const [name, setName] = useState("");
  const { pending, error, submit } = useSubmit(onDone);
  const router = useRouter();
  const isNew = listId === "__new";
  return (
    <Modal open={open} onClose={onClose} title={title ?? "Salvar em lista"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(async () => {
            const r = isNew ? await createList({ name, companyIds }) : await addToList({ listId, companyIds });
            if (r.ok) router.refresh();
            return r;
          }, companyIds.length > 1 ? `${companyIds.length} empresas salvas na lista.` : "Empresa salva na lista.");
        }}
        className="space-y-3"
      >
        {companyIds.length > 1 && <p className="text-sm text-muted">{companyIds.length} empresas do resultado atual.</p>}
        <div>
          <Label htmlFor="list-pick">Lista</Label>
          <Select id="list-pick" value={listId} onChange={(e) => setListId(e.target.value)}>
            {ctx.lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            <option value="__new">+ Nova lista</option>
          </Select>
        </div>
        {isNew && (
          <div>
            <Label htmlFor="list-name">Nome da nova lista</Label>
            <Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Escritórios de investimento BH" autoFocus maxLength={80} />
          </div>
        )}
        <Err msg={error} />
        <Footer onCancel={onClose} pending={pending} label="Salvar" disabled={isNew && name.trim().length < 2} />
      </form>
    </Modal>
  );
}

export function LogContactModal({ open, onClose, onDone, companyId, opportunities }: {
  open: boolean; onClose: () => void; onDone: () => void; companyId: number; opportunities: { id: string; label: string }[];
}) {
  const [type, setType] = useState<string>("ligacao");
  const [body, setBody] = useState("");
  const [opp, setOpp] = useState(opportunities[0]?.id ?? "");
  const { pending, error, submit } = useSubmit(onDone);
  return (
    <Modal open={open} onClose={onClose} title="Registrar contato">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(() => logContact({ companyId, type, body, opportunityId: opp || undefined }), "Contato registrado.");
        }}
        className="space-y-3"
      >
        <div>
          <Label htmlFor="ct-type">Canal</Label>
          <Select id="ct-type" value={type} onChange={(e) => setType(e.target.value)}>
            {TIPOS_CONTATO.map((t) => <option key={t} value={t}>{TIPOS_ATIVIDADE[t]}</option>)}
          </Select>
        </div>
        {opportunities.length > 0 && (
          <div>
            <Label htmlFor="ct-opp">Oportunidade</Label>
            <Select id="ct-opp" value={opp} onChange={(e) => setOpp(e.target.value)}>
              {opportunities.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              <option value="">Sem oportunidade (só histórico da empresa)</option>
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="ct-body">O que aconteceu</Label>
          <textarea id="ct-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={2000}
            className="w-full rounded-md border border-line bg-paper p-2.5 text-sm focus:border-orange focus:outline-none"
            placeholder="Ex.: Falei com o sócio, pediu apresentação do modelo na quinta." />
        </div>
        <Err msg={error} />
        <Footer onCancel={onClose} pending={pending} label="Registrar" disabled={body.trim().length < 3} />
      </form>
    </Modal>
  );
}

export function DiscardModal({ open, onClose, onDone, companyId }: { open: boolean; onClose: () => void; onDone: () => void; companyId: number }) {
  const [reason, setReason] = useState<string>(MOTIVOS_DESCARTE[0]);
  const [detail, setDetail] = useState("");
  const { pending, error, submit } = useSubmit(onDone);
  return (
    <Modal open={open} onClose={onClose} title="Descartar lead">
      <form onSubmit={(e) => { e.preventDefault(); submit(() => discardCompany({ companyId, reason, detail: detail || undefined }), "Lead descartado."); }} className="space-y-3">
        <p className="text-sm text-muted">A empresa sai dos resultados padrão do Radar. Dá para trazer de volta pelo filtro &quot;Só descartadas&quot;.</p>
        <div>
          <Label htmlFor="ds-reason">Motivo</Label>
          <Select id="ds-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {MOTIVOS_DESCARTE.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="ds-detail">Detalhe (opcional)</Label>
          <Input id="ds-detail" value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={300} />
        </div>
        <Err msg={error} />
        <Footer onCancel={onClose} pending={pending} label="Descartar" />
      </form>
    </Modal>
  );
}

export function SuppressionModal({ open, onClose, onDone, companyId }: { open: boolean; onClose: () => void; onDone: () => void; companyId: number }) {
  const [kind, setKind] = useState<"oposicao" | "remocao">("oposicao");
  const [requester, setRequester] = useState("");
  const [note, setNote] = useState("");
  const { pending, error, submit } = useSubmit(onDone);
  return (
    <Modal open={open} onClose={onClose} title="Pedido do titular (LGPD)">
      <form onSubmit={(e) => { e.preventDefault(); submit(() => registerSuppression({ companyId, kind, requester, note: note || undefined }), "Pedido registrado. A empresa saiu do Radar."); }} className="space-y-3">
        <p className="text-sm text-muted">Use quando a empresa ou o titular do dado pedir para não ser contatado ou para ter os dados removidos. A empresa deixa de aparecer para toda a organização e o pedido fica auditado.</p>
        <div>
          <Label htmlFor="sp-kind">Tipo de pedido</Label>
          <Select id="sp-kind" value={kind} onChange={(e) => setKind(e.target.value as "oposicao" | "remocao")}>
            <option value="oposicao">Oposição ao contato comercial</option>
            <option value="remocao">Remoção dos dados</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="sp-req">Quem pediu e por qual canal</Label>
          <Input id="sp-req" value={requester} onChange={(e) => setRequester(e.target.value)} placeholder="Ex.: sócio, por e-mail em 23/10" maxLength={200} />
        </div>
        <div>
          <Label htmlFor="sp-note">Observação</Label>
          <Input id="sp-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </div>
        <Err msg={error} />
        <Footer onCancel={onClose} pending={pending} label="Registrar pedido" disabled={requester.trim().length < 3} />
      </form>
    </Modal>
  );
}
