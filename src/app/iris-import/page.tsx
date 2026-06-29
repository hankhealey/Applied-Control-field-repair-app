"use client";

import { useEffect, useRef, useState } from "react";
import type { ImportEvent, ImportedAsset } from "@/app/api/iris/import/route";
import Header from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import db from "@/lib/db";
import { emptyReport } from "@/lib/reportNumber";

type ScanState = "idle" | "running" | "done" | "error";

type LogLine = {
  level: "info" | "warn" | "error";
  message: string;
  ts: string;
};

function OllamaSetup() {
  return (
    <div
      className="rounded-xl border p-6 space-y-4"
      style={{ borderColor: "var(--color-info-border)", background: "var(--color-info-bg)" }}
    >
      <div className="flex items-center gap-3">
        <div className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-danger-text)" }} />
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-info-text)" }}>
          Ollama not detected
        </h2>
      </div>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Iris Import uses a local AI model (via Ollama) to read and extract data
        from the Iris portal. Install Ollama to get started — it&apos;s free and
        runs entirely on your machine.
      </p>
      <div className="space-y-3">
        {[
          { step: "1", label: "Install Ollama", code: "brew install ollama" },
          { step: "2", label: "Start the server", code: "ollama serve" },
          {
            step: "3",
            label: "Pull a model (pick one)",
            code: "ollama pull llama3.2\n# or for better accuracy:\nollama pull mistral",
          },
          { step: "4", label: "Refresh this page", code: null },
        ].map(({ step, label, code }) => (
          <div key={step} className="flex gap-3">
            <div
              className="h-5 w-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: "var(--color-info-bg-strong)", color: "var(--color-info-text)" }}
            >
              {step}
            </div>
            <div className="space-y-1 flex-1">
              <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                {label}
              </p>
              {code && (
                <pre
                  className="rounded-lg px-3 py-2 text-xs font-mono overflow-x-auto"
                  style={{ background: "var(--bg-sidebar)", color: "var(--color-success-text)" }}
                >
                  {code}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--text-label)" }}>
        Recommended models: <code>llama3.2</code> (2 GB, fast),{" "}
        <code>mistral</code> (4 GB, more accurate)
      </p>
    </div>
  );
}

export default function IrisImportPage() {
  const { toast } = useToast();
  const [isLocal, setIsLocal] = useState(true);
  useEffect(() => {
    setIsLocal(
      window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1",
    );
  }, []);

  const [ollamaRunning, setOllamaRunning] = useState<boolean | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [log, setLog] = useState<LogLine[]>([]);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const [assets, setAssets] = useState<ImportedAsset[]>([]);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(0);

  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fires on log change
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

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
      setLog([{ level: "error", message: `Network error: ${err instanceof Error ? err.message : String(err)}`, ts: new Date().toISOString() }]);
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
          if (event.kind === "screenshot") { setScreenshot(event.data); continue; }
          if (event.kind === "log") {
            setLog((p) => [...p, { level: event.level, message: event.message, ts: new Date().toISOString() }]);
            continue;
          }
          if (event.kind === "assets") {
            setAssets(event.assets);
            setSelectedTags(new Set(event.assets.map((a) => a.tag)));
            continue;
          }
          if (event.kind === "error") {
            setLog((p) => [...p, { level: "error", message: event.message, ts: new Date().toISOString() }]);
            setScanState("error");
            continue;
          }
          if (event.kind === "done") setScanState("done");
        } catch {}
      }
    }

    setScanState((s) => (s === "running" ? "done" : s));
  }

  async function importSelected() {
    const toImport = assets.filter((a) => selectedTags.has(a.tag));
    if (toImport.length === 0) return;
    setImporting(true);
    let count = 0;
    for (const asset of toImport) {
      const id = crypto.randomUUID();
      const report = emptyReport(id, `IMP-${asset.tag}`);
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
    toast(`Imported ${count} asset${count !== 1 ? "s" : ""} as draft reports`, "success");
  }

  const isRunning = scanState === "running";
  const canScan = isLocal && ollamaRunning === true && !!selectedModel && !isRunning;
  const readyToImport = assets.filter((a) => selectedTags.has(a.tag));

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--bg-main)" }}>
      <Header />

      <div className="flex-1 overflow-auto">
        <main className="mx-auto max-w-3xl px-3 py-5 sm:px-6 sm:py-6 space-y-5">
          {/* Title */}
          <div>
            <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              Iris Import
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
              Scan Iris assets using a local AI model and import them as reports.
            </p>
          </div>

          {/* Local-only warning */}
          {!isLocal && (
            <div
              className="rounded-xl border px-4 py-3 text-sm"
              style={{
                background: "var(--color-warning-bg)",
                borderColor: "var(--color-warning-border)",
                color: "var(--color-warning-text)",
              }}
            >
              Iris Import only works locally (<code>npm run dev</code>).
            </div>
          )}

          {/* Ollama status */}
          {ollamaRunning === null && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Checking Ollama…
            </p>
          )}

          {ollamaRunning === false && <OllamaSetup />}

          {ollamaRunning === true && (
            <>
              {/* Model selector */}
              <section
                className="rounded-xl border p-5 space-y-3"
                style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ background: "var(--color-success-text)" }} />
                  <h2 className="text-xs font-semibold tracking-wider" style={{ color: "var(--text-secondary)" }}>
                    OLLAMA CONNECTED
                  </h2>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="model-select" className="label-sm block">
                    Model
                  </label>
                  <select
                    id="model-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={isRunning}
                    className="input"
                  >
                    {models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <p className="text-xs" style={{ color: "var(--text-label)" }}>
                    Larger models give more accurate extraction.{" "}
                    <code>mistral</code> or <code>llama3.2</code> recommended.
                  </p>
                </div>
              </section>

              {/* Scan controls */}
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={startScan}
                  disabled={!canScan}
                  loading={isRunning}
                >
                  {isRunning ? "Scanning Iris…" : "Scan Iris →"}
                </Button>

                {isRunning && (
                  <Button
                    variant="danger"
                    onClick={() => { abortRef.current = true; setScanState("idle"); }}
                  >
                    Stop
                  </Button>
                )}

                {scanState === "done" && assets.length === 0 && (
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    No assets found — try a different model or check the log.
                  </p>
                )}
              </div>

              {/* Live preview */}
              {(isRunning || screenshot) && (
                <section
                  className="rounded-xl border overflow-hidden"
                  style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-2.5"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{
                          background: isRunning ? "var(--color-success-text)" : "var(--text-label)",
                          boxShadow: isRunning ? "0 0 6px var(--color-success-text)" : "none",
                          animation: isRunning ? "iris-pulse 1.5s infinite" : "none",
                        }}
                      />
                      <span className="text-xs font-semibold tracking-wider" style={{ color: "var(--text-secondary)" }}>
                        LIVE BROWSER
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setShowPreview((v) => !v)}>
                      {showPreview ? "Hide" : "Show"}
                    </Button>
                  </div>
                  {showPreview && (
                    <div className="p-3" style={{ background: "var(--bg-sidebar)" }}>
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
                          style={{ background: "var(--bg-main)", color: "var(--text-label)" }}
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
                  style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
                >
                  <h2 className="text-xs font-semibold tracking-wider mb-3" style={{ color: "var(--text-secondary)" }}>
                    SCAN LOG
                  </h2>
                  <div ref={logRef} className="space-y-1 max-h-52 overflow-y-auto font-mono text-xs">
                    {log.map((line, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: append-only
                      <div key={i} className="flex items-start gap-3">
                        <span style={{ color: "var(--text-label)", flexShrink: 0 }}>
                          {new Date(line.ts).toLocaleTimeString()}
                        </span>
                        <span
                          style={{
                            color: line.level === "error"
                              ? "var(--color-danger-text)"
                              : line.level === "warn"
                                ? "var(--color-warning-text)"
                                : "var(--color-info-text)",
                            flexShrink: 0,
                          }}
                        >
                          {line.level}
                        </span>
                        <span style={{ color: "var(--text-secondary)" }}>{line.message}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Results */}
              {assets.length > 0 && (
                <section
                  className="rounded-xl border p-5 space-y-4"
                  style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="label-sm">
                      Discovered Assets ({assets.length})
                    </h2>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTags(new Set(assets.map((a) => a.tag)))}
                      >
                        Select all
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedTags(new Set())}
                      >
                        Clear
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-lg overflow-hidden max-h-80 overflow-y-auto border" style={{ borderColor: "var(--border)" }}>
                    {assets.map((asset) => {
                      const checked = selectedTags.has(asset.tag);
                      return (
                        // biome-ignore lint/a11y/noStaticElementInteractions: row wraps checkbox
                        // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard via inner checkbox
                        <div
                          key={asset.tag}
                          className="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors"
                          style={{
                            background: checked ? "rgba(var(--accent-rgb, 29,78,216),0.08)" : "transparent",
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
                            className="h-4 w-4 rounded flex items-center justify-center shrink-0"
                            style={{
                              background: checked ? "var(--accent)" : "transparent",
                              border: checked ? "none" : "1.5px solid var(--border-solid)",
                            }}
                          >
                            {checked && (
                              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium font-mono" style={{ color: "var(--text-primary)" }}>
                                {asset.tag}
                              </span>
                              {asset.type && (
                                <span className="text-xs" style={{ color: "var(--text-label)" }}>
                                  {asset.type}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {imported > 0 ? (
                    <div
                      className="rounded-lg px-4 py-3 text-sm font-medium"
                      style={{ background: "var(--color-success-bg)", color: "var(--color-success-text)" }}
                    >
                      ✓ Imported {imported} asset{imported !== 1 ? "s" : ""} as draft reports. Open Reports to continue.
                    </div>
                  ) : (
                    <Button
                      variant="primary"
                      className="w-full justify-center"
                      loading={importing}
                      disabled={importing || readyToImport.length === 0}
                      onClick={importSelected}
                    >
                      {importing
                        ? "Importing…"
                        : `Import ${readyToImport.length} asset${readyToImport.length !== 1 ? "s" : ""} as draft reports →`}
                    </Button>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>

      <style>{`@keyframes iris-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
