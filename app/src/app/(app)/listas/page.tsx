import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/shell";
import { Card, EmptyState } from "@/components/ui";
import { DeleteButton } from "@/components/lists";
import { requireSession } from "@/lib/auth/session";
import { describeQuery } from "@/lib/describe-filters";
import { getLists } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "Listas" };

export default async function ListasPage() {
  const s = await requireSession();
  const { lists, searches } = await getLists(s.orgId);
  return (
    <div className="pb-10">
      <PageHeader eyebrow="Prospecção" title="Listas e pesquisas" />
      <div className="stagger grid gap-4 px-4 md:px-8 lg:grid-cols-2">
        <Card>
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-display text-base font-semibold">Listas</h2>
            <p className="text-xs text-muted">Recortes fixos de empresas. Crie pelo Radar, na ficha ou com &quot;Resultado em lista&quot;.</p>
          </div>
          {lists.length === 0 ? (
            <EmptyState title="Nenhuma lista ainda">Abra o Radar, filtre e salve o resultado numa lista.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {lists.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-cream/60">
                  <Link href={`/listas/${l.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium hover:text-orange-deep">{l.name}</p>
                    <p className="text-xs text-muted">{l.count} empresas · {l.createdByName ?? "?"} · {new Date(l.createdAt).toLocaleDateString("pt-BR")}</p>
                  </Link>
                  <Link href={`/radar?lista=${l.id}`} className="text-xs text-orange-deep hover:underline">Ver no mapa</Link>
                  <DeleteButton kind="list" id={l.id} name={l.name} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-display text-base font-semibold">Pesquisas salvas</h2>
            <p className="text-xs text-muted">Combinações de filtros. O resultado é recalculado a cada abertura, então empresas novas entram sozinhas.</p>
          </div>
          {searches.length === 0 ? (
            <EmptyState title="Nenhuma pesquisa salva">No Radar, use &quot;Salvar pesquisa&quot;.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {searches.map((sv) => (
                <li key={sv.id} className="flex items-center gap-3 px-5 py-3 transition-colors duration-150 hover:bg-cream/60">
                  <Link href={`/radar?${sv.query}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium hover:text-orange-deep">{sv.name}</p>
                    <p className="truncate text-xs text-muted">{describeQuery(sv.query)}</p>
                  </Link>
                  <DeleteButton kind="search" id={sv.id} name={sv.name} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
