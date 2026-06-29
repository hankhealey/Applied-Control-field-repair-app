"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Header from "@/components/Header";
import StatusBadge from "@/components/StatusBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmSheet } from "@/components/ui/ConfirmSheet";
import { ReportsSkeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/ToastProvider";
import db, { deleteReportCascade } from "@/lib/db";
import { exportIrisCsvMulti } from "@/lib/exports/iris";
import {
  emptyReport,
  generateReportNumber,
  normalizeReport,
} from "@/lib/reportNumber";
import { ensureSeeded } from "@/lib/seed";
import { hasAsFoundData, hasAsLeftData } from "@/lib/types";

type Mode = "idle" | "export" | "delete";

export default function Home() {
  const router = useRouter();
  const { toast } = useToast();
  const [ready, setReady] = useState(false);
  const [siteFilter, setSiteFilter] = useState("all");
  const [mode, setMode] = useState<Mode>("idle");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

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
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleSelectAll() {
    setSelected(
      selected.size === reports.length
        ? new Set()
        : new Set(reports.map((r) => r.id)),
    );
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
    toast(`Exported ${ids.length} report${ids.length > 1 ? "s" : ""} to CSV`, "success");
  }

  async function handleDeleteConfirm() {
    const count = selected.size;
    await Promise.all([...selected].map((id) => deleteReportCascade(id)));
    cancelMode();
    setConfirmDeleteOpen(false);
    toast(`Deleted ${count} report${count > 1 ? "s" : ""}`, "info");
  }

  if (!ready) {
    return (
      <div className="min-h-screen" style={{ background: "var(--bg-main)" }}>
        <Header />
        <main className="mx-auto max-w-3xl px-3 py-5 sm:px-6 sm:py-6">
          <ReportsSkeleton />
        </main>
      </div>
    );
  }

  const allSelected = selected.size === reports.length && reports.length > 0;
  const deleteCount = selected.size;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-main)" }}>
      <Header />

      <main className="mx-auto max-w-3xl px-3 py-5 sm:px-6 sm:py-6">
        {/* ── Site filter ── */}
        <div className="mb-5 flex items-end gap-3">
          <div className="flex-1">
            <label htmlFor="site-filter" className="label-sm mb-1.5 block">
              Site
            </label>
            <select
              id="site-filter"
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
          <Button variant="secondary" onClick={() => router.push("/sites")}>
            Manage
          </Button>
        </div>

        {/* ── Idle toolbar ── */}
        {mode === "idle" && (
          <>
            {/* Mobile: 2-row layout */}
            <div className="mb-4 sm:hidden">
              <div className="flex items-center justify-between mb-2">
                <h2 className="label-sm">Reports ({reports.length})</h2>
                <Button variant="primary" size="sm" onClick={handleNewReport}>
                  + New Report
                </Button>
              </div>
              {reports.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="danger" size="sm" onClick={() => enterMode("delete")}>
                    Delete
                  </Button>
                  <Button variant="warning" size="sm" onClick={() => enterMode("export")}>
                    Export to IRIS
                  </Button>
                </div>
              )}
            </div>

            {/* Desktop: single row — delete left (separated), actions right */}
            <div className="mb-4 hidden sm:flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="label-sm">Reports ({reports.length})</h2>
                {reports.length > 0 && (
                  <Button variant="danger" size="sm" onClick={() => enterMode("delete")}>
                    Delete
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {reports.length > 0 && (
                  <Button variant="warning" size="sm" onClick={() => enterMode("export")}>
                    Export to IRIS
                  </Button>
                )}
                <Button variant="primary" size="sm" onClick={handleNewReport}>
                  + New Report
                </Button>
              </div>
            </div>
          </>
        )}

        {/* ── Export mode banner ── */}
        {mode === "export" && (
          <div
            className="mb-4 rounded-xl border p-4"
            style={{
              background: "var(--color-warning-bg)",
              borderColor: "var(--color-warning-border)",
            }}
          >
            <p
              className="mb-3 text-sm font-semibold"
              style={{ color: "var(--color-warning-text)" }}
            >
              Select reports to export to IRIS CSV
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-left text-sm font-medium underline"
                style={{ color: "var(--color-warning-text)" }}
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={cancelMode}>
                  Cancel
                </Button>
                <Button variant="warning" onClick={handleExportConfirm}>
                  {selected.size === 0
                    ? `Export All (${reports.length})`
                    : `Export ${selected.size}`}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete mode banner ── */}
        {mode === "delete" && (
          <div
            className="mb-4 rounded-xl border p-4"
            style={{
              background: "var(--color-danger-bg)",
              borderColor: "var(--color-danger-border)",
            }}
          >
            <p
              className="mb-3 text-sm font-semibold"
              style={{ color: "var(--color-danger-text)" }}
            >
              Select reports to delete
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-left text-sm font-medium underline"
                style={{ color: "var(--color-danger-text)" }}
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={cancelMode}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  disabled={deleteCount === 0}
                  onClick={() => setConfirmDeleteOpen(true)}
                >
                  {deleteCount === 0
                    ? "Select to delete"
                    : `Delete ${deleteCount}`}
                </Button>
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
              ? isDeleteMode
                ? "rgba(220,38,38,0.4)"
                : "rgba(217,119,6,0.4)"
              : "transparent";

            return (
              <div
                key={report.id}
                onClick={() =>
                  inSelectionMode
                    ? toggleSelect(report.id)
                    : router.push(`/reports/${report.id}`)
                }
                className="flex cursor-pointer items-stretch rounded-xl transition-all"
                style={{
                  background: "var(--bg-card)",
                  border: `1px solid ${isSelected ? (isDeleteMode ? "var(--color-danger-border)" : "var(--color-warning-border)") : "var(--border)"}`,
                  boxShadow: isSelected
                    ? `0 0 0 2px ${ringColor}, var(--shadow-sm)`
                    : "var(--shadow-sm)",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLDivElement).style.borderColor =
                      "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  if (!isSelected)
                    (e.currentTarget as HTMLDivElement).style.borderColor =
                      "var(--border)";
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
                      style={{
                        accentColor: isDeleteMode
                          ? "var(--color-danger-text)"
                          : "var(--color-warning-text)",
                      }}
                    />
                  </div>
                )}

                <div className="flex-1 p-5">
                  <div className="mb-2 flex items-center gap-3">
                    <span
                      className="text-base font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {report.reportNumber}
                    </span>
                    <StatusBadge status={report.status} />
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {report.customer || "No customer"} ·{" "}
                    {report.siteTitle || "No site"}
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

          {/* ── Empty state ── */}
          {reports.length === 0 && (
            <div className="flex flex-col items-center py-16 text-center">
              <div
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{ background: "var(--bg-surface)" }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <rect x="4" y="3" width="18" height="23" rx="3" stroke="var(--text-label)" strokeWidth="1.5" />
                  <path d="M8 11h10M8 15h7M8 19h5" stroke="var(--text-label)" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="24" cy="24" r="6" fill="var(--accent)" />
                  <path d="M24 21v3.5M24 24.5h3" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <h3
                className="mb-1 text-base font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                No repair reports yet
              </h3>
              <p
                className="mb-6 text-sm"
                style={{ color: "var(--text-secondary)" }}
              >
                Create your first report to get started.
              </p>
              <Button variant="primary" onClick={handleNewReport}>
                + New Report
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* ── Delete confirmation sheet ── */}
      <ConfirmSheet
        open={confirmDeleteOpen}
        title={`Delete ${deleteCount} report${deleteCount > 1 ? "s" : ""}?`}
        message="This will permanently remove the selected reports and all their findings and photos. This cannot be undone."
        confirmLabel={`Delete ${deleteCount} Report${deleteCount > 1 ? "s" : ""}`}
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}

function Pill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={
        active
          ? {
              background: "var(--color-success-bg)",
              color: "var(--color-success-text)",
            }
          : { background: "var(--bg-surface)", color: "var(--text-label)" }
      }
    >
      {active ? "✓ " : ""}
      {label}
    </span>
  );
}
