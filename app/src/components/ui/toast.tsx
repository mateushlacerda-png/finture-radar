"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cx } from "./index";

type Toast = { id: number; text: string; tone: "ok" | "error" };
const Ctx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t, { id, text, tone }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "toast pointer-events-auto flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-sm shadow-[var(--shadow-pop)]",
              t.tone === "error" ? "bg-wine text-white" : "bg-ink text-cream",
            )}
          >
            <span className={cx("size-1.5 rounded-full", t.tone === "error" ? "bg-white" : "bg-orange")} aria-hidden />
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
