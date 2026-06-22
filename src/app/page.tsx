"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";
import db, { deleteReportCascade } from "@/lib/db";
import { ensureSeeded } from "@/lib/seed";
import { generateReportNumber, emptyReport, normalizeReport } from "@/lib/reportNumber";
import { hasAsFoundData, hasAsLeftData } from "@/lib/types";
import { exportIrisCsvMulti } from "@/lib/exports/iris";

type Mode = "idle" | "export" | "delete";

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [siteFilter, setSiteFilter] = useState("all");
  const [mode, setMode] = useState<Mode>("idle");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => { ensureSeeded().then(() => setReady(true)); }, []);

  const sites = useLiveQuery(() => db.sites.toArray(), [], []);
  const allReports = useLiveQuery(() => db.reports.toArray(), [], []);

  const reports = (allReports ?? [])
    .map((r) => normalizeReport(r))
    .filter((r) => siteFilter === "all" || r.siteId === siteFilter)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function enterMode(m: Mode) { setMode(m); setSelected(new Set()); }
  function cancelMode() { setMode("idle"); setSelected(new Set()); }

  function toggleSelect(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function toggleSelectAll() {
    setSelected(selected.size === reports.length ? new Set() : new Set(reports.map((r) => r.id)));
  }

  async function handleNewReport() {
    const reportNumber = await generateReportNumber();
    const id = crypto.randomUUID();
    await db.reports.add(emptyReport(id, reportNumber));
    router.push(`/reports/${id}`);
  }

  async function handleExportConfirm() {
    const ids = selected.size > 0 ? [...selected] : reports.map((r) => r.id);
    await exportIrisCsvMulti(ids);
    cancelMode();
  }

  async function handleDeleteConfirm() {
    if (selected.size === 0) return;
    const count = selected.size;
    if (!confirm(`Delete ${count} report${count > 1 ? "s" : ""} and all their findings/photos?`)) return;
    await Promise.all([...selected].map((id) => deleteReportCascade(id)));
    cancelMode();
  }

  if (!ready) {
    return (
      <div style={{ background: "var(--bg-main)" }} className="min-h-screen">
        <Header />
        <p className="p-6" style={{ color: "var(--text-secondary)" }}>Loading…</p>
      </div>
    );
  }

  const allSelected = selected.size === reports.length && reports.length > 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-main)" }}>
      <Header />

      <main className="mx-auto max-w-3xl px-3 py-5 sm:px-6 sm:py-6">

        {/* ── Site filter ── */}
        <div className="mb-5 flex items-end gap-3">
          <div className="flex-1">
            <label className="label-sm mb-1.5 block">Site</label>
            <select className="input" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
              <option value="all">All sites</option>
              {sites?.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </div>
          <button
            onClick={() => router.push("/sites")}
            className="rounded-lg border px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              background: "var(--bg-card)",
              borderColor: "var(--border-solid)",
              color: "var(--text-secondary)",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            Manage
          </button>
        </div>

        {/* ── Toolbar ── */}
        {mode === "idle" && (
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="label-sm">Reports ({reports.length})</h2>
            <div className="flex flex-wrap items-center gap-2">
              {reports.length > 0 && (
                <>
                  <button
                    onClick={() => enterMode("export")}
                    className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:flex-none sm:py-1.5"
                    style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}
                  >
                    Export to IRIS
                  </button>
                  <button
                    onClick={() => enterMode("delete")}
                    className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:flex-none sm:py-1.5"
                    style={{ background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA" }}
                  >
                    Delete
                  </button>
                </>
              )}
              <button
                onClick={handleNewReport}
                className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors sm:flex-none sm:py-1.5"
                style={{ background: "var(--accent)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "var(--accent)")}
              >
                + New Report
              </button>
            </div>
          </div>
        )}

        {mode === "export" && (
          <div className="mb-4 rounded-xl border p-4" style={{ background: "#FFFBEB", borderColor: "#FDE68A" }}>
            <p className="mb-3 text-sm font-semibold" style={{ color: "#92400E" }}>
              Select reports to export to IRIS CSV
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button onClick={toggleSelectAll} className="text-left text-sm font-medium underline" style={{ color: "#B45309" }}>
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <div className="flex gap-2">
                <button onClick={cancelMode} className="flex-1 rounded-lg border px-4 py-2 text-sm font-semibold sm:flex-none" style={{ background: "var(--bg-card)", borderColor: "var(--border-solid)", color: "var(--text-secondary)" }}>
                  Cancel
                </button>
                <button onClick={handleExportConfirm} className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white sm:flex-none" style={{ background: "#D97706" }}>
                  {selected.size === 0 ? `Export All (${reports.length})` : `Export ${selected.size}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === "delete" && (
          <div className="mb-4 rounded-xl border p-4" style={{ background: "#FEF2F2", borderColor: "#FECACA" }}>
            <p className="mb-3 text-sm font-semibold" style={{ color: "#991B1B" }}>
              Select reports to delete
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button onClick={toggleSelectAll} className="text-left text-sm font-medium underline" style={{ color: "#DC2626" }}>
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <div className="flex gap-2">
                <button onClick={cancelMode} className="flex-1 rounded-lg border px-4 py-2 text-sm font-semibold sm:flex-none" style={{ background: "var(--bg-card)", borderColor: "var(--border-solid)", color: "var(--text-secondary)" }}>
                  Cancel
                </button>
                <button onClick={handleDeleteConfirm} disabled={selected.size === 0} className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 sm:flex-none" style={{ background: "#DC2626" }}>
                  {selected.size === 0 ? "Select to delete" : `Delete ${selected.size}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Report list ── */}
        <div className="flex flex-col gap-3">
          {reports.map((report) => {
            const asFound = hasAsFoundData(report);
            const asLeft = hasAsLeftData(report);
            const isSelected = selected.has(report.id);
            const inSelectionMode = mode === "export" || mode === "delete";
            const isDeleteMode = mode === "delete";

            const ringColor = isSelected
              ? isDeleteMode ? "rgba(220,38,38,0.4)" : "rgba(217,119,6,0.4)"
              : "transparent";

            return (
              <div
                key={report.id}
                onClick={() => inSelectionMode ? toggleSelect(report.id) : router.push(`/reports/${report.id}`)}
                className="flex cursor-pointer items-stretch rounded-xl transition-all"
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid ${isSelected ? (isDeleteMode ? "#FECACA" : "#FDE68A") : "var(--border)"}`,
                  boxShadow: isSelected ? `0 0 0 2px ${ringColor}, var(--shadow-sm)` : "var(--shadow-sm)",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
                }}
              >
                {inSelectionMode && (
                  <div className="ml-4 flex items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(report.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 rounded"
                      style={{ accentColor: isDeleteMode ? "#DC2626" : "#D97706" }}
                    />
                  </div>
                )}

                <div className="flex-1 p-5">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                      {report.reportNumber}
                    </span>
                    <StatusBadge status={report.status} />
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {report.customer || "No customer"} · {report.siteTitle || "No site"}
                  </p>
                  <p className="mb-3 text-sm" style={{ color: "var(--text-label)" }}>
                    Tag {report.tagOrUnit || "—"} · {report.repairDate}
                  </p>
                  <div className="flex gap-2">
                    <Pill active={asFound} label="As Found" />
                    <Pill active={asLeft} label="As Left" />
                  </div>
                </div>
              </div>
            );
          })}

          {reports.length === 0 && (
            <p className="py-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
              No reports yet. Create your first report above.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function Pill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={
        active
          ? { background: "#ECFDF5", color: "#065F46" }
          : { background: "var(--bg-surface)", color: "var(--text-label)" }
      }
    >
      {active ? "✓ " : ""}{label}
    </span>
  );
}
