"use client";

import { useRef, useState } from "react";
import Header from "@/components/Header";
import { parsePdfFile, ParsedPdfReport } from "@/lib/imports/pdfParser";
import { exportIrisCsvFromParsed } from "@/lib/exports/iris";

// ── Field definitions for the preview table ───────────────────────────────────
const PREVIEW_FIELDS: { key: keyof ParsedPdfReport; label: string }[] = [
  { key: "tagOrUnit",              label: "Tag / Unit" },
  { key: "customer",               label: "Customer" },
  { key: "siteTitle",              label: "Site" },
  { key: "repairDate",             label: "Date" },
  { key: "technician",             label: "Technician" },
  { key: "process",                label: "Process" },
  { key: "emrReference",           label: "EMR Ref." },
  { key: "crmodReference",         label: "CRMoD Ref." },
  { key: "valveMake",              label: "Valve Make" },
  { key: "valveSerialNumber",      label: "Valve S/N" },
  { key: "valveModelSize",         label: "Valve Model/Size" },
  { key: "valveClassConnection",   label: "Class/Conn." },
  { key: "valveFlowDirection",     label: "Flow Dir." },
  { key: "valvePackingConfiguration", label: "Packing" },
  { key: "valveTrimCharPort",      label: "Trim/Port" },
  { key: "actuatorMake",           label: "Actuator Make" },
  { key: "actuatorSerialNumber",   label: "Actuator S/N" },
  { key: "actuatorModelSize",      label: "Act. Model/Size" },
  { key: "positionerMake",         label: "Positioner Make" },
  { key: "positionerSerialNumber", label: "Positioner S/N" },
  { key: "positionerModelAction",  label: "Pos. Model/Action" },
  { key: "ratedTravel",            label: "Rated Travel" },
  { key: "benchSetAsLeft",         label: "Bench Set (AL)" },
  { key: "openSignalAsLeft",       label: "Signal Open (AL)" },
  { key: "closedSignalAsLeft",     label: "Signal Closed (AL)" },
  { key: "supplyPressureAsLeft",   label: "Supply Press. (AL)" },
  { key: "failActionAsLeft",       label: "Fail Action (AL)" },
  { key: "actuatorAirAction",      label: "Actuator Air (AL)" },
  { key: "seatLeakClass",          label: "Seat Leak Class" },
];

interface FileEntry {
  file: File;
  status: "pending" | "parsing" | "done" | "error";
  error?: string;
  result?: ParsedPdfReport;
}

export default function ImportPage() {
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [editing, setEditing] = useState<Record<string, Partial<ParsedPdfReport>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

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
      prev.map((e) => e.file === file ? { ...e, status: "parsing" } : e)
    );
    try {
      const result = await parsePdfFile(file);
      setEntries((prev) =>
        prev.map((e) => e.file === file ? { ...e, status: "done", result } : e)
      );
    } catch (err) {
      setEntries((prev) =>
        prev.map((e) =>
          e.file === file
            ? { ...e, status: "error", error: String(err) }
            : e
        )
      );
    }
  }

  function removeEntry(file: File) {
    setEntries((prev) => prev.filter((e) => e.file !== file));
  }

  function updateField(filename: string, key: keyof ParsedPdfReport, value: string) {
    setEditing((prev) => ({
      ...prev,
      [filename]: { ...(prev[filename] ?? {}), [key]: value },
    }));
  }

  function getMergedResult(entry: FileEntry): ParsedPdfReport | undefined {
    if (!entry.result) return undefined;
    return { ...entry.result, ...(editing[entry.file.name] ?? {}) };
  }

  const doneEntries = entries.filter((e) => e.status === "done");
  const mergedResults = doneEntries.map((e) => getMergedResult(e)!).filter(Boolean);

  return (
    <div className="min-h-screen bg-zinc-50">
      <Header />
      <main className="mx-auto max-w-5xl px-3 py-4 sm:px-6 sm:py-6">

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-zinc-900">PDF → IRIS Import</h1>
          <p className="text-sm text-zinc-500">
            Upload Applied Control repair report PDFs to extract field data and export as IRIS CSV.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            addFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`mb-6 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
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
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="mb-3 text-zinc-400">
            <rect x="8" y="4" width="24" height="32" rx="3" stroke="currentColor" strokeWidth="2"/>
            <path d="M14 14h12M14 19h12M14 24h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M24 4v8h8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
          </svg>
          <p className="text-sm font-semibold text-zinc-600">Drop PDF files here or click to browse</p>
          <p className="text-xs text-zinc-400">Applied Control repair report PDFs</p>
        </div>

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
                <div key={entry.file.name} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-800">{entry.file.name}</p>
                    <p className="text-xs text-zinc-400">
                      {(entry.file.size / 1024).toFixed(0)} KB
                    </p>
                    {entry.result?._warnings?.map((w, i) => (
                      <p key={i} className="mt-0.5 text-xs text-amber-600">{w}</p>
                    ))}
                  </div>
                  {entry.status === "parsing" && (
                    <span className="text-xs font-medium text-blue-600 animate-pulse">Parsing…</span>
                  )}
                  {entry.status === "done" && (
                    <span className="text-xs font-medium text-emerald-600">
                      ✓ Extracted
                      {entry.result?._passCount && entry.result._passCount > 1
                        ? ` (${entry.result._passCount} passes)`
                        : ""}
                    </span>
                  )}
                  {entry.status === "error" && (
                    <span className="text-xs font-medium text-red-600" title={entry.error}>
                      ✗ Error
                    </span>
                  )}
                  {entry.status === "pending" && (
                    <span className="text-xs text-zinc-400">Pending</span>
                  )}
                  <button
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
                onClick={() => exportIrisCsvFromParsed(mergedResults)}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
              >
                Export {mergedResults.length} to IRIS CSV
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="sticky left-0 bg-zinc-50 px-3 py-2 text-left font-semibold text-zinc-600 min-w-[140px]">
                      Field
                    </th>
                    {doneEntries.map((e) => (
                      <th
                        key={e.file.name}
                        className="px-3 py-2 text-left font-semibold text-zinc-600 min-w-[160px]"
                      >
                        {e.file.name.replace(/\.pdf$/i, "")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PREVIEW_FIELDS.map(({ key, label }) => (
                    <tr key={key} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="sticky left-0 bg-white px-3 py-1.5 font-medium text-zinc-500 hover:bg-zinc-50">
                        {label}
                      </td>
                      {doneEntries.map((e) => {
                        const merged = getMergedResult(e);
                        const val = merged?.[key] ?? "";
                        return (
                          <td key={e.file.name} className="px-2 py-1">
                            <input
                              type="text"
                              value={String(val)}
                              onChange={(ev) =>
                                updateField(e.file.name, key, ev.target.value)
                              }
                              className={`w-full rounded border px-2 py-1 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 ${
                                val
                                  ? "border-zinc-200 text-zinc-800"
                                  : "border-zinc-100 text-zinc-300 placeholder:text-zinc-200"
                              }`}
                              placeholder="not found"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-xs text-zinc-400">
              Click any cell to edit extracted values before exporting. Empty fields were not found in the PDF.
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
