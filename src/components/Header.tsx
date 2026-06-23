"use client";

import Image from "next/image";
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
    <header
      className="flex items-center justify-between px-5 py-3"
      style={{
        background: "var(--bg-card)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <button type="button"
        onClick={() => router.push("/")}
        className="flex items-center gap-3 opacity-90 transition-opacity hover:opacity-100"
        aria-label="Go to home"
      >
        <Image
          src="/applied-control-logo.png"
          alt="Applied Control"
          width={240}
          height={74}
          className="h-8 w-auto"
          priority
        />
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

        <button type="button"
          onClick={handleLogout}
          title="Sign out"
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--bg-hover)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
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
