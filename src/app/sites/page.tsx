"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import Header from "@/components/Header";
import db from "@/lib/db";
import { Site } from "@/lib/types";

const emptySite = (): Site => ({
  id: crypto.randomUUID(),
  title: "",
  customer: "",
  location: "",
  notes: "",
});

export default function SitesPage() {
  const router = useRouter();
  const sites = useLiveQuery(() => db.sites.toArray(), [], []);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Site | null>(null);

  const filtered = (sites ?? []).filter((s) =>
    s.title.toLowerCase().includes(search.toLowerCase())
  );

  async function handleSave() {
    if (!editing || !editing.title.trim()) return;
    await db.sites.put(editing);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    if (confirm("Delete this site?")) {
      await db.sites.delete(id);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />
      <main className="mx-auto max-w-3xl px-6 py-6">
        <button
          onClick={() => router.push("/")}
          className="mb-4 text-sm font-medium text-[#154A8A]"
        >
          ← Back to Reports
        </button>

        <div className="mb-4 flex items-center justify-between gap-4">
          <input
            className="input"
            placeholder="Search sites…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={() => setEditing(emptySite())}
            className="whitespace-nowrap rounded-lg bg-[#154A8A] px-4 py-2 text-sm font-semibold text-white"
          >
            + New Site
          </button>
        </div>

        {editing && (
          <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 font-semibold text-zinc-900">
              {sites?.find((s) => s.id === editing.id) ? "Edit Site" : "New Site"}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-600">
                  Title
                </span>
                <input
                  className="input"
                  value={editing.title}
                  onChange={(e) =>
                    setEditing({ ...editing, title: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-600">
                  Customer
                </span>
                <input
                  className="input"
                  value={editing.customer}
                  onChange={(e) =>
                    setEditing({ ...editing, customer: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-zinc-600">
                  Location
                </span>
                <input
                  className="input"
                  value={editing.location}
                  onChange={(e) =>
                    setEditing({ ...editing, location: e.target.value })
                  }
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-zinc-600">
                  Notes
                </span>
                <textarea
                  className="input"
                  rows={2}
                  value={editing.notes}
                  onChange={(e) =>
                    setEditing({ ...editing, notes: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="rounded-lg bg-[#154A8A] px-4 py-2 text-sm font-semibold text-white"
              >
                Save
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {filtered.map((site) => (
            <div
              key={site.id}
              className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div>
                <p className="font-semibold text-zinc-900">{site.title}</p>
                <p className="text-sm text-zinc-500">
                  {site.customer} {site.location && `• ${site.location}`}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(site)}
                  className="px-2 text-zinc-500 hover:text-[#154A8A]"
                  aria-label="Edit site"
                >
                  ✎
                </button>
                <button
                  onClick={() => handleDelete(site.id)}
                  className="px-2 text-zinc-400 hover:text-red-600"
                  aria-label="Delete site"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-zinc-500">No sites found.</p>
          )}
        </div>
      </main>
    </div>
  );
}
