"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";

interface FormState {
  name: string;
  email: string;
  subject: string;
  description: string;
}

const EMPTY: FormState = { name: "", email: "", subject: "", description: "" };

export default function SupportButton() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  function close() {
    setOpen(false);
    setForm(EMPTY);
  }

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function submit(e: React.FormEvent) {
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
        close();
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

  return (
    <>
      {/* Floating trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Report a problem"
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 12.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm.75-4.25a.75.75 0 0 1-1.5 0V6.75a.75.75 0 0 1 1.5 0v3.5Z"
            fill="currentColor"
          />
        </svg>
      </button>

      {/* Modal */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Report a problem"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,.45)" }}
          onClick={(e) => e.target === e.currentTarget && close()}
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
                onClick={close}
                aria-label="Close"
                className="rounded-lg p-1 transition-colors hover:bg-[var(--bg-hover)]"
                style={{ color: "var(--text-secondary)" }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            </div>

            <form onSubmit={submit} className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Your name <span style={{ color: "var(--text-label)" }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={set("name")}
                  className="input w-full"
                  placeholder="Jane Smith"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Your email <span style={{ color: "var(--color-error, #dc2626)" }}>*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  required
                  className="input w-full"
                  placeholder="jane@example.com"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Subject <span style={{ color: "var(--color-error, #dc2626)" }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={set("subject")}
                  required
                  className="input w-full"
                  placeholder="Brief description of the issue"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                  Description <span style={{ color: "var(--color-error, #dc2626)" }}>*</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={set("description")}
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
                <Button variant="ghost" onClick={close} className="flex-1" disabled={loading}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" loading={loading} className="flex-1">
                  Submit Ticket
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
