"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastState {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const TYPE_STYLES: Record<ToastType, { bg: string; text: string; icon: string }> = {
  success: { bg: "var(--color-success-bg-strong)", text: "var(--color-success-text)", icon: "✓" },
  error:   { bg: "var(--color-danger-bg-strong)",  text: "var(--color-danger-text)",  icon: "✕" },
  warning: { bg: "var(--color-warning-bg-strong)", text: "var(--color-warning-text)", icon: "!" },
  info:    { bg: "var(--color-info-bg-strong)",    text: "var(--color-info-text)",    icon: "i" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [current, setCurrent] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    setCurrent(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "info") => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setCurrent({ id: crypto.randomUUID(), message, type });
      timerRef.current = setTimeout(dismiss, 3200);
    },
    [dismiss],
  );

  const style = current ? TYPE_STYLES[current.type] : null;

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {current && style && (
        <div
          key={current.id}
          role="status"
          aria-live="polite"
          className="fixed bottom-20 sm:bottom-5 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2 duration-200"
          style={{ background: style.bg, color: style.text, maxWidth: "min(90vw, 360px)" }}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: "rgba(0,0,0,0.1)" }}>
            {style.icon}
          </span>
          <span className="flex-1">{current.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismiss}
            className="opacity-60 hover:opacity-100 transition-opacity ml-1 text-base leading-none"
          >
            ×
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
