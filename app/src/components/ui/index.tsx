"use client";

import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type PointerEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

import { cx } from "@/lib/cx";

export { cx };

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-orange text-white hover:bg-orange-deep border-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(194,74,29,0.35)]",
  secondary: "bg-paper text-ink border-line hover:border-ink/30 shadow-[var(--shadow-card)]",
  ghost: "bg-transparent text-ink border-transparent hover:bg-ink/5",
  danger: "bg-paper text-wine border-wine/30 hover:bg-wine hover:text-white",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }>(
  function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...rest }, ref) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cx(
          "pressable inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition-[color,background-color,border-color,transform] duration-150 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap",
          size === "sm" ? "h-8 px-2.5 text-[13px]" : "h-9 px-3.5 text-sm",
          variants[variant],
          className,
        )}
        {...rest}
      >
        {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
        {children}
      </button>
    );
  },
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={cx("h-9 w-full rounded-md border border-line bg-paper px-3 text-sm transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-orange focus:shadow-[0_0_0_3px_rgba(234,98,45,0.14)] focus:outline-none", className)}
      {...rest}
    />
  );
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx("h-9 w-full rounded-md border border-line bg-paper px-2.5 text-sm transition-[border-color,box-shadow] duration-150 focus:border-orange focus:shadow-[0_0_0_3px_rgba(234,98,45,0.14)] focus:outline-none", className)} {...rest}>
      {children}
    </select>
  );
}

export function Label({ children, htmlFor, className }: { children: ReactNode; htmlFor?: string; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cx("mb-1 block text-xs font-medium text-muted", className)}>
      {children}
    </label>
  );
}

/** Grava a posição do cursor no próprio card (não no pai) para o holofote do CSS. */
const trackPointer = (e: PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
};

export function Card({ children, className, spotlight }: { children: ReactNode; className?: string; spotlight?: boolean }) {
  return (
    <section
      onPointerMove={spotlight ? trackPointer : undefined}
      className={cx("rounded-lg border border-line bg-paper shadow-[var(--shadow-card)]", spotlight && "spotlight", className)}
    >
      {children}
    </section>
  );
}

export function Badge({ children, tone = "neutral", className, title }: { children: ReactNode; tone?: "neutral" | "orange" | "wine" | "success" | "ink" | "gold"; className?: string; title?: string }) {
  const tones = {
    neutral: "bg-cream-2 text-ink/80",
    orange: "bg-orange-soft text-orange-deep",
    wine: "bg-wine/10 text-wine",
    success: "bg-success/12 text-success",
    ink: "bg-ink text-cream",
    gold: "bg-gold/15 text-[#8a6a22]",
  };
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium leading-none", tones[tone], className)}>
      {children}
    </span>
  );
}

export function scoreTone(v: number) {
  return v >= 80 ? "strong" : v >= 60 ? "good" : v >= 40 ? "mid" : "low";
}

export function ScorePill({ value, size = "md", label }: { value: number; size?: "sm" | "md" | "lg"; label?: string }) {
  const t = scoreTone(value);
  const color = { strong: "bg-orange text-white", good: "bg-orange-soft text-orange-deep", mid: "bg-cream-2 text-ink", low: "bg-ink/5 text-muted" }[t];
  const sz = { sm: "h-6 min-w-8 text-xs", md: "h-7 min-w-10 text-sm", lg: "h-12 min-w-14 text-2xl" }[size];
  return (
    <span className={cx("inline-flex items-center justify-center rounded-md px-1.5 font-display font-semibold tabular", color, sz)} aria-label={`${label ?? "Score"} ${value} de 100`}>
      {value}
    </span>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="wine" className={className} title="Registro gerado para demonstração. Não é uma empresa real.">
      Dado simulado
    </Badge>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="rule-accent w-16" />
      <p className="font-display text-base font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton rounded-md", className)} />;
}

/** Modal com <dialog> nativo: foco preso, Esc fecha, fundo inerte. */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        "modal m-auto w-[calc(100%-2rem)] rounded-lg border border-line bg-paper p-0 text-ink shadow-[var(--shadow-pop)]",
        wide ? "max-w-2xl" : "max-w-md",
      )}
      aria-labelledby="modal-title"
    >
      {open && (
        <div className="p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id="modal-title" className="font-display text-lg font-semibold">
              {title}
            </h2>
            <button onClick={onClose} className="pressable -m-1 rounded-md p-1 text-muted transition-colors hover:bg-ink/5 hover:text-ink" aria-label="Fechar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
