"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./ui/ToastProvider";

interface TicketForm {
  name: string;
  email: string;
  subject: string;
  description: string;
}
const EMPTY: TicketForm = { name: "", email: "", subject: "", description: "" };

export default function Header() {
  const router = useRouter();
  const { toast } = useToast();

  // ── 3-dot menu ─────────────────────────────────────────────────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // ── Dark mode ───────────────────────────────────────────────────────────────
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
    setMenuOpen(false);
  }

  // ── Ticket ──────────────────────────────────────────────────────────────────
  const [ticketOpen, setTicketOpen] = useState(false);
  const [form, setForm] = useState<TicketForm>(EMPTY);
  const [loading, setLoading] = useState(false);

  function setField(f: keyof TicketForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [f]: e.target.value }));
  }

  function closeTicket() { setTicketOpen(false); setForm(EMPTY); }

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast("Ticket submitted — we'll follow up via email", "success");
        closeTicket();
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error ?? "Failed to submit ticket", "error");
      }
    } catch {
      toast("Network error — please try again", "error");
    } finally {
      setLoading(false);
    }
  }

  // ── Sign out ────────────────────────────────────────────────────────────────
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="header-glass flex items-center justify-between px-5 py-3 sticky top-0 z-50">
        {/* Logo */}
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
          <span className="hidden sm:block text-[11px] font-semibold tracking-[0.1em]" style={{ color: "var(--text-label)" }}>
            FIELD REPAIR REPORTS
          </span>
        </button>

        {/* 3-dot menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="8" cy="3" r="1.4" />
              <circle cx="8" cy="8" r="1.4" />
              <circle cx="8" cy="13" r="1.4" />
            </svg>
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-52 rounded-xl border py-1 shadow-xl"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border-solid)",
                zIndex: 60,
              }}
            >
              {/* Dark mode */}
              <button
                type="button"
                onClick={toggleDark}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                style={{ color: "var(--text-primary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {dark ? (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M13.5 9.5A5.5 5.5 0 016.5 2.5a5.5 5.5 0 000 11 5.5 5.5 0 007-4z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {dark ? "Light Mode" : "Dark Mode"}
              </button>

              {/* Report a problem */}
              <button
                type="button"
                onClick={() => { setTicketOpen(true); setMenuOpen(false); }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                style={{ color: "var(--text-primary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 12.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm.75-4.25a.75.75 0 0 1-1.5 0V6.75a.75.75 0 0 1 1.5 0v3.5Z" fill="currentColor" />
                </svg>
                Report a Problem
              </button>

              <div className="my-1 mx-3 h-px" style={{ background: "var(--border-solid)" }} />

              {/* Sign out */}
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors"
                style={{ color: "var(--color-error, #dc2626)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <svg width="15" height="15" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h3M9 10l3-3-3-3M12 7H5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Ticket modal */}
      {ticketOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Report a problem"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,.45)" }}
          onClick={(e) => e.target === e.currentTarget && closeTicket()}
        >
          <div
            className="w-full max-w-md rounded-2xl border p-6 shadow-xl"
            style={{ background: "var(--bg-card)", borderColor: "var(--border-solid)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                Report a Problem
              </h2>
              <button
                type="button"
                onClick={closeTicket}
                aria-label="Close"
                className="rounded-lg p-1 transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-secondary)" }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>

            <form onSubmit={submitTicket} className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Your name <span style={{ color: "var(--text-label)" }}>(optional)</span>
                </label>
                <input type="text" value={form.name} onChange={setField("name")} className="input w-full" placeholder="Jane Smith" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Your email <span style={{ color: "var(--color-error, #dc2626)" }}>*</span>
                </label>
                <input type="email" value={form.email} onChange={setField("email")} required className="input w-full" placeholder="jane@example.com" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Subject <span style={{ color: "var(--color-error, #dc2626)" }}>*</span>
                </label>
                <input type="text" value={form.subject} onChange={setField("subject")} required className="input w-full" placeholder="Brief description of the issue" />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Description <span style={{ color: "var(--color-error, #dc2626)" }}>*</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={setField("description")}
                  required
                  rows={4}
                  maxLength={2000}
                  className="input w-full resize-none"
                  placeholder="What happened? What were you expecting?"
                />
                <p className="mt-1 text-right text-xs" style={{ color: "var(--text-label)" }}>
                  {form.description.length}/2000
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeTicket}
                  disabled={loading}
                  className="btn btn-ghost flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="btn btn-primary flex-1"
                >
                  {loading ? "Submitting…" : "Submit Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
