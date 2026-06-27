"use client";

import { useEffect, useRef, useState } from "react";
import type { ImportEvent, ImportedAsset } from "@/app/api/iris/import/route";
import Header from "@/components/Header";
import db from "@/lib/db";
import { emptyReport } from "@/lib/reportNumber";

// ── Types ──────────────────────────────────────────────────────────────────────

type ScanState = "idle" | "running" | "done" | "error";

type LogLine = {
  level: "info" | "warn" | "error";
  message: string;
  ts: string;
};

// ── Ollama setup instructions ──────────────────────────────────────────────────

function OllamaSetup() {
  return (
    <div
      className="rounded-xl border p-6 space-y-4"
      style={{ borderColor: "#1E40AF", background: "#0A1520" }}
    >
      <div className="flex items-center gap-3">
        <div
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: "#F87171" }}
        />
        <h2 className="text-sm font-semibold" style={{ color: "#93C5FD" }}>
          Ollama not detected
        </h2>
      </div>
      <p className="text-sm" style={{ color: "#6B7280" }}>
        Iris Import uses a local AI model (via Ollama) to read and extract data
        from the Iris portal. Install Ollama to get started — it&apos;s free and
        runs entirely on your machine.
      </p>
      <div className="space-y-2">
        {[
          {
            step: "1",
            label: "Install Ollama",
            code: "brew install ollama",
          },
          {
            step: "2",
            label: "Start the server",
            code: "ollama serve",
          },
          {
            step: "3",
            label: "Pull a model (pick one)",
            code: "ollama pull llama3.2\n# or for better accuracy:\nollama pull mistral",
          },
          {
            step: "4",
            label: "Refresh this page",
            code: null,
          },
        ].map(({ step, label, code }) => (
          <div key={step} className="flex gap-3">
            <div
              className="h-5 w-5 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5"
              style={{ background: "#1E3A5F", color: "#60A5FA" }}
            >
              {step}
            </div>
            <div className="space-y-1 flex-1">
              <p className="text-xs font-medium" style={{ color: "#CBD5E1" }}>
                {label}
              </p>
              {code && (
                <pre
                  className="rounded px-3 py-2 text-xs font-mono overflow-x-auto"
                  style={{ background: "#0D1117", color: "#A3E635" }}
                >
                  {code}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs" style={{ color: "#4B5563" }}>
        Recommended models: <code>llama3.2</code> (2 GB, fast),{" "}
        <code>mistral</code> (4 GB, more accurate)
      </p>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function IrisImportPage() {
  const [isLocal, setIsLocal] = useState(true);
  useEffect(() => {
    setIsLocal(
      window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1",
    );
  }, []);

  // Ollama status
  const [ollamaRunning, setOllamaRunning] = useState<boolean | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");

  // Scan state
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [log, setLog] = useState<LogLine[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  // Results
  const [assets, setAssets] = useState<ImportedAsset[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);

  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  // Auto-scroll log
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires on log change
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  // ── Check Ollama on mount ──────────────────────────────────────────────────

  useEffect(() => {
    fetch("/api/iris/import")
      .then((r) => r.json())
      .then((d: { running: boolean; models: string[] }) => {
        setOllamaRunning(d.running);
        setModels(d.models);
        if (d.models.length > 0) setSelectedModel(d.models[0]);
      })
      .catch(() => setOllamaRunning(false));
  }, []);

  // ── Scan ──────────────────────────────────────────────────────────────────

  async function startScan() {
    if (!selectedModel) return;
    abortRef.current = false;
    setScanState("running");
    setLog([]);
    setAssets([]);
    setSelectedTags(new Set());
    setScreenshot(null);
    setImported(0);

    let resp: Response;
    try {
      resp = await fetch("/api/iris/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });
    } catch (err) {
      setScanState("error");
      setLog([
        {
          level: "error",
          message: `Network error: ${err instanceof Error ? err.message : String(err)}`,
          ts: new Date().toISOString(),
        },
      ]);
      return;
    }

    if (!resp.ok) {
      setScanState("error");
      const msg = await resp.text().catch(() => `HTTP ${resp.status}`);
      setLog([{ level: "error", message: msg, ts: new Date().toISOString() }]);
      return;
    }

    // biome-ignore lint/style/noNonNullAssertion: SSE POST always has a body
    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (abortRef.current) {
        reader.cancel();
        setScanState("idle");
        return;
      }

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6)) as ImportEvent;

          if (event.kind === "screenshot") {
            setScreenshot(event.data);
            continue;
          }

          if (event.kind === "log") {
            setLog((p) => [
              ...p,
              {
                level: event.level,
                message: event.message,
                ts: new Date().toISOString(),
              },
            ]);
            continue;
          }

          if (event.kind === "assets") {
            setAssets(event.assets);
            setSelectedTags(new Set(event.assets.map((a) => a.tag)));
            continue;
          }

          if (event.kind === "error") {
            setLog((p) => [
              ...p,
              {
                level: "error",
                message: event.message,
                ts: new Date().toISOString(),
              },
            ]);
            setScanState("error");
            continue;
          }

          if (event.kind === "done") {
            setScanState("done");
          }
        } catch {}
      }
    }

    setScanState((s) => (s === "running" ? "done" : s));
  }

  // ── Import selected assets into Dexie ─────────────────────────────────────

  async function importSelected() {
    const toImport = assets.filter((a) => selectedTags.has(a.tag));
    if (toImport.length === 0) return;

    setImporting(true);
    let count = 0;

    for (const asset of toImport) {
      const id = crypto.randomUUID();
      // Generate a simple report number based on tag
      const reportNumber = `IMP-${asset.tag}`;
      const report = emptyReport(id, reportNumber);

      await db.reports.add({
        ...report,
        tagOrUnit: asset.tag,
        valveMake: asset.components?.valve?.manufacturer ?? "",
        valveModelSize: asset.components?.valve?.model ?? "",
        valveSerialNumber: asset.components?.valve?.serial ?? "",
        actuatorMake: asset.components?.actuator?.manufacturer ?? "",
        actuatorModelSize: asset.components?.actuator?.model ?? "",
        actuatorSerialNumber: asset.components?.actuator?.serial ?? "",
        positionerMake: asset.components?.positioner?.manufacturer ?? "",
        positionerModelAction: asset.components?.positioner?.model ?? "",
        positionerSerialNumber: asset.components?.positioner?.serial ?? "",
      });

      count++;
      setImported(count);
    }

    setImporting(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const isRunning = scanState === "running";
  const canScan =
    isLocal && ollamaRunning === true && !!selectedModel && !isRunning;
  const readyToImport = assets.filter((a) => selectedTags.has(a.tag));

  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ background: "var(--bg-base)" }}
    >
      <Header />

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Title */}
          <div>
            <h1
              className="text-lg font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Iris Import
            </h1>
            <p
              className="text-sm mt-0.5"
              style={{ color: "var(--text-muted)" }}
            >
              Scan Iris assets using a local AI model and import them as
              reports.
            </p>
          </div>

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
              ⚠️ Iris Import only works locally (<code>npm run dev</code>).
            </div>
          )}

          {/* Ollama status */}
          {ollamaRunning === null && (
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>
              Checking Ollama…
            </div>
          )}

          {ollamaRunning === false && <OllamaSetup />}

          {ollamaRunning === true && (
            <>
              {/* Model selector */}
              <section
                className="rounded-xl border p-5 space-y-3"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg-card)",
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ background: "#4ADE80" }}
                  />
                  <h2
                    className="text-sm font-semibold tracking-wide"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    OLLAMA CONNECTED
                  </h2>
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="model-select"
                    className="text-xs font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Model
                  </label>
                  <select
                    id="model-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={isRunning}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{
                      background: "var(--bg-input)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Larger models give more accurate extraction.{" "}
                    <code>mistral</code> or <code>llama3.2</code> recommended.
                  </p>
                </div>
              </section>

              {/* Scan button */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={startScan}
                  disabled={!canScan}
                  className="rounded-xl px-6 py-3 text-sm font-semibold transition-all"
                  style={{
                    background: canScan ? "#1D4ED8" : "#1F2937",
                    color: canScan ? "#fff" : "#4B5563",
                    cursor: canScan ? "pointer" : "not-allowed",
                  }}
                >
                  {isRunning ? "Scanning Iris…" : "Scan Iris →"}
                </button>

                {isRunning && (
                  <button
                    type="button"
                    onClick={() => {
                      abortRef.current = true;
                      setScanState("idle");
                    }}
                    className="rounded-xl px-5 py-3 text-sm font-semibold"
                    style={{
                      background: "#7F1D1D",
                      color: "#FCA5A5",
                      border: "1px solid #991B1B",
                    }}
                  >
                    Stop
                  </button>
                )}

                {scanState === "done" && assets.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    No assets found — try a different model or check the log.
                  </p>
                )}
              </div>

              {/* Live preview */}
              {(isRunning || screenshot) && (
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
                        LIVE BROWSER
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
                      {screenshot ? (
                        // biome-ignore lint/performance/noImgElement: base64 data URL
                        <img
                          src={`data:image/jpeg;base64,${screenshot}`}
                          alt="Live Iris browser view"
                          className="w-full rounded"
                          style={{ imageRendering: "crisp-edges" }}
                        />
                      ) : (
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

              {/* Log */}
              {log.length > 0 && (
                <section
                  className="rounded-xl border p-4"
                  style={{
                    borderColor: "var(--border)",
                    background: "var(--bg-card)",
                  }}
                >
                  <h2
                    className="text-xs font-semibold tracking-wide mb-3"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    SCAN LOG
                  </h2>
                  <div
                    ref={logRef}
                    className="space-y-1 max-h-52 overflow-y-auto font-mono text-xs"
                  >
                    {log.map((line, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: append-only
                      <div key={i} className="flex items-start gap-3">
                        <span style={{ color: "#374151", flexShrink: 0 }}>
                          {new Date(line.ts).toLocaleTimeString()}
                        </span>
                        <span
                          style={{
                            color:
                              line.level === "error"
                                ? "#F87171"
                                : line.level === "warn"
                                  ? "#FCD34D"
                                  : "#93C5FD",
                            flexShrink: 0,
                          }}
                        >
                          {line.level}
                        </span>
                        <span style={{ color: "var(--text-muted)" }}>
                          {line.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Results */}
              {assets.length > 0 && (
                <section
                  className="rounded-xl border p-5 space-y-4"
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
                      DISCOVERED ASSETS ({assets.length})
                    </h2>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedTags(new Set(assets.map((a) => a.tag)))
                        }
                        className="text-xs px-2 py-1 rounded"
                        style={{ color: "#60A5FA" }}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedTags(new Set())}
                        className="text-xs px-2 py-1 rounded"
                        style={{ color: "var(--text-muted)" }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                    {assets.map((asset) => {
                      const checked = selectedTags.has(asset.tag);
                      return (
                        // biome-ignore lint/a11y/noStaticElementInteractions: row wraps checkbox
                        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard via inner checkbox
                        <div
                          key={asset.tag}
                          className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors"
                          style={{
                            background: checked
                              ? "rgba(29,78,216,0.08)"
                              : "transparent",
                            borderBottom: "1px solid var(--border)",
                          }}
                          onClick={() =>
                            setSelectedTags((prev) => {
                              const next = new Set(prev);
                              if (next.has(asset.tag)) next.delete(asset.tag);
                              else next.add(asset.tag);
                              return next;
                            })
                          }
                        >
                          <div
                            className="h-4 w-4 rounded flex items-center justify-center flex-shrink-0"
                            style={{
                              background: checked ? "#1D4ED8" : "transparent",
                              border: checked ? "none" : "1.5px solid #374151",
                            }}
                          >
                            {checked && (
                              <svg
                                width="10"
                                height="8"
                                viewBox="0 0 10 8"
                                fill="none"
                              >
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
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="text-sm font-medium font-mono"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {asset.tag}
                              </span>
                              {asset.type && (
                                <span
                                  className="text-xs"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {asset.type}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Import button */}
                  {imported > 0 ? (
                    <div
                      className="rounded-lg px-4 py-3 text-sm font-medium"
                      style={{ background: "#0A2010", color: "#4ADE80" }}
                    >
                      ✓ Imported {imported} asset{imported !== 1 ? "s" : ""} as
                      draft reports. Open Reports to continue.
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={importSelected}
                      disabled={importing || readyToImport.length === 0}
                      className="rounded-xl px-6 py-3 text-sm font-semibold w-full transition-all"
                      style={{
                        background:
                          importing || readyToImport.length === 0
                            ? "#1F2937"
                            : "#059669",
                        color:
                          importing || readyToImport.length === 0
                            ? "#4B5563"
                            : "#fff",
                        cursor:
                          importing || readyToImport.length === 0
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      {importing
                        ? "Importing…"
                        : `Import ${readyToImport.length} asset${readyToImport.length !== 1 ? "s" : ""} as draft reports →`}
                    </button>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
