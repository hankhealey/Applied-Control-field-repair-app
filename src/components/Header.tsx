"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

export default function Header() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-5 py-3">
      {/* Applied Control logo — acts as a subtle home button */}
      <button
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
        <p className="hidden sm:block text-xs font-medium tracking-widest text-zinc-400">
          FIELD REPAIR REPORTS
        </p>
      </button>

      {/* Sign out */}
      <button
        onClick={handleLogout}
        title="Sign out"
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h3M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </header>
  );
}
