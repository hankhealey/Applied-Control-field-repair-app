"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { useToast } from "@/components/ui/ToastProvider";
import db from "@/lib/db";
import type { Site } from "@/lib/types";

const emptySite = (): Site => ({
  id: crypto.randomUUID(),
  title: "",
  customer: "",
  location: "",
  notes: "",
});

export default function SitesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const sites = useLiveQuery(() => db.sites.toArray(), [], []);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Site | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = (sites ?? []).filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleSave() {
    if (!editing?.title.trim()) return;
    await db.sites.put(editing);
    setEditing(null);
    toast("Site saved", "success");
  }

  async function handleDeleteConfirm() {
    if (!confirmDeleteId) return;
    await db.sites.delete(confirmDeleteId);
    setConfirmDeleteId(null);
    toast("Site deleted", "info");
  }

  const siteToDelete = sites?.find((s) => s.id === confirmDeleteId);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-main)" }}>
      <Header />
      <main className="mx-auto max-w-3xl px-3 py-5 sm:px-6 sm:py-6">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mb-4 text-sm font-medium hover:underline"
          style={{ color: "var(--accent)" }}
        >
          ← Back to Reports
        </button>

        {/* Toolbar */}
        <div className="mb-4 flex items-center gap-3">
          <input
            className="input flex-1"
            placeholder="Search sites…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button variant="primary" onClick={() => setEditing(emptySite())}>
            + New Site
          </Button>
        </div>

        {/* Edit / New form */}
        {editing && (
          <div
            className="mb-5 rounded-xl border p-5 shadow-sm"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <h2
              className="mb-4 text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {sites?.find((s) => s.id === editing.id) ? "Edit Site" : "New Site"}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="label-sm mb-1.5 block">Title</span>
                <input
                  className="input"
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="label-sm mb-1.5 block">Customer</span>
                <input
                  className="input"
                  value={editing.customer}
                  onChange={(e) => setEditing({ ...editing, customer: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="label-sm mb-1.5 block">Location</span>
                <input
                  className="input"
                  value={editing.location}
                  onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="label-sm mb-1.5 block">Notes</span>
                <textarea
                  className="input"
                  rows={2}
                  value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={!editing.title.trim()}
              >
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Site list */}
        <div className="flex flex-col gap-3">
          {filtered.map((site) => (
            <div
              key={site.id}
              className="flex items-center justify-between rounded-xl border p-4"
              style={{
                background: "var(--bg-card)",
                borderColor: "var(--border)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {site.title}
                </p>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  {site.customer}
                  {site.location && ` · ${site.location}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(site)}
                  aria-label="Edit site"
                >
                  Edit
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirmDeleteId(site.id)}
                  aria-label="Delete site"
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-14 text-center">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: "var(--bg-surface)" }}
              >
                <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
                  <path
                    d="M14 4l10 5.5v9L14 24 4 18.5V9.5L14 4z"
                    stroke="var(--text-label)"
                    strokeWidth="1.5"
                    fill="none"
                  />
                  <path
                    d="M14 4v20M4 9.5l10 5.5 10-5.5"
                    stroke="var(--text-label)"
                    strokeWidth="1.2"
                    opacity="0.5"
                  />
                </svg>
              </div>
              <h3
                className="mb-1 text-base font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {search ? "No sites match your search" : "No sites yet"}
              </h3>
              <p
                className="mb-5 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                {search
                  ? "Try a different search term."
                  : "Create a site to organize your reports."}
              </p>
              {!search && (
                <Button variant="primary" onClick={() => setEditing(emptySite())}>
                  + New Site
                </Button>
              )}
            </div>
          )}
        </div>
      </main>

      <ConfirmSheet
        open={!!confirmDeleteId}
        title={`Delete "${siteToDelete?.title}"?`}
        message="This site will be removed. Reports linked to this site will remain but lose their site association."
        confirmLabel="Delete Site"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
