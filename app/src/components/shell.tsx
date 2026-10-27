"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { logoutAction } from "@/lib/actions/auth";
import { ROLES, type Role } from "@/lib/domain";
import { cx } from "./ui";
import { ToastProvider } from "./ui/toast";
import { IconArrowRight, IconDashboard, IconKanban, IconList, IconLogout, IconRadar, IconSearch, IconSettings, IconSidebar } from "./icons";

const NAV = [
  { href: "/", label: "Dashboard", long: "Dashboard", icon: IconDashboard },
  { href: "/radar", label: "Radar", long: "Radar", icon: IconRadar },
  { href: "/listas", label: "Listas", long: "Listas", icon: IconList },
  { href: "/crm", label: "CRM", long: "CRM", icon: IconKanban },
  { href: "/configuracoes", label: "Ajustes", long: "Configurações", icon: IconSettings },
];

/** Altura de um item do menu + espaço entre eles; o indicador ativo desliza nesse passo. */
const STEP = 38;

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export type DataNote = { kind: "demo" | "real" | "misto" | "vazio"; competencia: string | null };

function DataBanner({ note }: { note: DataNote }) {
  if (note.kind === "demo")
    return (
      <span className="flex min-w-0 items-center gap-2 text-wine">
        <Dot tone="wine" />
        <strong className="font-semibold">Ambiente de demonstração.</strong>
        <span className="hidden truncate text-ink/65 lg:inline">Empresas, contatos e oportunidades são simulados. Nenhum dado se refere a empresa real.</span>
      </span>
    );
  const fonte = `Cadastro CNPJ da Receita Federal${note.competencia ? `, competência ${note.competencia}` : ""}`;
  return (
    <span className="flex min-w-0 items-center gap-2 text-ink/75">
      <Dot tone={note.kind === "vazio" ? "muted" : "success"} />
      <strong className="font-semibold text-ink">{note.kind === "vazio" ? "Base vazia." : "Dados reais."}</strong>
      <span className="hidden truncate lg:inline">
        {note.kind === "misto" ? `${fonte}, junto com registros simulados (marcados).` : note.kind === "vazio" ? "Rode a ingestão da Receita." : `${fonte}. Usuários e permissões ainda são de demonstração.`}
      </span>
    </span>
  );
}

function Dot({ tone }: { tone: "wine" | "success" | "muted" }) {
  const bg = { wine: "bg-wine", success: "bg-success", muted: "bg-ink/40" }[tone];
  return (
    <span className="relative flex size-1.5 shrink-0" aria-hidden>
      {tone !== "muted" && <span className={cx("absolute inset-0 rounded-full [animation:ping-soft_1.6s_var(--ease-out)_3]", bg)} />}
      <span className={cx("relative size-1.5 rounded-full", bg)} />
    </span>
  );
}

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

export function Shell({ user, dataNote, collapsed: initialCollapsed, children }: { user: { name: string; role: Role; orgName: string }; dataNote: DataNote; collapsed?: boolean; children: ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(!!initialCollapsed);
  // Atalho de teclado troca sem animação: ação repetida não deve esperar transição.
  const [instant, setInstant] = useState(false);
  const [palette, setPalette] = useState(false);
  const activeIndex = NAV.findIndex((n) => isActive(path, n.href));
  const current = NAV[activeIndex];

  const toggle = useCallback((fromKeyboard = false) => {
    setInstant(fromKeyboard);
    setCollapsed((c) => {
      document.cookie = `radar_sidebar=${c ? "0" : "1"}; path=/; max-age=31536000; samesite=lax`;
      return !c;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggle(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  return (
    <ToastProvider>
      <div className="flex min-h-dvh">
        <aside
          data-collapsed={collapsed || undefined}
          className={cx(
            "group/side sticky top-0 hidden h-dvh shrink-0 flex-col overflow-hidden bg-ink text-cream md:flex",
            "w-[232px] data-[collapsed]:w-[68px]",
            instant ? "transition-none" : "transition-[width] duration-[260ms] ease-[var(--ease-in-out)]",
          )}
        >
          <div className="bg-grid-dark pointer-events-none absolute inset-x-0 top-0 h-64 [mask-image:linear-gradient(to_bottom,#000,transparent)]" aria-hidden />
          <div className="pointer-events-none absolute -left-16 -top-24 size-56 rounded-full bg-orange/20 blur-3xl" aria-hidden />

          <div className="relative flex h-16 items-center gap-2.5 px-4">
            <Link href="/" className="pressable flex min-w-0 items-center gap-2.5" aria-label="Finture Radar, início">
              <RadarMark />
              <span className="whitespace-nowrap font-display text-[15px] font-semibold tracking-tight text-cream transition-opacity duration-200 group-data-[collapsed]/side:opacity-0">
                Finture <span className="text-cream/50">Radar</span>
              </span>
            </Link>
          </div>

          <div className="relative px-3 pb-3">
            <button
              onClick={() => setPalette(true)}
              className="pressable flex h-9 w-full items-center gap-2.5 rounded-md border border-line-dark bg-white/[0.03] px-2.5 text-[13px] text-cream/55 transition-colors hover:border-cream/20 hover:text-cream/80"
              aria-label="Abrir busca rápida"
              title="Busca rápida (Ctrl K)"
            >
              <IconSearch width={16} height={16} className="shrink-0" />
              <span className="flex-1 whitespace-nowrap text-left transition-opacity duration-200 group-data-[collapsed]/side:opacity-0">Buscar…</span>
              <Kbd className="group-data-[collapsed]/side:opacity-0">Ctrl K</Kbd>
            </button>
          </div>

          <p className="eyebrow relative px-6 pb-2 !text-[10px] !text-cream/35 transition-opacity duration-200 group-data-[collapsed]/side:opacity-0">Navegação</p>
          <nav className="relative flex-1 px-3" aria-label="Principal">
            {activeIndex >= 0 && (
              <span
                aria-hidden
                className="absolute inset-x-3 top-0 h-9 rounded-md bg-white/[0.07] shadow-[inset_0_0_0_1px_rgba(248,241,231,0.06)] transition-transform duration-300 ease-[var(--ease-out)]"
                style={{ transform: `translateY(${activeIndex * STEP}px)` }}
              >
                <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-orange shadow-[0_0_12px_rgba(234,98,45,0.8)]" />
              </span>
            )}
            <ul className="relative flex flex-col gap-[2px]">
              {NAV.map(({ href, long, icon: Icon }) => {
                const active = isActive(path, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "group/item pressable relative flex h-9 items-center gap-3 rounded-md px-[11px] text-sm transition-colors duration-150",
                        active ? "text-white" : "text-cream/60 hover:bg-white/[0.03] hover:text-cream",
                      )}
                    >
                      <Icon className={cx("shrink-0 transition-colors duration-150", active && "text-orange")} />
                      <span className="whitespace-nowrap transition-opacity duration-200 group-data-[collapsed]/side:opacity-0">{long}</span>
                      <Tip>{long}</Tip>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="relative border-t border-line-dark p-3">
            <div className="flex items-center gap-2.5 rounded-md px-1 py-1">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-orange to-wine font-display text-xs font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]">
                {initials(user.name)}
              </span>
              <span className="min-w-0 flex-1 transition-opacity duration-200 group-data-[collapsed]/side:opacity-0">
                <span className="block truncate text-sm font-medium text-cream">{user.name}</span>
                <span className="block truncate text-[11px] text-cream/50">{ROLES[user.role]} · {user.orgName}</span>
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1 group-data-[collapsed]/side:flex-col">
              <form action={logoutAction} className="flex-1 group-data-[collapsed]/side:w-full">
                <button className="pressable flex h-8 w-full items-center gap-2 rounded-md px-[11px] text-xs text-cream/55 transition-colors hover:bg-white/[0.04] hover:text-cream" title="Sair">
                  <IconLogout width={15} height={15} className="shrink-0" />
                  <span className="whitespace-nowrap group-data-[collapsed]/side:hidden">Sair</span>
                </button>
              </form>
              <button
                onClick={() => toggle()}
                className="pressable grid size-8 shrink-0 place-items-center rounded-md text-cream/55 transition-colors hover:bg-white/[0.04] hover:text-cream group-data-[collapsed]/side:w-full"
                aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
                aria-expanded={!collapsed}
                title={`${collapsed ? "Expandir" : "Recolher"} menu (Ctrl B)`}
              >
                <IconSidebar width={15} height={15} />
              </button>
            </div>
          </div>
        </aside>

        <div className="flex h-dvh min-w-0 flex-1 flex-col pb-16 md:pb-0">
          <header className="relative z-10 flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line bg-paper/80 px-4 text-xs backdrop-blur-md md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <span className="hidden items-center gap-1.5 text-[13px] sm:flex">
                <span className="text-muted">Radar</span>
                <span className="text-ink/25">/</span>
                <span className="font-medium text-ink">{current?.long ?? "Início"}</span>
              </span>
              <span className="hidden h-4 w-px bg-line sm:block" aria-hidden />
              <DataBanner note={dataNote} />
            </div>
            <button
              onClick={() => setPalette(true)}
              className="pressable flex items-center gap-2 rounded-md border border-line bg-paper px-2 py-1 text-muted shadow-[var(--shadow-card)] transition-colors hover:border-ink/25 hover:text-ink md:hidden"
              aria-label="Abrir busca rápida"
            >
              <IconSearch width={14} height={14} />
            </button>
          </header>
          <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto">
            <div className="bg-grid fade-mask pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden />
            <div className="relative h-full">{children}</div>
          </main>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line-dark bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden" aria-label="Principal">
          {activeIndex >= 0 && (
            <span
              aria-hidden
              className="absolute top-0 h-0.5 rounded-b-full bg-orange shadow-[0_0_12px_rgba(234,98,45,0.9)] transition-transform duration-300 ease-[var(--ease-out)]"
              style={{ width: `${100 / NAV.length}%`, transform: `translateX(${activeIndex * 100}%)` }}
            />
          )}
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(path, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx("pressable flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors", active ? "text-white" : "text-cream/55")}
              >
                <Icon className={active ? "text-orange" : undefined} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
    </ToastProvider>
  );
}

/** Rótulo que aparece só com o menu recolhido. */
function Tip({ children }: { children: ReactNode }) {
  return (
    <span
      role="tooltip"
      className={cx(
        "pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-ink-2 px-2 py-1 text-xs text-cream shadow-[var(--shadow-pop)] ring-1 ring-line-dark",
        "origin-left scale-95 opacity-0 transition-[opacity,transform] duration-150 ease-[var(--ease-out)]",
        "group-data-[collapsed]/side:block group-hover/item:scale-100 group-hover/item:opacity-100 group-hover/item:delay-100 group-focus-visible/item:scale-100 group-focus-visible/item:opacity-100",
      )}
    >
      {children}
    </span>
  );
}

function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cx("rounded border border-line-dark bg-white/[0.04] px-1.5 py-px font-sans text-[10px] text-cream/45 transition-opacity duration-200", className)}>{children}</kbd>;
}

function RadarMark() {
  return (
    <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-gradient-to-br from-orange to-orange-deep shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_4px_14px_-4px_rgba(234,98,45,0.7)]" aria-hidden>
      <span className="absolute inset-[7px] rounded-full border border-white/35" />
      <span className="absolute inset-[12px] rounded-full border border-white/45" />
      <span className="animate-sweep absolute inset-0 [animation:sweep_4s_linear_infinite] [background:conic-gradient(from_0deg,transparent_0deg,transparent_290deg,rgba(255,255,255,0.55)_360deg)]" />
      <span className="relative size-1.5 rounded-full bg-white" />
    </span>
  );
}

type Cmd = { id: string; label: string; hint: string; icon: typeof IconRadar; run: () => void };

/**
 * Busca rápida (Ctrl K). Sem animação de abrir ou fechar: é aberta pelo teclado,
 * muitas vezes por dia, e precisa estar pronta no mesmo instante.
 */
function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  const go = useCallback(
    (href: string) => {
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const items = useMemo<Cmd[]>(() => {
    const term = q.trim();
    const nav: Cmd[] = NAV.map((n) => ({ id: n.href, label: n.long, hint: "Ir para", icon: n.icon, run: () => go(n.href) }));
    const extra: Cmd[] = [
      { id: "score80", label: "Empresas com score 80+", hint: "Radar", icon: IconRadar, run: () => go("/radar?scoreMin=80") },
      { id: "prospect", label: "Empresas em prospecção", hint: "Radar", icon: IconRadar, run: () => go("/radar?status=prospectado") },
    ];
    const all = [...nav, ...extra].filter((c) => !term || c.label.toLowerCase().includes(term.toLowerCase()));
    if (term.length >= 2)
      all.unshift({ id: "busca", label: `Buscar “${term}” no Radar`, hint: "Nome ou CNPJ", icon: IconSearch, run: () => go(`/radar?q=${encodeURIComponent(term)}`) });
    return all;
  }, [q, go]);

  const active = Math.min(sel, Math.max(0, items.length - 1));

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-xl border border-line bg-paper/95 p-0 text-ink shadow-[var(--shadow-pop)] backdrop-blur-xl backdrop:bg-ink/35"
      aria-label="Busca rápida"
    >
      <div className="flex items-center gap-2.5 border-b border-line px-4">
        <IconSearch width={17} height={17} className="shrink-0 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
          }}
          placeholder="Ir para uma tela ou buscar empresa…"
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted focus-visible:outline-none"
          aria-label="Buscar"
          role="combobox"
          aria-expanded
          aria-controls="cmd-list"
          aria-activedescendant={items[active] ? `cmd-${items[active].id}` : undefined}
        />
        <kbd className="rounded border border-line px-1.5 py-px text-[10px] text-muted">Esc</kbd>
      </div>
      <ul id="cmd-list" role="listbox" className="max-h-80 overflow-y-auto p-1.5">
        {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nada encontrado.</li>}
        {items.map((c, i) => (
          <li key={c.id} id={`cmd-${c.id}`} role="option" aria-selected={i === active}>
            <button
              onMouseMove={() => setSel(i)}
              onClick={c.run}
              className={cx("flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm", i === active ? "bg-ink text-cream" : "text-ink/80")}
            >
              <c.icon width={16} height={16} className={i === active ? "text-orange" : "text-muted"} />
              <span className="flex-1 truncate">{c.label}</span>
              <span className={cx("text-[11px]", i === active ? "text-cream/55" : "text-muted")}>{c.hint}</span>
              {i === active && <IconArrowRight width={14} height={14} className="text-cream/70" />}
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <header className="flex animate-enter flex-wrap items-end justify-between gap-3 px-4 pb-5 pt-7 md:px-8">
      <div>
        {eyebrow && (
          <p className="eyebrow mb-1.5 flex items-center gap-2">
            <span className="h-px w-4 bg-orange" aria-hidden />
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-[30px]">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
