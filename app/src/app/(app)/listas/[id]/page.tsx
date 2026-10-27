import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell";
import { Badge, Card, DemoBadge, EmptyState, ScorePill } from "@/components/ui";
import { DeleteButton, RemoveItem, RenameList } from "@/components/lists";
import { requireSession } from "@/lib/auth/session";
import { TIPOS_PARCEIRO, type TipoParceiro } from "@/lib/cnaes";
import { SOLUCOES, STATUS_EMPRESA, type Solucao } from "@/lib/domain";
import { parseFilters } from "@/lib/filters";
import { searchCompanies } from "@/lib/queries/companies";
import { getList } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "Lista" };

export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const list = await getList(s.orgId, id);
  if (!list) notFound();
  const { all } = await searchCompanies(s.orgId, parseFilters({ lista: id, status: "todos" }));
  return (
    <div className="pb-10">
      <PageHeader eyebrow="Lista" title={list.name}>
        <RenameList listId={id} name={list.name} />
        <Link href={`/radar?lista=${id}`} className="inline-flex h-8 items-center rounded-md border border-line bg-paper px-2.5 text-[13px] font-medium hover:border-ink/40">Ver no mapa</Link>
        <a href={`/api/companies/export?lista=${id}&status=todos`} download className="inline-flex h-8 items-center rounded-md bg-orange px-2.5 text-[13px] font-medium text-white hover:bg-orange-deep">Exportar CSV</a>
        <DeleteButton kind="list" id={id} name={list.name} redirectTo="/listas" />
      </PageHeader>
      <div className="px-4 md:px-8">
        <Card>
          {all.length === 0 ? (
            <EmptyState title="Lista vazia">Adicione empresas pela ficha no Radar.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-4 py-2.5 font-medium">Geral</th>
                    <th className="px-2 py-2.5 font-medium">Empresa</th>
                    <th className="px-2 py-2.5 font-medium">Local</th>
                    <th className="px-2 py-2.5 font-medium">Perfil</th>
                    <th className="px-2 py-2.5 font-medium">Recomendadas</th>
                    <th className="px-2 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {all.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5"><ScorePill value={r.scores.geral} size="sm" /></td>
                      <td className="px-2 py-2.5">
                        <Link href={`/radar?lista=${id}&status=todos&empresa=${r.id}`} className="font-medium hover:text-orange-deep">{r.nome}</Link>
                        {r.isDemo && <DemoBadge className="ml-1.5" />}
                      </td>
                      <td className="px-2 py-2.5 text-muted">{r.municipio}/{r.uf}</td>
                      <td className="px-2 py-2.5 text-muted">{r.parceiroTipo ? TIPOS_PARCEIRO[r.parceiroTipo as TipoParceiro].label : r.setor}</td>
                      <td className="px-2 py-2.5"><span className="flex flex-wrap gap-1">{r.recomendadas.map((k) => <Badge key={k}>{SOLUCOES[k as Solucao].curto} {r.scores[k as Solucao]}</Badge>)}</span></td>
                      <td className="px-2 py-2.5">{STATUS_EMPRESA[r.status as keyof typeof STATUS_EMPRESA]}</td>
                      <td className="px-4 py-2.5 text-right"><RemoveItem listId={id} companyId={r.id} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
