"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteList, deleteSearch, removeFromList, renameList } from "@/lib/actions/lists";
import { Button, Input, Modal } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

export function DeleteButton({ kind, id, name, redirectTo }: { kind: "list" | "search"; id: string; name: string; redirectTo?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs text-muted hover:text-wine" aria-label={`Excluir ${name}`}>Excluir</button>
      <Modal open={open} onClose={() => setOpen(false)} title={kind === "list" ? "Excluir lista" : "Excluir pesquisa"}>
        <p className="text-sm">Excluir <strong>{name}</strong>? {kind === "list" && "As empresas continuam no Radar; só a lista some."}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="danger" loading={pending} onClick={() => start(async () => {
            const r = kind === "list" ? await deleteList({ listId: id }) : await deleteSearch({ id });
            if (!r.ok) return toast(r.error, "error");
            toast("Excluída.");
            setOpen(false);
            if (redirectTo) router.push(redirectTo); else router.refresh();
          })}>Excluir</Button>
        </div>
      </Modal>
    </>
  );
}

export function RemoveItem({ listId, companyId }: { listId: string; companyId: number }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <button disabled={pending} className="text-xs text-muted hover:text-wine disabled:opacity-50"
      onClick={() => start(async () => {
        const r = await removeFromList({ listId, companyId });
        if (!r.ok) toast(r.error, "error"); else router.refresh();
      })}>
      Remover
    </button>
  );
}

export function RenameList({ listId, name }: { listId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Renomear</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Renomear lista">
        <form onSubmit={(e) => { e.preventDefault(); start(async () => {
          const r = await renameList({ listId, name: value });
          if (!r.ok) return toast(r.error, "error");
          setOpen(false);
          router.refresh();
        }); }}>
          <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} aria-label="Nome da lista" autoFocus />
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="primary" loading={pending}>Salvar</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
