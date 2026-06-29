"use client";

import { useRouter } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

export default function Header() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="header-glass flex items-center justify-between px-5 py-3 sticky top-0 z-50">
      <button
        type="button"
        onClick={() => router.push("/")}
        className="flex items-center gap-3 opacity-90 transition-opacity hover:opacity-100"
        aria-label="Go to home"
      >
        <div style={{ lineHeight: 1.05 }}>
          <div style={{ fontSize: "11px", fontWeight: 300, letterSpacing: "0.14em", color: "var(--text-label)", fontFamily: "system-ui,-apple-system,sans-serif" }}>
            APPLIED
          </div>
          <div style={{ fontSize: "13px", fontWeight: 800, letterSpacing: "0.08em", color: "var(--accent)", fontFamily: "system-ui,-apple-system,sans-serif" }}>
            CONTROL
          </div>
        </div>
        <span
          className="hidden sm:block text-[11px] font-semibold tracking-[0.1em]"
          style={{ color: "var(--text-label)" }}
        >
          FIELD REPAIR REPORTS
        </span>
      </button>

      <div className="flex items-center gap-1">
        <ThemeToggle />

        <div
          className="mx-1.5 h-4 w-px"
          style={{ background: "var(--border-solid)" }}
        />

        <button
          type="button"
          onClick={handleLogout}
          title="Sign out"
          className="btn btn-ghost btn-sm flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h3M9 10l3-3-3-3M12 7H5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
