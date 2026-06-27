"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import type {
  IrisSyncReportPayload,
  SyncEvent,
} from "@/app/api/iris/sync/route";
import Header from "@/components/Header";
import db from "@/lib/db";
import { buildRepairPdfBlob } from "@/lib/exports/pdf";
import type { RepairReport } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type LogEntry = SyncEvent & { ts: string };

type SyncState = "idle" | "running" | "done" | "aborted";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function stepLabel(step: SyncEvent["step"]): string {
  const map: Record<string, string> = {
    asset_find: "Find asset",
    asset_create: "Create asset",
    specs: "Update specs",
    report_create: "Create report",
    pdf_attach: "Attach PDF",
    photos_attach: "Attach photos",
    done: "Done",
    error: "Error",
    skip: "Skipped",
  };
  return map[step] ?? step;
}

function statusColor(status: SyncEvent["status"]) {
  if (status === "ok") return "#4ADE80";
  if (status === "error") return "#F87171";
  if (status === "skip") return "#FCD34D";
  return "#93C5FD";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function IrisSyncPage() {
  // Must NOT read window during SSR — defer to useEffect to avoid hydration
  // mismatch between server (always undefined) and client (may be Vercel).
  const [isLocal, setIsLocal] = useState(true);
  useEffect(() => {
    setIsLocal(
      window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1",
    );
  }, []);

  // Dexie data
  const allReports = useLiveQuery(
    () => db.reports.orderBy("reportNumber").reverse().toArray(),
    [],
  );

  // Site selection
  const [irisCustomer, setIrisCustomer] = useState("");
  const [irisSite, setIrisSite] = useState("");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "unsynced">("unsynced");

  // Re-sync override
  const [resyncIds, setResyncIds] = useState<Set<string>>(new Set());

  // Sync state
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [summary, setSummary] = useState<{
    synced: number;
    skipped: number;
    total: number;
  } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  // Live screenshot preview
  const [liveScreenshot, setLiveScreenshot] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  // Auto-scroll log when entries are added
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally fires on log change
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  // ── Filtered list ──────────────────────────────────────────────────────────

  const displayReports = (allReports ?? []).filter((r) => {
    if (filter === "unsynced") return !r.irisSyncedAt;
    return true;
  });

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(displayReports.map((r) => r.id)));
  }

  function deselectAll() {
    setSelectedIds(new Set());
  }

  // Reports that need re-sync confirmation (already synced, but selected)
  const selectedAlreadySynced = (allReports ?? []).filter(
    (r) => selectedIds.has(r.id) && r.irisSyncedAt && !resyncIds.has(r.id),
  );

  const readyToSync = (allReports ?? []).filter(
    (r) => selectedIds.has(r.id) && (!r.irisSyncedAt || resyncIds.has(r.id)),
  );

  // ── Emergency stop ─────────────────────────────────────────────────────────

  async function emergencyStop() {
    abortRef.current = true;
    // Kill the Playwright browser immediately via DELETE endpoint
    try {
      await fetch("/api/iris/sync", { method: "DELETE" });
    } catch {}
    setSyncState("aborted");
  }

  // ── Run sync ───────────────────────────────────────────────────────────────

  async function runSync() {
    if (readyToSync.length === 0) return;

    setLog([]);
    setSummary(null);
    setLiveScreenshot(null);
    setSyncState("running");
    abortRef.current = false;

    // ── Build full payload: findings + PDF for each report ──────────────────
    setLog([
      {
        report: "system",
        step: "asset_find",
        status: "info",
        message: `Generating PDFs for ${readyToSync.length} report(s)…`,
        ts: new Date().toISOString(),
      },
    ]);

    let reportsPayload: IrisSyncReportPayload[];
    try {
      reportsPayload = await Promise.all(
        readyToSync.map(async (report) => {
          const findings = await db.findings
            .where("repairReportId")
            .equals(report.id)
            .toArray();

          const { blob, filename } = await buildRepairPdfBlob(report.id);
          const arrayBuffer = await blob.arrayBuffer();
          // btoa(String.fromCharCode(...array)) overflows the call stack for
          // large PDFs — spread has a ~125k arg limit in V8. Chunk instead.
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          }
          const pdfBase64 = btoa(binary);

          return { report, findings, pdfBase64, pdfFilename: filename };
        }),
      );
    } catch (err) {
      setLog([
        {
          report: "system",
          step: "error",
          status: "error",
          message: `PDF generation failed: ${err instanceof Error ? err.message : String(err)}`,
          ts: new Date().toISOString(),
        },
      ]);
      setSyncState("aborted");
      return;
    }

    let response: Response;
    try {
      response = await fetch("/api/iris/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          irisCustomer,
          irisSite,
          reports: reportsPayload,
        }),
      });
    } catch (err) {
      setLog([
        {
          report: "system",
          step: "error",
          status: "error",
          message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
          ts: new Date().toISOString(),
        },
      ]);
      setSyncState("aborted");
      return;
    }

    if (!response.ok) {
      const text = await response.text();
      let msg = text;
      try {
        msg = JSON.parse(text).error ?? text;
      } catch {}
      setLog([
        {
          report: "system",
          step: "error",
          status: "error",
          message: `Server error ${response.status}: ${msg}`,
          ts: new Date().toISOString(),
        },
      ]);
      setSyncState("aborted");
      return;
    }

    // biome-ignore lint/style/noNonNullAssertion: POST to our own route always has a body
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (abortRef.current) {
        reader.cancel();
        setSyncState("aborted");
        return;
      }

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event: SyncEvent = JSON.parse(line.slice(6));

          // Update live screenshot if present
          if (event.screenshot) {
            setLiveScreenshot(event.screenshot);
            // Don't add screenshot events to the log
            continue;
          }

          const entry: LogEntry = { ...event, ts: new Date().toISOString() };
          setLog((prev) => [...prev, entry]);

          // Mark report as synced in Dexie on successful completion
          if (
            event.status === "ok" &&
            event.step === "done" &&
            event.report !== "system"
          ) {
            await db.reports.update(event.report, {
              irisSyncedAt: new Date().toISOString(),
            });
          }

          // Abort on auth failure
          if (event.errorType === "ABORT_BATCH") {
            reader.cancel();
            setSyncState("aborted");
            return;
          }

          // Capture summary
          if (event.step === "done" && event.report === "system") {
            setSummary({
              synced: event.synced ?? 0,
              skipped: event.skipped ?? 0,
              total: event.total ?? 0,
            });
          }
        } catch {}
      }
    }

    setSyncState("done");
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isRunning = syncState === "running";
  const canRun = isLocal && readyToSync.length > 0;

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: "var(--bg-base)" }}
    >
      <Header />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Local-only warning */}
          {!isLocal && (
            <div
              className="rounded-xl border px-4 py-3 text-sm"
              style={{
                background: "#1A0A00",
                borderColor: "#92400E",
                color: "#FCD34D",
              }}
            >
              ⚠️ Iris Sync only works when the app is running locally on your
              machine (<code>npm run dev</code>). This page is read-only on
              Vercel.
            </div>
          )}

          {/* Do-not-edit warning while running */}
          {isRunning && (
            <div
              className="rounded-xl border px-4 py-3 text-sm font-medium space-y-1"
              style={{
                background: "#1A0A00",
                borderColor: "#92400E",
                color: "#FCD34D",
              }}
            >
              <p>⚠️ Do not edit code during sync — hot-reload will abort the batch.</p>
              <p className="font-normal text-xs" style={{ color: "#D97706" }}>
                Do not close or refresh this tab either — progress will be lost.
              </p>
            </div>
          )}

          {/* Site selection */}
          <section
            className="rounded-xl border p-5 space-y-4"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-card)",
            }}
          >
            <div>
              <h2
                className="text-sm font-semibold tracking-wide"
                style={{ color: "var(--text-secondary)" }}
              >
                IRIS SITE
              </h2>
              <p
                className="text-xs mt-1"
                style={{ color: "var(--text-muted)" }}
              >
                When sync starts, a browser window will open and ask you to log
                in to Iris — you have 2 minutes to complete it.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="iris-customer"
                  className="text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Customer{" "}
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                    (optional)
                  </span>
                </label>
                <input
                  id="iris-customer"
                  type="text"
                  value={irisCustomer}
                  onChange={(e) => setIrisCustomer(e.target.value)}
                  disabled={isRunning}
                  autoComplete="off"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="e.g. Acme Corp"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="iris-site"
                  className="text-xs font-medium"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Site{" "}
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                    (optional)
                  </span>
                </label>
                <input
                  id="iris-site"
                  type="text"
                  value={irisSite}
                  onChange={(e) => setIrisSite(e.target.value)}
                  disabled={isRunning}
                  autoComplete="off"
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  placeholder="e.g. Refinery North"
                />
              </div>
            </div>
          </section>

          {/* Report selector */}
          <section
            className="rounded-xl border p-5 space-y-3"
            style={{
              borderColor: "var(--border)",
              background: "var(--bg-card)",
            }}
          >
            <div className="flex items-center justify-between">
              <h2
                className="text-sm font-semibold tracking-wide"
                style={{ color: "var(--text-secondary)" }}
              >
                SELECT REPORTS
              </h2>
              <div className="flex items-center gap-3">
                {/* Filter toggle */}
                <div
                  className="flex rounded-lg overflow-hidden text-xs"
                  style={{ border: "1px solid var(--border)" }}
                >
                  {(["unsynced", "all"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className="px-3 py-1 transition-colors"
                      style={{
                        background: filter === f ? "#1D4ED8" : "transparent",
                        color: filter === f ? "#fff" : "var(--text-muted)",
                      }}
                    >
                      {f === "unsynced" ? "Not synced" : "All"}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={selectAll}
                  disabled={isRunning}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: "#60A5FA" }}
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={deselectAll}
                  disabled={isRunning}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: "var(--text-muted)" }}
                >
                  Clear
                </button>
              </div>
            </div>

            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {selectedIds.size} selected
              {readyToSync.length !== selectedIds.size &&
                ` (${readyToSync.length} ready — ${selectedAlreadySynced.length} need re-sync confirmation)`}
            </p>

            {/* Report list */}
            <div
              className="rounded-lg overflow-hidden max-h-72 overflow-y-auto"
              style={{ borderColor: "var(--border)" }}
            >
              {displayReports.length === 0 ? (
                <div
                  className="py-8 text-center text-sm"
                  style={{ color: "var(--text-muted)" }}
                >
                  {filter === "unsynced"
                    ? "All reports have been synced to Iris."
                    : "No reports yet."}
                </div>
              ) : (
                displayReports.map((r) => (
                  <ReportRow
                    key={r.id}
                    report={r}
                    selected={selectedIds.has(r.id)}
                    resyncConfirmed={resyncIds.has(r.id)}
                    disabled={isRunning}
                    onToggle={() => toggleSelect(r.id)}
                    onResync={() =>
                      setResyncIds((prev) => {
                        const next = new Set(prev);
                        next.add(r.id);
                        return next;
                      })
                    }
                  />
                ))
              )}
            </div>
          </section>

          {/* Re-sync warning */}
          {selectedAlreadySynced.length > 0 && (
            <div
              className="rounded-xl border px-4 py-3 text-sm space-y-2"
              style={{
                background: "#0A1520",
                borderColor: "#1E40AF",
                color: "#93C5FD",
              }}
            >
              <p className="font-medium">
                {selectedAlreadySynced.length} selected report
                {selectedAlreadySynced.length > 1 ? "s have" : " has"} already
                been synced to Iris.
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Re-syncing may create duplicate records in Iris. Confirm each
                one to include it.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {selectedAlreadySynced.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() =>
                      setResyncIds((prev) => {
                        const next = new Set(prev);
                        next.add(r.id);
                        return next;
                      })
                    }
                    className="rounded px-2 py-1 text-xs font-medium transition-colors"
                    style={{
                      background: "#1D4ED8",
                      color: "#fff",
                    }}
                  >
                    Re-sync {r.reportNumber || r.tagOrUnit}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Push button + emergency stop */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={runSync}
              disabled={isRunning || !canRun}
              className="rounded-xl px-6 py-3 text-sm font-semibold transition-all"
              style={{
                background: isRunning || !canRun ? "#1F2937" : "#1D4ED8",
                color: isRunning || !canRun ? "#4B5563" : "#fff",
                cursor: isRunning || !canRun ? "not-allowed" : "pointer",
              }}
            >
              {isRunning
                ? "Syncing…"
                : `Push ${readyToSync.length} report${readyToSync.length !== 1 ? "s" : ""} to Iris →`}
            </button>

            {isRunning && (
              <button
                type="button"
                onClick={emergencyStop}
                className="rounded-xl px-5 py-3 text-sm font-semibold flex items-center gap-2 transition-all"
                style={{
                  background: "#7F1D1D",
                  color: "#FCA5A5",
                  border: "1px solid #991B1B",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect
                    x="2"
                    y="2"
                    width="10"
                    height="10"
                    rx="1"
                    fill="#FCA5A5"
                  />
                </svg>
                Emergency Stop
              </button>
            )}

            {syncState === "done" && (
              <button
                type="button"
                onClick={() => {
                  setSyncState("idle");
                  setLog([]);
                  setSummary(null);
                  setLiveScreenshot(null);
                  setSelectedIds(new Set());
                  setResyncIds(new Set());
                }}
                className="text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Summary */}
          {summary && (
            <div
              className="rounded-xl border px-5 py-4"
              style={{
                background: summary.skipped === 0 ? "#0A2010" : "#1A1000",
                borderColor: summary.skipped === 0 ? "#166534" : "#78350F",
              }}
            >
              <p
                className="text-sm font-semibold"
                style={{ color: summary.skipped === 0 ? "#4ADE80" : "#FCD34D" }}
              >
                {summary.synced} synced / {summary.skipped} skipped /{" "}
                {summary.total} total
              </p>
              {summary.skipped > 0 && (
                <p
                  className="text-xs mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  See the log below for skip reasons.
                </p>
              )}
            </div>
          )}

          {/* Live browser preview */}
          {(isRunning || liveScreenshot) && (
            <section
              className="rounded-xl border overflow-hidden"
              style={{
                borderColor: "var(--border)",
                background: "var(--bg-card)",
              }}
            >
              <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: isRunning ? "#4ADE80" : "#374151",
                      boxShadow: isRunning ? "0 0 6px #4ADE80" : "none",
                      animation: isRunning ? "pulse 1.5s infinite" : "none",
                    }}
                  />
                  <span
                    className="text-xs font-semibold tracking-wide"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    LIVE BROWSER PREVIEW
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreview((v) => !v)}
                  className="text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {showPreview ? "Hide" : "Show"}
                </button>
              </div>
              {showPreview && (
                <div className="p-3" style={{ background: "#0D1117" }}>
                  {liveScreenshot && (
                    // biome-ignore lint/performance/noImgElement: base64 data URL — Next.js Image doesn't support data: URIs
                    <img
                      src={`data:image/jpeg;base64,${liveScreenshot}`}
                      alt="Live Iris browser view"
                      className="w-full rounded"
                      style={{ imageRendering: "crisp-edges" }}
                    />
                  )}
                  {!liveScreenshot && (
                    <div
                      className="flex h-40 items-center justify-center rounded text-xs"
                      style={{
                        background: "#111827",
                        color: "var(--text-muted)",
                      }}
                    >
                      Waiting for first screenshot…
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Live log */}
          {log.length > 0 && (
            <section
              className="rounded-xl border p-4 space-y-2"
              style={{
                borderColor: "var(--border)",
                background: "var(--bg-card)",
              }}
            >
              <h2
                className="text-xs font-semibold tracking-wide mb-3"
                style={{ color: "var(--text-secondary)" }}
              >
                SYNC LOG
              </h2>
              <div
                ref={logRef}
                className="space-y-1 max-h-64 overflow-y-auto font-mono text-xs"
              >
                {log.map((entry, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: append-only log, index is stable
                  <div key={i} className="flex items-start gap-3">
                    <span style={{ color: "#374151", flexShrink: 0 }}>
                      {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                    <span
                      style={{
                        color: statusColor(entry.status),
                        flexShrink: 0,
                        minWidth: 60,
                      }}
                    >
                      {stepLabel(entry.step)}
                    </span>
                    {entry.report !== "system" && (
                      <span style={{ color: "#6B7280", flexShrink: 0 }}>
                        {entry.report}
                      </span>
                    )}
                    {entry.message && (
                      <span style={{ color: "var(--text-muted)" }}>
                        {entry.message}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Pulse animation */}
      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}

// ── ReportRow ─────────────────────────────────────────────────────────────────

function ReportRow({
  report,
  selected,
  resyncConfirmed,
  disabled,
  onToggle,
  onResync,
}: {
  report: RepairReport;
  selected: boolean;
  resyncConfirmed: boolean;
  disabled: boolean;
  onToggle: () => void;
  onResync: () => void;
}) {
  const isSynced = Boolean(report.irisSyncedAt);
  const needsConfirm = isSynced && selected && !resyncConfirmed;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: row wraps a checkbox, click toggles selection
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard via the inner checkbox
    <div
      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors"
      style={{
        background: selected ? "rgba(29,78,216,0.08)" : "transparent",
        borderBottom: "1px solid var(--border)",
      }}
      onClick={() => !disabled && onToggle()}
    >
      {/* Checkbox */}
      <div
        className="h-4 w-4 rounded flex items-center justify-center flex-shrink-0"
        style={{
          background: selected ? "#1D4ED8" : "transparent",
          border: selected ? "none" : "1.5px solid #374151",
        }}
      >
        {selected && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path
              d="M1 4l3 3 5-6"
              stroke="#fff"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {/* Report info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {report.reportNumber || "Untitled"}
          </span>
          {report.tagOrUnit && (
            <span
              className="text-xs truncate"
              style={{ color: "var(--text-muted)" }}
            >
              {report.tagOrUnit}
            </span>
          )}
        </div>
        <div
          className="text-xs truncate"
          style={{ color: "var(--text-muted)" }}
        >
          {[report.customer, report.siteTitle, report.repairDate]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>

      {/* Status badge */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {isSynced ? (
          <span
            className="rounded px-2 py-0.5 text-xs font-medium"
            style={{ background: "#0A2010", color: "#4ADE80" }}
          >
            {/* biome-ignore lint/style/noNonNullAssertion: isSynced guard above ensures non-null */}
            Synced {fmtDate(report.irisSyncedAt!)}
          </span>
        ) : (
          <span
            className="rounded px-2 py-0.5 text-xs"
            style={{ background: "#1A2330", color: "#4B5563" }}
          >
            Not synced
          </span>
        )}

        {needsConfirm && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onResync();
            }}
            className="rounded px-2 py-0.5 text-xs font-medium"
            style={{ background: "#1D4ED8", color: "#fff" }}
          >
            Confirm re-sync
          </button>
        )}
      </div>
    </div>
  );
}
