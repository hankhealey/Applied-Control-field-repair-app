"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import {
  buildObservationsHtml,
  exportIrisCsvFromParsed,
  exportRecordsCsvFromParsed,
  splitBenchSet,
  splitModelSize,
} from "@/lib/exports/iris";
import { checkAiAvailable, enhanceWithAi } from "@/lib/imports/ollamaParser";
import { type ParsedPdfReport, parsePdfFile } from "@/lib/imports/pdfParser";
import {
  deleteTrainingExample,
  getTrainingExamples,
  saveTrainingExample,
  type TrainingExample,
} from "@/lib/imports/trainingExamples";

type CsvCol = {
  header: string;
  getValue: (r: ParsedPdfReport) => string;
  onEdit: (current: ParsedPdfReport, v: string) => Partial<ParsedPdfReport>;
};

const CSV_COLS: CsvCol[] = [
  { header: "Tag",                              getValue: r => r.tagOrUnit,                                    onEdit: (_, v) => ({ tagOrUnit: v }) },
  { header: "Service description",              getValue: r => r.scopeOfWork,                                  onEdit: (_, v) => ({ scopeOfWork: v }) },
  { header: "P & ID no.",                       getValue: r => r.emrReference,                                 onEdit: (_, v) => ({ emrReference: v }) },
  { header: "Datasheet no.",                    getValue: r => r.crmodReference,                               onEdit: (_, v) => ({ crmodReference: v }) },
  { header: "Valve manufacturer",               getValue: r => r.valveMake,                                    onEdit: (_, v) => ({ valveMake: v }) },
  { header: "Valve model",                      getValue: r => splitModelSize(r.valveModelSize).model,         onEdit: (r, v) => ({ valveModelSize: [v, splitModelSize(r.valveModelSize).size].filter(Boolean).join(" ") }) },
  { header: "Valve serial number",              getValue: r => r.valveSerialNumber,                            onEdit: (_, v) => ({ valveSerialNumber: v }) },
  { header: "Valve size",                       getValue: r => splitModelSize(r.valveModelSize).size,          onEdit: (r, v) => ({ valveModelSize: [splitModelSize(r.valveModelSize).model, v].filter(Boolean).join(" ") }) },
  { header: "Valve pressure class",             getValue: r => r.valveClassConnection,                         onEdit: (_, v) => ({ valveClassConnection: v }) },
  { header: "Valve rated travel",               getValue: r => r.ratedTravel,                                  onEdit: (_, v) => ({ ratedTravel: v }) },
  { header: "Valve leak class",                 getValue: r => r.seatLeakClass,                                onEdit: (_, v) => ({ seatLeakClass: v }) },
  { header: "Valve trim style/number",          getValue: r => r.valveTrimCharPort,                            onEdit: (_, v) => ({ valveTrimCharPort: v }) },
  { header: "Valve packing type/material",      getValue: r => r.valvePackingConfiguration,                    onEdit: (_, v) => ({ valvePackingConfiguration: v }) },
  { header: "Valve flow direction",             getValue: r => r.valveFlowDirection,                           onEdit: (_, v) => ({ valveFlowDirection: v }) },
  { header: "Actuator manufacturer",            getValue: r => r.actuatorMake,                                 onEdit: (_, v) => ({ actuatorMake: v }) },
  { header: "Actuator model",                   getValue: r => splitModelSize(r.actuatorModelSize).model,      onEdit: (r, v) => ({ actuatorModelSize: [v, splitModelSize(r.actuatorModelSize).size].filter(Boolean).join(" ") }) },
  { header: "Actuator size",                    getValue: r => splitModelSize(r.actuatorModelSize).size,       onEdit: (r, v) => ({ actuatorModelSize: [splitModelSize(r.actuatorModelSize).model, v].filter(Boolean).join(" ") }) },
  { header: "Actuator serial number",           getValue: r => r.actuatorSerialNumber,                         onEdit: (_, v) => ({ actuatorSerialNumber: v }) },
  { header: "Actuator lower bench set",         getValue: r => splitBenchSet(r.benchSetAsLeft)[0],             onEdit: (r, v) => ({ benchSetAsLeft: [v, splitBenchSet(r.benchSetAsLeft)[1]].filter(Boolean).join("-") }) },
  { header: "Actuator upper bench set",         getValue: r => splitBenchSet(r.benchSetAsLeft)[1],             onEdit: (r, v) => ({ benchSetAsLeft: [splitBenchSet(r.benchSetAsLeft)[0], v].filter(Boolean).join("-") }) },
  { header: "Actuator nominal supply pressure", getValue: r => r.supplyPressureAsLeft,                         onEdit: (_, v) => ({ supplyPressureAsLeft: v }) },
  { header: "Actuator fail action",             getValue: r => r.failActionAsLeft,                             onEdit: (_, v) => ({ failActionAsLeft: v }) },
  { header: "Actuator air",                     getValue: r => r.actuatorAirAction,                            onEdit: (_, v) => ({ actuatorAirAction: v }) },
  { header: "Device 1 Manufacturer",            getValue: r => r.positionerMake,                               onEdit: (_, v) => ({ positionerMake: v }) },
  { header: "Device 1 Model number",            getValue: r => r.positionerModelAction,                        onEdit: (_, v) => ({ positionerModelAction: v }) },
  { header: "Device 1 Serial number",           getValue: r => r.positionerSerialNumber,                       onEdit: (_, v) => ({ positionerSerialNumber: v }) },
];

interface FileEntry {
  file: File;
  status: "pending" | "parsing" | "enhancing" | "done" | "error";
  statusMsg?: string;
  error?: string;
  result?: ParsedPdfReport;
}

export default function ImportPage() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [editing, setEditing] = useState<Record<string, Partial<ParsedPdfReport>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [useAi, setUseAi] = useState(true);
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [showExamples, setShowExamples] = useState(false);

  useEffect(() => {
    checkAiAvailable().then(setAiAvailable);
    setExamples(getTrainingExamples());
  }, []);

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type === "application/pdf");
    if (!arr.length) return;
    setEntries((prev) => [...prev, ...arr.map((f) => ({ file: f, status: "pending" as const }))]);
    arr.forEach(parseFile);
  }

  async function parseFile(file: File) {
    setEntries((prev) => prev.map((e) => e.file === file ? { ...e, status: "parsing", statusMsg: "Extracting fields…" } : e));
    try {
      let result = await parsePdfFile(file);
      if (useAi && aiAvailable) {
        setEntries((prev) => prev.map((e) => e.file === file ? { ...e, status: "enhancing", statusMsg: "AI filling missing fields…" } : e));
        result = await enhanceWithAi(result, (msg) => {
          setEntries((prev) => prev.map((e) => (e.file === file ? { ...e, statusMsg: msg } : e)));
        }, examples);
      }
      setEntries((prev) => prev.map((e) => e.file === file ? { ...e, status: "done", result, statusMsg: undefined } : e));
    } catch (err) {
      setEntries((prev) => prev.map((e) => e.file === file ? { ...e, status: "error", error: String(err), statusMsg: undefined } : e));
    }
  }

  function removeEntry(file: File) {
    setEntries((prev) => prev.filter((e) => e.file !== file));
  }

  function saveExample(entry: FileEntry) {
    const merged = getMergedResult(entry);
    if (!merged?._rawText) return;
    const fields = Object.fromEntries(
      Object.entries(merged).filter(([k, v]) => !k.startsWith("_") && typeof v === "string" && v.trim()),
    ) as Record<string, string>;
    const saved = saveTrainingExample({ filename: entry.file.name.replace(/\.pdf$/i, ""), rawText: merged._rawText, fields });
    setExamples((prev) => [...prev, saved]);
  }

  function removeExample(id: string) {
    deleteTrainingExample(id);
    setExamples((prev) => prev.filter((e) => e.id !== id));
  }

  function applyEdit(filename: string, patch: Partial<ParsedPdfReport>) {
    setEditing((prev) => ({ ...prev, [filename]: { ...(prev[filename] ?? {}), ...patch } }));
  }

  function getMergedResult(entry: FileEntry): ParsedPdfReport | undefined {
    if (!entry.result) return undefined;
    return { ...entry.result, ...(editing[entry.file.name] ?? {}) };
  }

  const doneEntries = entries.filter((e) => e.status === "done");
  const mergedResults = doneEntries.map((e) => getMergedResult(e)).filter((r): r is ParsedPdfReport => r !== undefined);

  function exportLabel() {
    if (mergedResults.length === 1) return mergedResults[0].tagOrUnit || "import";
    return `${mergedResults.length} reports`;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-main)" }}>
      <Header />

      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
        {/* Title */}
        <div className="mb-4">
          <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
            PDF → IRIS Import
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>
            Upload Applied Control repair report PDFs to extract field data and export as IRIS CSV.
          </p>
        </div>

        {/* AI status bar */}
        <div
          className="mb-5 rounded-xl border px-4 py-3 flex items-center gap-4 flex-wrap"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full"
              style={{
                background: aiAvailable === null
                  ? "var(--text-label)"
                  : aiAvailable
                    ? "var(--color-success-text)"
                    : "var(--color-danger-text)",
              }}
            />
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {aiAvailable === null ? "Checking AI…" : aiAvailable ? "Groq AI ready" : "AI not configured — regex only"}
            </span>
          </div>

          {aiAvailable && (
            <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={useAi}
                onChange={(e) => setUseAi(e.target.checked)}
                className="rounded"
                style={{ accentColor: "var(--accent)" }}
              />
              Fill missing fields with AI
            </label>
          )}

          {aiAvailable === false && (
            <span className="text-xs" style={{ color: "var(--text-label)" }}>
              Add <code className="rounded px-1" style={{ background: "var(--bg-surface)" }}>GROQ_API_KEY</code>{" "}
              to your environment to enable AI field completion
            </span>
          )}

          {examples.length > 0 && (
            <button
              type="button"
              onClick={() => setShowExamples((v) => !v)}
              className="ml-auto text-xs hover:underline"
              style={{ color: "var(--accent)" }}
            >
              {examples.length} training example{examples.length !== 1 ? "s" : ""} {showExamples ? "▲" : "▼"}
            </button>
          )}
        </div>

        {/* Training examples list */}
        {showExamples && examples.length > 0 && (
          <div
            className="mb-4 rounded-xl border px-4 py-3"
            style={{ background: "var(--color-info-bg)", borderColor: "var(--color-info-border)" }}
          >
            <p className="mb-2 text-xs font-semibold" style={{ color: "var(--color-info-text)" }}>
              Training Examples — included in every AI extraction
            </p>
            <div className="flex flex-col gap-1">
              {examples.map((ex) => (
                <div key={ex.id} className="flex items-center gap-2 text-xs" style={{ color: "var(--color-info-text)" }}>
                  <span className="flex-1 truncate">{ex.filename}</span>
                  <span style={{ opacity: 0.6 }}>{new Date(ex.savedAt).toLocaleDateString()}</span>
                  <button
                    type="button"
                    onClick={() => removeExample(ex.id)}
                    className="opacity-50 hover:opacity-100 hover:text-red-500 transition-opacity"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Drop zone */}
        <button
          type="button"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
          className="mb-5 flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors"
          style={{
            borderColor: dragOver ? "var(--accent)" : "var(--border-solid)",
            background: dragOver ? "rgba(37,99,235,0.05)" : "var(--bg-card)",
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mb-3" style={{ color: "var(--text-label)" }}>
            <rect x="8" y="4" width="24" height="32" rx="3" stroke="currentColor" strokeWidth="2" />
            <path d="M14 14h12M14 19h12M14 24h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M24 4v8h8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Drop PDF files here or click to browse
          </p>
          <p className="text-xs" style={{ color: "var(--text-label)" }}>
            Applied Control repair report PDFs
          </p>
        </button>

        {/* File list */}
        {entries.length > 0 && (
          <div
            className="mb-5 rounded-xl border"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <h2 className="label-sm">Uploaded Files ({entries.length})</h2>
            </div>
            <div>
              {entries.map((entry, i) => (
                <div
                  key={entry.file.name}
                  className="flex items-center gap-3 px-4 py-3"
                  style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {entry.file.name}
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-label)" }}>
                      {(entry.file.size / 1024).toFixed(0)} KB
                    </p>
                    {entry.result?._warnings?.map((w) => (
                      <p key={w} className="mt-0.5 text-xs" style={{ color: "var(--color-warning-text)" }}>
                        {w}
                      </p>
                    ))}
                  </div>
                  {(entry.status === "parsing" || entry.status === "enhancing") && (
                    <span className="text-xs font-medium animate-pulse whitespace-nowrap" style={{ color: "var(--accent)" }}>
                      {entry.statusMsg ?? (entry.status === "enhancing" ? "AI…" : "Parsing…")}
                    </span>
                  )}
                  {entry.status === "done" && (
                    <span className="text-xs font-medium whitespace-nowrap" style={{ color: "var(--color-success-text)" }}>
                      ✓ Done{entry.result?._warnings?.some((w) => w.includes("AI filled")) ? " + AI" : ""}
                    </span>
                  )}
                  {entry.status === "error" && (
                    <span className="text-xs font-medium" style={{ color: "var(--color-danger-text)" }} title={entry.error}>
                      ✗ Error
                    </span>
                  )}
                  {entry.status === "pending" && (
                    <span className="text-xs" style={{ color: "var(--text-label)" }}>Pending</span>
                  )}
                  {entry.status === "done" && (
                    <button
                      type="button"
                      onClick={() => saveExample(entry)}
                      title="Save as training example so AI learns from this report"
                      className="rounded-lg border px-2 py-0.5 text-xs whitespace-nowrap transition-colors"
                      style={{
                        borderColor: "var(--color-info-border)",
                        color: "var(--color-info-text)",
                        background: "var(--color-info-bg)",
                      }}
                    >
                      + Train AI
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.file)}
                    className="opacity-40 hover:opacity-100 transition-opacity"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extracted data + edit */}
        {doneEntries.length > 0 && (
          <>
            <div className="mb-5">
              <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
                <h2 className="label-sm">
                  Extracted Data — review and correct before exporting
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      exportIrisCsvFromParsed(mergedResults);
                      toast(`Downloaded Assets CSV for ${exportLabel()}`, "success");
                    }}
                  >
                    Assets CSV
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      exportRecordsCsvFromParsed(mergedResults);
                      toast(`Downloaded Records CSV for ${exportLabel()}`, "success");
                    }}
                  >
                    Records CSV
                  </Button>
                  <Button
                    variant="warning"
                    size="sm"
                    onClick={() => {
                      exportIrisCsvFromParsed(mergedResults);
                      exportRecordsCsvFromParsed(mergedResults);
                      toast(`Downloaded 2 files for ${exportLabel()}: Assets + Records CSV`, "success");
                    }}
                  >
                    Export Both
                  </Button>
                </div>
              </div>

              <div
                className="overflow-x-auto rounded-xl border"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <table className="text-xs" style={{ minWidth: "max-content" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                      <th
                        className="sticky left-0 z-10 px-3 py-2 text-left font-semibold min-w-[160px] border-r"
                        style={{ background: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
                      >
                        File
                      </th>
                      {CSV_COLS.map((col) => (
                        <th
                          key={col.header}
                          className="px-3 py-2 text-left font-semibold min-w-[140px] whitespace-nowrap"
                          style={{ color: "var(--text-label)" }}
                        >
                          {col.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {doneEntries.map((e, rowIdx) => {
                      const merged = getMergedResult(e);
                      return (
                        <tr
                          key={e.file.name}
                          style={{ borderTop: rowIdx > 0 ? "1px solid var(--border)" : undefined }}
                        >
                          <td
                            className="sticky left-0 z-10 px-3 py-1.5 font-medium border-r whitespace-nowrap"
                            style={{
                              background: "var(--bg-card)",
                              borderColor: "var(--border)",
                              color: "var(--text-primary)",
                            }}
                          >
                            {e.file.name.replace(/\.pdf$/i, "")}
                          </td>
                          {CSV_COLS.map((col) => {
                            const val = merged ? col.getValue(merged) : "";
                            return (
                              <td key={col.header} className="px-2 py-1">
                                <input
                                  type="text"
                                  value={val}
                                  onChange={(ev) => merged && applyEdit(e.file.name, col.onEdit(merged, ev.target.value))}
                                  className="w-full rounded-lg border px-2 py-1 text-xs outline-none"
                                  style={{
                                    background: "var(--bg-input, var(--bg-surface))",
                                    borderColor: val ? "var(--border-solid)" : "var(--border)",
                                    color: val ? "var(--text-primary)" : "var(--text-label)",
                                  }}
                                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                                  onBlur={(e) => (e.currentTarget.style.borderColor = val ? "var(--border-solid)" : "var(--border)")}
                                  placeholder="—"
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs" style={{ color: "var(--text-label)" }}>
                Column headers match the IRIS CSV exactly. Click any cell to correct before exporting.
              </p>
            </div>

            {/* Records CSV preview */}
            <div className="mb-5">
              <div className="mb-3">
                <h2 className="label-sm">Records CSV Preview</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-label)" }}>
                  One Preventative record per report — linked to the asset by tag.
                </p>
              </div>
              <div
                className="overflow-x-auto rounded-xl border"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <table className="text-xs" style={{ minWidth: "max-content" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                      {["Assets", "Type", "Status", "Description", "Occurrence date", "WO/MOC ref.", "Customer contact", "Observations"].map((h, i) => (
                        <th
                          key={h}
                          className={`px-3 py-2 text-left font-semibold whitespace-nowrap ${i === 0 ? "sticky left-0 z-10 min-w-[120px] border-r" : ""} ${h === "Description" || h === "Observations" ? "min-w-[160px]" : ""}`}
                          style={{
                            background: "var(--bg-surface)",
                            borderColor: "var(--border)",
                            color: i === 0 ? "var(--text-secondary)" : "var(--text-label)",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {doneEntries.map((e, rowIdx) => {
                      const r = getMergedResult(e);
                      if (!r) return null;
                      const obs = buildObservationsHtml(r);
                      const woRef = r.emrReference || r.crmodReference || "";
                      return (
                        <tr key={e.file.name} style={{ borderTop: rowIdx > 0 ? "1px solid var(--border)" : undefined }}>
                          <td
                            className="sticky left-0 z-10 px-3 py-1.5 font-medium border-r whitespace-nowrap"
                            style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-primary)" }}
                          >
                            {r.tagOrUnit || "—"}
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>Preventative</td>
                          <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>Identified</td>
                          <td className="px-3 py-1.5 max-w-xs truncate" style={{ color: "var(--text-secondary)" }} title={r.scopeOfWork}>{r.scopeOfWork || "—"}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{r.repairDate || "—"}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{woRef || "—"}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-secondary)" }}>{r.technician || "—"}</td>
                          <td className="px-3 py-1.5 min-w-[260px] max-w-xs">
                            {obs ? (
                              <div
                                className="max-h-20 overflow-hidden text-[10px] [&_strong]:font-semibold [&_p]:leading-snug"
                                style={{ color: "var(--text-secondary)" }}
                                // eslint-disable-next-line react/no-danger
                                dangerouslySetInnerHTML={{ __html: obs }}
                              />
                            ) : (
                              <span className="text-[10px]" style={{ color: "var(--text-label)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs" style={{ color: "var(--text-label)" }}>
                Read-only — edit values in the IRIS Asset table above. Observations are auto-built from scope + calibration data.
              </p>
            </div>
          </>
        )}

        {entries.length === 0 && (
          <div
            className="rounded-xl border p-8 text-center text-sm"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-label)" }}
          >
            No PDFs uploaded yet. Drop files above to get started.
          </div>
        )}
      </main>
    </div>
  );
}
