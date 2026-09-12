"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type ToastKind = "info" | "success" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  href?: string;
  hrefLabel?: string;
  /** Stays until dismissed — errors, and "waiting for the wallet". */
  sticky?: boolean;
}

type ToastInput = Omit<Toast, "id">;

interface ToastApi {
  push: (t: ToastInput) => number;
  update: (id: number, t: Partial<ToastInput>) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastApi | null>(null);
const AUTO_DISMISS_MS = 7_000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((all) => all.filter((x) => x.id !== id));
  }, []);

  const schedule = useCallback(
    (id: number, sticky: boolean | undefined) => {
      const old = timers.current.get(id);
      if (old) clearTimeout(old);
      if (sticky) return;
      timers.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
    },
    [dismiss]
  );

  const push = useCallback(
    (t: ToastInput) => {
      const id = ++seq.current;
      setToasts((all) => [...all, { ...t, id }]);
      schedule(id, t.sticky);
      return id;
    },
    [schedule]
  );

  const update = useCallback(
    (id: number, patch: Partial<ToastInput>) => {
      setToasts((all) => all.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      schedule(id, patch.sticky);
    },
    [schedule]
  );

  const api = useMemo(() => ({ push, update, dismiss }), [push, update, dismiss]);

  const stripe = { success: "bg-good", error: "bg-bad", info: "bg-accent" } as const;

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto card relative overflow-hidden py-3 pl-5 pr-4 shadow-pop">
            <span className={`absolute inset-y-0 left-0 w-1 ${stripe[t.kind]} ${t.kind === "info" ? "animate-pulse" : ""}`} />
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[12px] leading-relaxed text-fg-2">{t.body}</p>}
                {t.href && (
                  <a
                    href={t.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-block text-[12px] font-semibold text-accent hover:underline"
                  >
                    {t.hrefLabel ?? "Aç"} ↗
                  </a>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                aria-label="Kapat"
                className="-mr-1 -mt-1 rounded-md px-1.5 text-muted hover:text-fg"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast needs ToastProvider");
  return ctx;
}
