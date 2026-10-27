import type { Metadata } from "next";
import Link from "next/link";
import { Board } from "@/components/crm/board";
import { PageHeader } from "@/components/shell";
import { cx } from "@/lib/cx";
import { canManage, requireSession } from "@/lib/auth/session";
import { FUNIS, type Funil } from "@/lib/domain";
import { getBoard } from "@/lib/queries/crm";

export const metadata: Metadata = { title: "CRM" };

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ funil?: string; meus?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const funil: Funil = sp.funil === "cliente" ? "cliente" : "parceiro";
  const meus = sp.meus === "1";
  const cards = await getBoard(s.orgId, funil, meus ? s.userId : undefined);
  const href = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ funil, meus: meus ? "1" : undefined, ...p }).filter(([, v]) => v) as [string, string][]);
    return `/crm?${q}`;
  };
  return (
    <div className="flex h-full flex-col">
      <PageHeader eyebrow="CRM comercial" title={FUNIS[funil]}>
        <nav className="flex rounded-md border border-line bg-paper p-0.5 text-sm" aria-label="Funil">
          {(Object.keys(FUNIS) as Funil[]).map((k) => (
            <Link key={k} href={href({ funil: k })} aria-current={k === funil ? "page" : undefined}
              className={cx("rounded px-3 py-1", k === funil ? "bg-ink text-cream" : "text-ink/70 hover:text-ink")}>
              {k === "parceiro" ? "Parceiros" : "Clientes finais"}
            </Link>
          ))}
        </nav>
        <Link href={href({ meus: meus ? undefined : "1" })} aria-pressed={meus}
          className={cx("rounded-md border px-3 py-1.5 text-sm", meus ? "border-ink bg-ink text-cream" : "border-line bg-paper text-ink/75 hover:border-ink/40")}>
          Só as minhas
        </Link>
      </PageHeader>
      <p className="-mt-2 mb-3 px-4 text-xs text-muted md:px-8">
        {funil === "parceiro"
          ? "Escritórios de investimento, family offices, consultorias CVM e imobiliárias que podem distribuir as soluções da Finture com a própria marca."
          : "Empresas com aderência a saúde coletiva, seguro empresarial ou crédito."}{" "}
        Arraste os cards entre etapas ou use o seletor de etapa no card.
      </p>
      <Board cards={cards} canEditAll={canManage(s)} me={s.userId} />
    </div>
  );
}
