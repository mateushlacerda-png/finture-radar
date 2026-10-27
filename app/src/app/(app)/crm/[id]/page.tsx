import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Composer, DetailsForm, StageControl, Tasks, Timeline } from "@/components/crm/opportunity";
import { Badge, Card, DemoBadge } from "@/components/ui";
import { canManage, requireSession } from "@/lib/auth/session";
import { etapaLabel, FUNIS, SOLUCOES, type Etapa, type Solucao } from "@/lib/domain";
import { getOpportunity, listUsers } from "@/lib/queries/crm";
import { nomeExibicao } from "@/lib/nome";

export const metadata: Metadata = { title: "Oportunidade" };

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [op, users] = await Promise.all([getOpportunity(s.orgId, id), listUsers(s.orgId)]);
  if (!op) notFound();
  const editable = canManage(s) || op.op.ownerId === s.userId;
  const userOpts = users.map((u) => ({ id: u.id, name: u.name }));
  const nome = nomeExibicao(op.company);
  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-6 md:px-8">
      <nav className="mb-3 text-xs text-muted">
        <Link href={`/crm?funil=${op.op.funnel}`} className="hover:text-ink">CRM · {FUNIS[op.op.funnel]}</Link>
      </nav>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            {(op.op.isDemo || op.company.isDemo) && <DemoBadge />}
            <Badge tone={op.op.stage === "ganho" ? "success" : op.op.stage === "perdido" ? "wine" : "orange"}>{etapaLabel(op.op.stage)}</Badge>
            <Badge>{SOLUCOES[op.op.solution as Solucao]?.label}</Badge>
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{nome}</h1>
          <p className="text-sm text-muted">{op.company.municipio}/{op.company.uf} · aberta em {new Date(op.op.createdAt).toLocaleDateString("pt-BR")}</p>
          {op.op.lostReason && <p className="mt-1 text-sm text-wine">Motivo da perda: {op.op.lostReason}</p>}
        </div>
        <Link href={`/radar?q=${encodeURIComponent(nome)}&status=todos&empresa=${op.company.id}`} className="text-sm text-orange-deep underline-offset-2 hover:underline">Ver empresa no Radar</Link>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card className="p-5">
            <StageControl id={op.op.id} stage={op.op.stage as Etapa} editable={editable} />
          </Card>
          <Card className="p-5">
            <h2 className="eyebrow mb-3">Registrar</h2>
            <Composer id={op.op.id} editable={editable} />
            <h2 className="eyebrow mb-3 mt-6">Histórico</h2>
            <Timeline items={op.activities} />
          </Card>
        </div>
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="eyebrow mb-3">Responsável e próxima ação</h2>
            <DetailsForm id={op.op.id} ownerId={op.op.ownerId} nextAction={op.op.nextAction} nextActionAt={op.op.nextActionAt}
              users={userOpts} canReassign={canManage(s)} editable={editable} />
          </Card>
          <Card className="p-5">
            <h2 className="eyebrow mb-3">Tarefas e compromissos</h2>
            <Tasks id={op.op.id} tasks={op.tasks} users={userOpts} editable={editable} />
          </Card>
        </div>
      </div>
    </div>
  );
}
