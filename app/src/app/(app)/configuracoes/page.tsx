import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { Calibration } from "@/components/calibration";
import { PageHeader } from "@/components/shell";
import { Card } from "@/components/ui";
import { canManage, requireSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { auditEvents, suppressions, users } from "@/lib/db/schema";
import { ROLES } from "@/lib/domain";
import { getWeights } from "@/lib/queries/companies";
import { listUsers } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "Configurações" };

const ACOES: Record<string, string> = {
  descartar: "Descartou lead",
  restaurar: "Restaurou lead",
  registrar_contato: "Registrou contato",
  lgpd_oposicao: "Registrou oposição (LGPD)",
  lgpd_remocao: "Registrou remoção (LGPD)",
  criar_lista: "Criou lista",
  adicionar_lista: "Adicionou à lista",
  excluir_lista: "Excluiu lista",
  criar_oportunidade: "Criou oportunidade",
  mover_etapa: "Moveu etapa",
  editar_oportunidade: "Editou oportunidade",
  calibrar_score: "Calibrou o score",
  exportar_csv: "Exportou CSV",
};

export default async function ConfigPage() {
  const s = await requireSession();
  const db = await getDb();
  const [{ weights, version }, team, supp, audit] = await Promise.all([
    getWeights(s.orgId),
    listUsers(s.orgId),
    db.select({ id: suppressions.id, cnpj: suppressions.cnpj, kind: suppressions.kind, requester: suppressions.requester, createdAt: suppressions.createdAt, by: users.name })
      .from(suppressions).leftJoin(users, eq(users.id, suppressions.createdBy)).where(eq(suppressions.orgId, s.orgId)).orderBy(desc(suppressions.createdAt)),
    canManage(s)
      ? db.select({ id: auditEvents.id, action: auditEvents.action, entity: auditEvents.entity, entityId: auditEvents.entityId, createdAt: auditEvents.createdAt, by: users.name })
          .from(auditEvents).leftJoin(users, eq(users.id, auditEvents.userId)).where(eq(auditEvents.orgId, s.orgId)).orderBy(desc(auditEvents.createdAt)).limit(40)
      : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8 pb-10">
      <PageHeader eyebrow="Configurações" title="Motor de score e governança" />

      <section className="px-4 md:px-8">
        <h2 className="font-display text-lg font-semibold">Calibração dos pesos</h2>
        <p className="mb-4 max-w-3xl text-sm text-muted">
          Cada score é a média ponderada dos critérios. Os pesos são relativos: o percentual ao lado mostra a participação real de cada critério.
          {s.role === "admin" ? " Cada gravação cria uma versão nova e fica na auditoria." : " Só o perfil Admin altera os pesos."}
          {" "}Quando houver histórico suficiente de ganhos e perdas, a calibração passa a ser sugerida por modelo (ver ARQUITETURA.md, fase 4).
        </p>
        <Calibration weights={weights} version={version} editable={s.role === "admin"} mostrarDistribuicao={canManage(s)} />
      </section>

      <section className="grid gap-4 px-4 md:px-8 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-display text-base font-semibold">Equipe</h2>
          <ul className="divide-y divide-line text-sm">
            {team.map((u) => (
              <li key={u.id} className="flex justify-between py-2">
                <span>{u.name} <span className="text-xs text-muted">{u.email}</span></span>
                <span className="text-muted">{ROLES[u.role]}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Convites e gestão de usuários entram com a troca da autenticação (ADR-003).</p>
        </Card>
        <Card className="p-5">
          <h2 className="mb-1 font-display text-base font-semibold">Pedidos de titulares (LGPD)</h2>
          <p className="mb-3 text-xs text-muted">Empresas com oposição ou remoção registrada não aparecem no Radar desta organização.</p>
          {supp.length === 0 ? <p className="text-sm text-muted">Nenhum pedido registrado.</p> : (
            <ul className="divide-y divide-line text-sm">
              {supp.map((x) => (
                <li key={x.id} className="py-2">
                  <span className="font-medium">{x.kind === "oposicao" ? "Oposição" : "Remoção"}</span> · CNPJ {x.cnpj}
                  <span className="block text-xs text-muted">{x.requester} · registrado por {x.by ?? "?"} em {new Date(x.createdAt).toLocaleDateString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {canManage(s) && (
        <section className="px-4 md:px-8">
          <Card className="p-5">
            <h2 className="mb-3 font-display text-base font-semibold">Auditoria recente</h2>
            {audit.length === 0 ? <p className="text-sm text-muted">Sem eventos.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-2 font-medium">Quando</th><th className="py-2 font-medium">Quem</th><th className="py-2 font-medium">Ação</th><th className="py-2 font-medium">Registro</th></tr></thead>
                  <tbody>
                    {audit.map((a) => (
                      <tr key={a.id} className="border-b border-line last:border-0">
                        <td className="py-2 text-muted tabular">{new Date(a.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td className="py-2">{a.by ?? "?"}</td>
                        <td className="py-2">{ACOES[a.action] ?? a.action}</td>
                        <td className="py-2 text-xs text-muted">{a.entity} {a.entityId?.slice(0, 8)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}
