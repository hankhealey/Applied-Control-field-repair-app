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

  useEffect(() => {
    ensureSeeded().then(() => setReady(true));
  }, []);

  const sites = useLiveQuery(() => db.sites.toArray(), [], []);
  const allReports = useLiveQuery(() => db.reports.toArray(), [], []);

  const reports = (allReports ?? [])
    .map((r) => normalizeReport(r))
    .filter((r) => siteFilter === "all" || r.siteId === siteFilter)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function enterMode(m: Mode) {
    setMode(m);
    setSelected(new Set());
  }

  function cancelMode() {
    setMode("idle");
    setSelected(new Set());
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === reports.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(reports.map((r) => r.id)));
    }
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
      <div className="min-h-screen bg-zinc-50">
        <Header />
        <p className="p-6 text-zinc-500">Loading…</p>
      </div>
    );
  }

  const allSelected = selected.size === reports.length && reports.length > 0;

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      <main className="mx-auto max-w-3xl px-3 py-4 sm:px-6 sm:py-6">
        {/* Site filter */}
        <div className="mb-6 flex items-end justify-between gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-zinc-600">Site</label>
            <select
              className="input"
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
            >
              <option value="all">All sites</option>
              {sites?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => router.push("/sites")}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700"
          >
            Manage
          </button>
        </div>

        {/* Toolbar — changes based on mode */}
        {mode === "idle" && (
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-500">
              REPORTS ({reports.length})
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {reports.length > 0 && (
                <>
                  <button
                    onClick={() => enterMode("export")}
                    className="flex-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 sm:flex-none sm:py-1.5"
                  >
                    Export to IRIS
                  </button>
                  <button
                    onClick={() => enterMode("delete")}
                    className="flex-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 sm:flex-none sm:py-1.5"
                  >
                    Delete
                  </button>
                </>
              )}
              <button
                onClick={handleNewReport}
                className="flex-1 rounded-lg bg-[#154A8A] px-4 py-2 text-sm font-semibold text-white sm:flex-none sm:py-1.5"
              >
                + New Report
              </button>
            </div>
          </div>
        )}

        {mode === "export" && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="mb-3 text-sm font-semibold text-amber-800">
              Select reports to export to IRIS CSV
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button onClick={toggleSelectAll} className="text-left text-sm font-medium text-amber-700 underline">
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <div className="flex gap-2">
                <button onClick={cancelMode} className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 sm:flex-none">
                  Cancel
                </button>
                <button onClick={handleExportConfirm} className="flex-1 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 sm:flex-none">
                  {selected.size === 0 ? `Export All (${reports.length})` : `Export ${selected.size}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === "delete" && (
          <div className="mb-3 rounded-xl border border-red-300 bg-red-50 p-4">
            <p className="mb-3 text-sm font-semibold text-red-700">
              Select reports to delete
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button onClick={toggleSelectAll} className="text-left text-sm font-medium text-red-600 underline">
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <div className="flex gap-2">
                <button onClick={cancelMode} className="flex-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 sm:flex-none">
                  Cancel
                </button>
                <button onClick={handleDeleteConfirm} disabled={selected.size === 0} className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 sm:flex-none">
                  {selected.size === 0 ? "Select to delete" : `Delete ${selected.size}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Report list */}
        <div className="flex flex-col gap-4">
          {reports.map((report) => {
            const asFound = hasAsFoundData(report);
            const asLeft = hasAsLeftData(report);
            const isSelected = selected.has(report.id);
            const isExportMode = mode === "export";
            const isDeleteMode = mode === "delete";
            const inSelectionMode = isExportMode || isDeleteMode;

            const borderColor = isSelected
              ? isDeleteMode
                ? "border-red-400 ring-1 ring-red-300"
                : "border-amber-400 ring-1 ring-amber-300"
              : "border-zinc-200";

            return (
              <div
                key={report.id}
                onClick={() => {
                  if (inSelectionMode) {
                    toggleSelect(report.id);
                  } else {
                    router.push(`/reports/${report.id}`);
                  }
                }}
                className={`flex cursor-pointer items-stretch rounded-xl border bg-white p-5 shadow-sm hover:border-blue-300 ${borderColor}`}
              >
                {/* Checkbox — only visible in selection modes */}
                {inSelectionMode && (
                  <div className="mr-4 flex items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(report.id)}
                      onClick={(e) => e.stopPropagation()}
                      className={`h-4 w-4 rounded border-zinc-300 ${isDeleteMode ? "accent-red-500" : "accent-amber-500"}`}
                    />
                  </div>
                )}

                {/* Card body */}
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="text-lg font-bold text-zinc-900">{report.reportNumber}</span>
                    <StatusBadge status={report.status} />
                  </div>
                  <p className="text-zinc-600">
                    {report.customer || "No customer"} • {report.siteTitle || "No site"}
                  </p>
                  <p className="mb-3 text-sm text-zinc-500">
                    Tag {report.tagOrUnit || "—"} • {report.repairDate}
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
            <p className="text-zinc-500">No reports yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}

function Pill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-400"
      }`}
    >
      {active ? "✓ " : ""}
      {label}
    </span>
  );
}
