"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import {
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

// ── CSV column definitions — exact IRIS column names + field mapping ──────────
type CsvCol = {
  header: string;
  getValue: (r: ParsedPdfReport) => string;
  // Returns a patch to merge into ParsedPdfReport when the user edits the cell.
  // Derived columns reconstruct the combined source field from the edited part.
  onEdit: (current: ParsedPdfReport, v: string) => Partial<ParsedPdfReport>;
};

const CSV_COLS: CsvCol[] = [
  { header: "Tag",                              getValue: r => r.tagOrUnit,                                    onEdit: (_, v) => ({ tagOrUnit: v }) },
  { header: "Service description",              getValue: r => r.scopeOfWork,                                  onEdit: (_, v) => ({ scopeOfWork: v }) },
  { header: "P & ID no.",                       getValue: r => r.emrReference,                                 onEdit: (_, v) => ({ emrReference: v }) },
  { header: "Datasheet no.",                    getValue: r => r.crmodReference,                               onEdit: (_, v) => ({ crmodReference: v }) },
  { header: "Valve manufacturer",               getValue: r => r.valveMake,                                    onEdit: (_, v) => ({ valveMake: v }) },
  {
    header: "Valve model",
    getValue: r => splitModelSize(r.valveModelSize).model,
    onEdit: (r, v) => ({ valveModelSize: [v, splitModelSize(r.valveModelSize).size].filter(Boolean).join(" ") }),
  },
  { header: "Valve serial number",              getValue: r => r.valveSerialNumber,                            onEdit: (_, v) => ({ valveSerialNumber: v }) },
  {
    header: "Valve size",
    getValue: r => splitModelSize(r.valveModelSize).size,
    onEdit: (r, v) => ({ valveModelSize: [splitModelSize(r.valveModelSize).model, v].filter(Boolean).join(" ") }),
  },
  { header: "Valve pressure class",             getValue: r => r.valveClassConnection,                         onEdit: (_, v) => ({ valveClassConnection: v }) },
  { header: "Valve rated travel",               getValue: r => r.ratedTravel,                                  onEdit: (_, v) => ({ ratedTravel: v }) },
  { header: "Valve leak class",                 getValue: r => r.seatLeakClass,                                onEdit: (_, v) => ({ seatLeakClass: v }) },
  { header: "Valve trim style/number",          getValue: r => r.valveTrimCharPort,                            onEdit: (_, v) => ({ valveTrimCharPort: v }) },
  { header: "Valve packing type/material",      getValue: r => r.valvePackingConfiguration,                    onEdit: (_, v) => ({ valvePackingConfiguration: v }) },
  { header: "Valve flow direction",             getValue: r => r.valveFlowDirection,                           onEdit: (_, v) => ({ valveFlowDirection: v }) },
  { header: "Actuator manufacturer",            getValue: r => r.actuatorMake,                                 onEdit: (_, v) => ({ actuatorMake: v }) },
  {
    header: "Actuator model",
    getValue: r => splitModelSize(r.actuatorModelSize).model,
    onEdit: (r, v) => ({ actuatorModelSize: [v, splitModelSize(r.actuatorModelSize).size].filter(Boolean).join(" ") }),
  },
  {
    header: "Actuator size",
    getValue: r => splitModelSize(r.actuatorModelSize).size,
    onEdit: (r, v) => ({ actuatorModelSize: [splitModelSize(r.actuatorModelSize).model, v].filter(Boolean).join(" ") }),
  },
  { header: "Actuator serial number",           getValue: r => r.actuatorSerialNumber,                         onEdit: (_, v) => ({ actuatorSerialNumber: v }) },
  {
    header: "Actuator lower bench set",
    getValue: r => splitBenchSet(r.benchSetAsLeft)[0],
    onEdit: (r, v) => ({ benchSetAsLeft: [v, splitBenchSet(r.benchSetAsLeft)[1]].filter(Boolean).join("-") }),
  },
  {
    header: "Actuator upper bench set",
    getValue: r => splitBenchSet(r.benchSetAsLeft)[1],
    onEdit: (r, v) => ({ benchSetAsLeft: [splitBenchSet(r.benchSetAsLeft)[0], v].filter(Boolean).join("-") }),
  },
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
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [editing, setEditing] = useState<
    Record<string, Partial<ParsedPdfReport>>
  >({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // AI enhancement state
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [useAi, setUseAi] = useState(true);
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [showExamples, setShowExamples] = useState(false);

  // Export success toast
  const [exportToast, setExportToast] = useState<string | null>(null);

  useEffect(() => {
    checkAiAvailable().then(setAiAvailable);
    setExamples(getTrainingExamples());
  }, []);

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type === "application/pdf");
    if (!arr.length) return;
    setEntries((prev) => [
      ...prev,
      ...arr.map((f) => ({ file: f, status: "pending" as const })),
    ]);
    arr.forEach(parseFile);
  }

  async function parseFile(file: File) {
    setEntries((prev) =>
      prev.map((e) =>
        e.file === file
          ? { ...e, status: "parsing", statusMsg: "Extracting fields…" }
          : e,
      ),
    );
    try {
      // Pass 1-3: position-based regex extraction
      let result = await parsePdfFile(file);

      // AI enhancement: fills any fields the regex left empty (via Groq)
      if (useAi && aiAvailable) {
        setEntries((prev) =>
          prev.map((e) =>
            e.file === file
              ? {
                  ...e,
                  status: "enhancing",
                  statusMsg: "AI filling missing fields…",
                }
              : e,
          ),
        );
        result = await enhanceWithAi(
          result,
          (msg) => {
            setEntries((prev) =>
              prev.map((e) => (e.file === file ? { ...e, statusMsg: msg } : e)),
            );
          },
          examples,
        );
      }

      setEntries((prev) =>
        prev.map((e) =>
          e.file === file
            ? { ...e, status: "done", result, statusMsg: undefined }
            : e,
        ),
      );
    } catch (err) {
      setEntries((prev) =>
        prev.map((e) =>
          e.file === file
            ? {
                ...e,
                status: "error",
                error: String(err),
                statusMsg: undefined,
              }
            : e,
        ),
      );
    }
  }

  function removeEntry(file: File) {
    setEntries((prev) => prev.filter((e) => e.file !== file));
  }

  function saveExample(entry: FileEntry) {
    const merged = getMergedResult(entry);
    if (!merged?._rawText) return;
    const fields = Object.fromEntries(
      Object.entries(merged).filter(
        ([k, v]) => !k.startsWith("_") && typeof v === "string" && v.trim(),
      ),
    ) as Record<string, string>;
    const saved = saveTrainingExample({
      filename: entry.file.name.replace(/\.pdf$/i, ""),
      rawText: merged._rawText,
      fields,
    });
    setExamples((prev) => [...prev, saved]);
  }

  function removeExample(id: string) {
    deleteTrainingExample(id);
    setExamples((prev) => prev.filter((e) => e.id !== id));
  }

  function applyEdit(filename: string, patch: Partial<ParsedPdfReport>) {
    setEditing((prev) => ({
      ...prev,
      [filename]: { ...(prev[filename] ?? {}), ...patch },
    }));
  }

  function getMergedResult(entry: FileEntry): ParsedPdfReport | undefined {
    if (!entry.result) return undefined;
    return { ...entry.result, ...(editing[entry.file.name] ?? {}) };
  }

  const doneEntries = entries.filter((e) => e.status === "done");
  const mergedResults = doneEntries
    .map((e) => getMergedResult(e))
    .filter((r): r is ParsedPdfReport => r !== undefined);

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />

      {/* Export success toast */}
      {exportToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white shadow-xl">
          ✅ {exportToast}
        </div>
      )}

      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">
        {/* Title */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-zinc-900">PDF → IRIS Import</h1>
          <p className="text-sm text-zinc-500">
            Upload Applied Control repair report PDFs to extract field data and
            export as IRIS CSV.
          </p>
        </div>

        {/* AI status bar */}
        <div className="mb-6 rounded-xl border px-4 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full"
              style={{
                background:
                  aiAvailable === null
                    ? "#6B7280"
                    : aiAvailable
                      ? "#4ADE80"
                      : "#F87171",
              }}
            />
            <span className="text-xs font-medium text-zinc-600">
              {aiAvailable === null
                ? "Checking AI…"
                : aiAvailable
                  ? "Groq AI ready"
                  : "AI not configured — regex only"}
            </span>
          </div>

          {aiAvailable && (
            <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer">
              <input
                type="checkbox"
                checked={useAi}
                onChange={(e) => setUseAi(e.target.checked)}
                className="rounded"
              />
              Fill missing fields with AI
            </label>
          )}

          {aiAvailable === false && (
            <span className="text-xs text-zinc-400">
              Add <code className="bg-zinc-100 px-1 rounded">GROQ_API_KEY</code>{" "}
              to your environment to enable AI field completion
            </span>
          )}

          {examples.length > 0 && (
            <button
              type="button"
              onClick={() => setShowExamples((v) => !v)}
              className="ml-auto text-xs text-blue-600 hover:underline"
            >
              {examples.length} training example
              {examples.length !== 1 ? "s" : ""} {showExamples ? "▲" : "▼"}
            </button>
          )}
        </div>

        {/* Training examples list */}
        {showExamples && examples.length > 0 && (
          <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-blue-700">
              Training Examples — included in every AI extraction
            </p>
            <div className="flex flex-col gap-1">
              {examples.map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-center gap-2 text-xs text-blue-800"
                >
                  <span className="flex-1 truncate">{ex.filename}</span>
                  <span className="text-blue-400">
                    {new Date(ex.savedAt).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeExample(ex.id)}
                    className="text-blue-300 hover:text-red-500"
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
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-6 flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
            dragOver
              ? "border-blue-400 bg-blue-50"
              : "border-zinc-300 bg-white hover:border-blue-300 hover:bg-zinc-50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <svg
            width="40"
            height="40"
            viewBox="0 0 40 40"
            fill="none"
            className="mb-3 text-zinc-400"
          >
            <rect
              x="8"
              y="4"
              width="24"
              height="32"
              rx="3"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M14 14h12M14 19h12M14 24h8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M24 4v8h8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <p className="text-sm font-semibold text-zinc-600">
            Drop PDF files here or click to browse
          </p>
          <p className="text-xs text-zinc-400">
            Applied Control repair report PDFs
          </p>
        </button>

        {/* File list */}
        {entries.length > 0 && (
          <div className="mb-6 rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-700">
                Uploaded Files ({entries.length})
              </h2>
            </div>
            <div className="divide-y divide-zinc-100">
              {entries.map((entry) => (
                <div
                  key={entry.file.name}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-800">
                      {entry.file.name}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {(entry.file.size / 1024).toFixed(0)} KB
                    </p>
                    {entry.result?._warnings?.map((w) => (
                      <p key={w} className="mt-0.5 text-xs text-amber-600">
                        {w}
                      </p>
                    ))}
                  </div>
                  {(entry.status === "parsing" ||
                    entry.status === "enhancing") && (
                    <span className="text-xs font-medium text-blue-600 animate-pulse whitespace-nowrap">
                      {entry.statusMsg ??
                        (entry.status === "enhancing" ? "AI…" : "Parsing…")}
                    </span>
                  )}
                  {entry.status === "done" && (
                    <span className="text-xs font-medium text-emerald-600 whitespace-nowrap">
                      ✓ Done
                      {entry.result?._warnings?.some((w) =>
                        w.includes("AI filled"),
                      )
                        ? " + AI"
                        : ""}
                    </span>
                  )}
                  {entry.status === "error" && (
                    <span
                      className="text-xs font-medium text-red-600"
                      title={entry.error}
                    >
                      ✗ Error
                    </span>
                  )}
                  {entry.status === "pending" && (
                    <span className="text-xs text-zinc-400">Pending</span>
                  )}
                  {entry.status === "done" && (
                    <button
                      type="button"
                      onClick={() => saveExample(entry)}
                      title="Save as training example so AI learns from this report"
                      className="rounded border border-blue-200 px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50 whitespace-nowrap"
                    >
                      + Train AI
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.file)}
                    className="text-zinc-300 hover:text-red-500"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extracted data preview + edit */}
        {doneEntries.length > 0 && (
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-700">
                Extracted Data — review and correct before exporting
              </h2>
              <button
                type="button"
                onClick={() => {
                  exportIrisCsvFromParsed(mergedResults);
                  exportRecordsCsvFromParsed(mergedResults);
                  const label =
                    mergedResults.length === 1
                      ? mergedResults[0].tagOrUnit || "import"
                      : `${mergedResults.length} reports`;
                  setExportToast(`Downloaded 2 files for ${label}: assets CSV + records CSV`);
                  setTimeout(() => setExportToast(null), 4000);
                }}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
              >
                Export {mergedResults.length} to IRIS (2 CSVs)
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="text-xs" style={{ minWidth: "max-content" }}>
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="sticky left-0 z-10 bg-zinc-50 px-3 py-2 text-left font-semibold text-zinc-600 min-w-[160px] border-r border-zinc-200">
                      File
                    </th>
                    {CSV_COLS.map((col) => (
                      <th
                        key={col.header}
                        className="px-3 py-2 text-left font-semibold text-zinc-500 min-w-[140px] whitespace-nowrap"
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {doneEntries.map((e) => {
                    const merged = getMergedResult(e);
                    return (
                      <tr
                        key={e.file.name}
                        className="border-b border-zinc-100 hover:bg-zinc-50"
                      >
                        <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-zinc-700 border-r border-zinc-100 hover:bg-zinc-50 whitespace-nowrap">
                          {e.file.name.replace(/\.pdf$/i, "")}
                        </td>
                        {CSV_COLS.map((col) => {
                          const val = merged ? col.getValue(merged) : "";
                          return (
                            <td key={col.header} className="px-2 py-1">
                              <input
                                type="text"
                                value={val}
                                onChange={(ev) =>
                                  merged && applyEdit(e.file.name, col.onEdit(merged, ev.target.value))
                                }
                                className={`w-full rounded border px-2 py-1 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 ${
                                  val
                                    ? "border-zinc-200 text-zinc-800"
                                    : "border-zinc-100 text-zinc-300 placeholder:text-zinc-200"
                                }`}
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

            <p className="mt-2 text-xs text-zinc-400">
              Column headers match the IRIS CSV exactly. Click any cell to correct before exporting.
            </p>
          </div>
        )}

        {entries.length === 0 && (
          <div className="rounded-xl border border-zinc-100 bg-white p-8 text-center text-sm text-zinc-400">
            No PDFs uploaded yet. Drop files above to get started.
          </div>
        )}
      </main>
    </div>
  );
}
