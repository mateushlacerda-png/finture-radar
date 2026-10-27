import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect("/");
  const { next } = await searchParams;
  const demo = process.env.DATABASE_URL === undefined || process.env.RADAR_DEMO === "1";
  return (
    <div className="grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 text-cream md:flex">
        <div className="bg-grid-dark absolute inset-0 [mask-image:radial-gradient(ellipse_at_30%_50%,#000_20%,transparent_75%)]" aria-hidden />
        <div className="absolute -left-32 -top-32 size-96 rounded-full bg-orange/20 blur-[100px]" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-on-dark.svg" alt="Finture" className="relative z-10 h-16 w-auto self-start" />
        <div className="stagger relative z-10 max-w-md">
          <p className="eyebrow mb-5 inline-flex items-center gap-2 rounded-full border border-orange/30 bg-orange/10 px-3 py-1 !text-orange"><span className="size-1.5 rounded-full bg-orange shadow-[0_0_8px_rgba(234,98,45,0.9)]" aria-hidden />Inteligência comercial</p>
          <h1 className="bg-gradient-to-b from-cream to-cream/70 bg-clip-text font-display text-[46px] font-semibold leading-[1.04] tracking-tight text-transparent">
            Saber quem abordar, por quê e com qual solução.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-cream/70">
            Empresas priorizadas por aderência às soluções da Finture, com o motivo de cada nota à vista e o funil de abordagem no mesmo lugar.
          </p>
        </div>
        <p className="relative z-10 text-xs text-cream/45">Finture Radar · uso interno</p>
        <RadarArt />
      </section>
      <section className="relative flex items-center justify-center overflow-hidden p-6">
        <div className="bg-grid fade-mask absolute inset-0" aria-hidden />
        <div className="stagger relative w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-finture.svg" alt="Finture" className="mb-8 h-12 w-auto md:hidden" />
          <h2 className="font-display text-2xl font-semibold">Entrar no Radar</h2>
          <div className="rule-accent my-4 w-24" />
          <LoginForm next={next} />
          {demo && (
            <div className="mt-8 rounded-md border border-wine/25 bg-wine/[0.04] p-3.5 text-xs leading-relaxed text-ink/80">
              <p className="mb-1 font-semibold text-wine">Ambiente de demonstração</p>
              Senha de todos os usuários: <code className="font-mono">radar-demo-2026</code>
              <ul className="mt-1.5 space-y-0.5">
                <li><code className="font-mono">admin@finture.demo</code> (admin, calibra o score)</li>
                <li><code className="font-mono">gestor@finture.demo</code> (gestor comercial)</li>
                <li><code className="font-mono">juliana@finture.demo</code> (executiva comercial)</li>
              </ul>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function RadarArt() {
  // Radar com varredura e pontos detectados: referência ao produto, sem imitar mapa real.
  const blips: [number, number, number, number][] = [[68, 30, 7, 0], [62, 66, 5, 1.1], [34, 42, 4, 2.3], [78, 54, 6, 0.6], [40, 74, 3, 3.1], [56, 22, 4, 1.8], [26, 60, 5, 2.7]];
  return (
    <div className="pointer-events-none absolute -right-48 top-1/2 size-[680px] -translate-y-1/2" aria-hidden>
      <div className="absolute inset-0 rounded-full border border-cream/10" />
      {[14, 28, 42].map((i) => (
        <div key={i} className="absolute rounded-full border border-cream/[0.08]" style={{ inset: `${i}%` }} />
      ))}
      <div className="absolute inset-x-0 top-1/2 h-px bg-cream/[0.06]" />
      <div className="absolute inset-y-0 left-1/2 w-px bg-cream/[0.06]" />
      <div className="animate-sweep absolute inset-0 rounded-full [animation:sweep_6s_linear_infinite] [background:conic-gradient(from_0deg,transparent_0deg,transparent_280deg,rgba(234,98,45,0.05)_300deg,rgba(234,98,45,0.38)_360deg)]" />
      {blips.map(([x, y, r, d], i) => (
        <span key={i} className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
          <span className="absolute -translate-1/2 rounded-full bg-orange/70 [animation:ping-soft_6s_var(--ease-out)_infinite]" style={{ width: r * 2, height: r * 2, animationDelay: `${d}s` }} />
          <span className="absolute -translate-1/2 rounded-full bg-orange shadow-[0_0_14px_rgba(234,98,45,0.9)]" style={{ width: r * 1.4, height: r * 1.4 }} />
        </span>
      ))}
      <span className="absolute left-1/2 top-1/2 size-2 -translate-1/2 rounded-full bg-cream" />
    </div>
  );
}
