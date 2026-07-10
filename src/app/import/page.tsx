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
  type IrisAssetType,
} from "@/lib/exports/iris";
import {
  addAIRule,
  type AIRule,
  fetchAIRules,
  removeAIRule,
  RULE_MIN_CHARS,
  ruleTextsForPrompt,
} from "@/lib/imports/aiRules";
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
  assetType: IrisAssetType;
}

export default function ImportPage() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [editing, setEditing] = useState<Record<string, Partial<ParsedPdfReport>>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const [pendingType, setPendingType] = useState<IrisAssetType | null>(null);

  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [useAi, setUseAi] = useState(true);
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [showExamples, setShowExamples] = useState(false);
  const [rules, setRules] = useState<AIRule[]>([]);
  const [rulesShared, setRulesShared] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [ruleDraft, setRuleDraft] = useState("");

  useEffect(() => {
    checkAiAvailable().then(setAiAvailable);
    setExamples(getTrainingExamples());
    fetchAIRules().then(({ rules: loadedRules, shared }) => {
      setRules(loadedRules);
      setRulesShared(shared);
      setShowRules(loadedRules.length > 0);
    });
  }, []);

  function addFiles(files: FileList | File[]) {
    if (!pendingType) return;
    const all = Array.from(files);
    const arr = all.filter((f) => f.type === "application/pdf");
    const rejected = all.length - arr.length;
    if (rejected > 0) toast(`${rejected} file${rejected > 1 ? "s" : ""} skipped — only PDFs are supported`, "error");
    if (!arr.length) return;
    setEntries((prev) => [
      ...prev,
      ...arr.map((f) => ({ file: f, status: "pending" as const, assetType: pendingType })),
    ]);
    arr.forEach(parseFile);
  }

  function setEntryAssetType(file: File, assetType: IrisAssetType) {
    setEntries((prev) => prev.map((e) => e.file === file ? { ...e, assetType } : e));
  }

  async function parseFile(file: File) {
    setEntries((prev) => prev.map((e) => e.file === file ? { ...e, status: "parsing", statusMsg: "Extracting fields…" } : e));
    try {
      let result = await parsePdfFile(file);
      if (useAi && aiAvailable) {
        setEntries((prev) => prev.map((e) => e.file === file ? { ...e, status: "enhancing", statusMsg: "AI filling missing fields…" } : e));
        result = await enhanceWithAi(result, (msg) => {
          setEntries((prev) => prev.map((e) => (e.file === file ? { ...e, statusMsg: msg } : e)));
        }, examples, ruleTextsForPrompt(rules));
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
    if (!merged?._rawText) {
      toast("Cannot train: no raw text extracted from this PDF", "error");
      return;
    }
    const fields = Object.fromEntries(
      Object.entries(merged).filter(([k, v]) => !k.startsWith("_") && typeof v === "string" && v.trim()),
    ) as Record<string, string>;
    const saved = saveTrainingExample({ filename: entry.file.name.replace(/\.pdf$/i, ""), rawText: merged._rawText!, fields });
    setExamples((prev) => [...prev, saved]);
    toast(`Training example saved — ${Object.keys(fields).length} fields`, "success");

    // E1: if the user corrected fields, pre-fill a rule suggestion in the chat log
    const edits = editing[entry.file.name];
    if (edits && entry.result) {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(edits)) {
        if (k.startsWith("_") || k === "observationsHtml" || typeof v !== "string") continue;
        const orig = (entry.result as unknown as Record<string, unknown>)[k];
        if (typeof orig === "string" && orig !== v && v.trim()) {
          parts.push(`the "${k}" field should be "${v}" (AI extracted "${orig || "nothing"}")`);
        }
        if (parts.length >= 2) break;
      }
      if (parts.length > 0) {
        setRuleDraft(`On reports like ${entry.file.name.replace(/\.pdf$/i, "")}, ${parts.join("; ")}. Rule: `);
        setShowRules(true);
        toast("Tip: turn that correction into a rule below so the AI stops making it", "info");
      }
    }
  }

  function removeExample(id: string) {
    deleteTrainingExample(id);
    setExamples((prev) => prev.filter((e) => e.id !== id));
  }

  async function addRule() {
    const result = await addAIRule(ruleDraft);
    if ("error" in result) {
      toast(result.error, "error");
      return;
    }
    setRulesShared(result.shared);
    setRules((prev) => prev.some((r) => r.id === result.rule.id) ? prev : [...prev, result.rule]);
    setRuleDraft("");
    toast(
      result.shared
        ? "Rule saved — shared with all users, applies to every AI extraction"
        : "Rule saved to this browser — applies to every AI extraction here",
      "success",
    );
  }

  async function removeRule(id: string) {
    const ok = await removeAIRule(id, rulesShared);
    if (!ok) {
      toast("Failed to delete rule — try again", "error");
      return;
    }
    setRules((prev) => prev.filter((r) => r.id !== id));
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

  // Group done entries by asset type for Assets CSV export
  const byType = doneEntries.reduce<Record<IrisAssetType, ParsedPdfReport[]>>(
    (acc, e) => {
      const r = getMergedResult(e);
      if (r) acc[e.assetType].push(r);
      return acc;
    },
    { "Control Valve": [], "Relief Valve": [], "Isolation Valve": [], "Motor Operated Valve": [], "Manual Valve": [], "Regulator": [], "Steam Trap": [], "General": [], "Machinery": [], "Measurement": [], "Tank": [] },
  );
  const typesPresent = (Object.keys(byType) as IrisAssetType[]).filter((t) => byType[t].length > 0);

  function exportLabel() {
    if (mergedResults.length === 1) return mergedResults[0].tagOrUnit || "import";
    return `${mergedResults.length} reports`;
  }

  function exportAllAssets() {
    for (const t of typesPresent) {
      exportIrisCsvFromParsed(byType[t], t);
    }
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
              Read all fields with AI
            </label>
          )}

          {aiAvailable === false && (
            <span className="text-xs" style={{ color: "var(--text-label)" }}>
              Add <code className="rounded px-1" style={{ background: "var(--bg-surface)" }}>GROQ_API_KEY</code>{" "}
              to your environment to enable AI field completion
            </span>
          )}

          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowRules((v) => !v)}
              className="text-xs hover:underline"
              style={{ color: "var(--accent)" }}
            >
              {rules.length > 0 ? `${rules.length} AI rule${rules.length !== 1 ? "s" : ""}` : "+ AI rules"} {showRules ? "▲" : "▼"}
            </button>
            {examples.length > 0 && (
              <button
                type="button"
                onClick={() => setShowExamples((v) => !v)}
                className="text-xs hover:underline"
                style={{ color: "var(--accent)" }}
              >
                {examples.length} training example{examples.length !== 1 ? "s" : ""} {showExamples ? "▲" : "▼"}
              </button>
            )}
          </div>
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

        {/* AI correction rules — chat log */}
        {showRules && (
          <div
            className="mb-4 rounded-xl border"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  AI Correction Rules
                </h2>
                <span
                  className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={
                    rulesShared
                      ? { background: "var(--color-success-bg)", borderColor: "var(--color-success-border)", color: "var(--color-success-text)" }
                      : { background: "var(--bg-surface)", borderColor: "var(--border-solid)", color: "var(--text-label)" }
                  }
                  title={
                    rulesShared
                      ? "Rules are stored in the cloud — every user sees and contributes to the same set"
                      : "Shared storage not configured — rules are saved in this browser only"
                  }
                >
                  {rulesShared ? "Shared with all users" : "This browser only"}
                </span>
              </div>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-label)" }}>
                Tell the AI what it keeps getting wrong. Each message becomes a rule applied to every extraction.
              </p>
            </div>

            {rules.length > 0 && (
              <div className="flex flex-col gap-2 px-4 py-3 max-h-64 overflow-y-auto">
                {rules.map((rule) => (
                  <div key={rule.id} className="flex items-start gap-2 group">
                    <div
                      className="flex-1 rounded-lg rounded-tl-sm border px-3 py-2 text-xs leading-relaxed"
                      style={{
                        background: "var(--bg-surface)",
                        borderColor: "var(--border)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {rule.text}
                      <span className="ml-2 text-[10px]" style={{ color: "var(--text-label)" }}>
                        {new Date(rule.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRule(rule.id)}
                      title="Delete rule"
                      className="mt-1.5 opacity-30 hover:opacity-100 hover:text-red-500 transition-opacity text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              className="flex items-end gap-2 px-4 py-3"
              style={{ borderTop: rules.length > 0 ? "1px solid var(--border)" : undefined }}
            >
              <textarea
                value={ruleDraft}
                onChange={(ev) => setRuleDraft(ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" && !ev.shiftKey) {
                    ev.preventDefault();
                    addRule();
                  }
                }}
                rows={2}
                placeholder='e.g. "Never include the manufacturer name in the valve model field"'
                className="flex-1 resize-none rounded-lg border px-3 py-2 text-xs outline-none"
                style={{
                  background: "var(--bg-input, var(--bg-surface))",
                  borderColor: "var(--border-solid)",
                  color: "var(--text-primary)",
                }}
                onFocus={(ev) => (ev.currentTarget.style.borderColor = "var(--accent)")}
                onBlur={(ev) => (ev.currentTarget.style.borderColor = "var(--border-solid)")}
              />
              <Button variant="secondary" size="sm" onClick={addRule} disabled={ruleDraft.trim().length < RULE_MIN_CHARS}>
                Add Rule
              </Button>
            </div>
          </div>
        )}

        {/* Step 1 — Asset type selector */}
        <div
          className="mb-4 rounded-xl border px-4 py-4"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        >
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-label)" }}>
            Step 1 — Select asset type
          </p>
          <p className="mb-3 text-xs" style={{ color: "var(--text-label)" }}>
            Each type uses a different IRIS column template. You can override per file below.
          </p>
          <div className="flex flex-wrap gap-2">
            {(["Control Valve", "Relief Valve", "Isolation Valve", "Motor Operated Valve", "Manual Valve", "Regulator", "Steam Trap", "General", "Machinery", "Measurement", "Tank"] as IrisAssetType[]).map((type) => {
              const active = pendingType === type;
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPendingType(type)}
                  className="rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  style={
                    active
                      ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
                      : { background: "var(--bg-surface)", borderColor: "var(--border-solid)", color: "var(--text-secondary)" }
                  }
                >
                  {type}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2 — Drop zone (locked until type selected) */}
        <button
          type="button"
          aria-disabled={!pendingType}
          aria-describedby={!pendingType ? "dropzone-hint" : undefined}
          onDragOver={(e) => { if (!pendingType) return; e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          onClick={() => pendingType && fileInputRef.current?.click()}
          className="mb-5 flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          style={{
            borderColor: !pendingType ? "var(--border)" : dragOver ? "var(--accent)" : "var(--border-solid)",
            background: !pendingType ? "var(--bg-surface)" : dragOver ? "rgba(37,99,235,0.05)" : "var(--bg-card)",
            cursor: pendingType ? "pointer" : "not-allowed",
            opacity: pendingType ? 1 : 0.5,
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
          <p id="dropzone-hint" className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            {pendingType ? `Drop ${pendingType} PDFs here or click to browse` : "Select an asset type above first"}
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
                  {/* Per-file asset type override */}
                  <select
                    value={entry.assetType}
                    onChange={(ev) => setEntryAssetType(entry.file, ev.target.value as IrisAssetType)}
                    className="rounded border px-1.5 py-0.5 text-xs shrink-0"
                    style={{ background: "var(--bg-surface)", borderColor: "var(--border-solid)", color: "var(--text-secondary)" }}
                  >
                    {(["Control Valve", "Relief Valve", "Isolation Valve", "Motor Operated Valve", "Manual Valve", "Regulator", "Steam Trap", "General", "Machinery", "Measurement", "Tank"] as IrisAssetType[]).map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
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
                      exportAllAssets();
                      const label = typesPresent.map((t) => ({ "Control Valve": "CV", "Relief Valve": "RV", "Isolation Valve": "IV", "Motor Operated Valve": "MOV", "Manual Valve": "MV", "Regulator": "Reg", "Steam Trap": "ST", "General": "Gen", "Machinery": "Mach", "Measurement": "Meas", "Tank": "Tank" } as Record<IrisAssetType, string>)[t] + " Assets").join(" + ");
                      toast(`Downloaded ${label} CSV for ${exportLabel()}`, "success");
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
                      exportAllAssets();
                      exportRecordsCsvFromParsed(mergedResults);
                      const label = typesPresent.map((t) => ({ "Control Valve": "CV", "Relief Valve": "RV", "Isolation Valve": "IV", "Motor Operated Valve": "MOV", "Manual Valve": "MV", "Regulator": "Reg", "Steam Trap": "ST", "General": "Gen", "Machinery": "Mach", "Measurement": "Meas", "Tank": "Tank" } as Record<IrisAssetType, string>)[t] + " Assets").join(" + ");
                      toast(`Downloaded ${label} + Records CSV for ${exportLabel()}`, "success");
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

            {/* Records CSV — editable */}
            <div className="mb-5">
              <div className="mb-3">
                <h2 className="label-sm">Records CSV — review and correct before exporting</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-label)" }}>
                  One Preventative record per report. Edit any cell — corrections are included when you click + Train AI.
                </p>
              </div>
              <div
                className="overflow-x-auto rounded-xl border"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
              >
                <table className="text-xs" style={{ minWidth: "max-content" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-surface)" }}>
                      {[
                        { label: "Assets", sticky: true },
                        { label: "Type" },
                        { label: "Status" },
                        { label: "Description", wide: true },
                        { label: "Occurrence date" },
                        { label: "WO/MOC ref." },
                        { label: "Customer contact" },
                        { label: "Observations", wide: true },
                      ].map(({ label, sticky, wide }, i) => (
                        <th
                          key={label}
                          className={`px-3 py-2 text-left font-semibold whitespace-nowrap${sticky ? " sticky left-0 z-10 min-w-[120px] border-r" : ""}${wide ? " min-w-[180px]" : ""}`}
                          style={{
                            background: "var(--bg-surface)",
                            borderColor: "var(--border)",
                            color: i === 0 ? "var(--text-secondary)" : "var(--text-label)",
                          }}
                        >
                          {label}
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

                      function recCell(value: string, field: keyof ParsedPdfReport, placeholder = "—") {
                        return (
                          <td key={field} className="px-2 py-1 min-w-[140px]">
                            <input
                              type="text"
                              value={value}
                              onChange={(ev) => applyEdit(e.file.name, { [field]: ev.target.value })}
                              className="w-full rounded-lg border px-2 py-1 text-xs outline-none"
                              style={{
                                background: "var(--bg-input, var(--bg-surface))",
                                borderColor: value ? "var(--border-solid)" : "var(--border)",
                                color: value ? "var(--text-primary)" : "var(--text-label)",
                              }}
                              onFocus={(ev) => (ev.currentTarget.style.borderColor = "var(--accent)")}
                              onBlur={(ev) => (ev.currentTarget.style.borderColor = value ? "var(--border-solid)" : "var(--border)")}
                              placeholder={placeholder}
                            />
                          </td>
                        );
                      }

                      return (
                        <tr key={e.file.name} style={{ borderTop: rowIdx > 0 ? "1px solid var(--border)" : undefined }}>
                          {/* Assets — sticky tag cell */}
                          <td className="sticky left-0 z-10 px-2 py-1 border-r min-w-[140px]" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                            <input
                              type="text"
                              value={r.tagOrUnit}
                              onChange={(ev) => applyEdit(e.file.name, { tagOrUnit: ev.target.value })}
                              className="w-full rounded-lg border px-2 py-1 text-xs outline-none font-medium"
                              style={{
                                background: "var(--bg-input, var(--bg-surface))",
                                borderColor: r.tagOrUnit ? "var(--border-solid)" : "var(--border)",
                                color: r.tagOrUnit ? "var(--text-primary)" : "var(--text-label)",
                              }}
                              onFocus={(ev) => (ev.currentTarget.style.borderColor = "var(--accent)")}
                              onBlur={(ev) => (ev.currentTarget.style.borderColor = r.tagOrUnit ? "var(--border-solid)" : "var(--border)")}
                              placeholder="—"
                            />
                          </td>
                          {/* Type / Status — fixed */}
                          <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-label)" }}>Preventative</td>
                          <td className="px-3 py-1.5 whitespace-nowrap" style={{ color: "var(--text-label)" }}>Identified</td>
                          {/* Editable record fields */}
                          {recCell(r.scopeOfWork, "scopeOfWork", "Description")}
                          {recCell(r.repairDate, "repairDate", "YYYY-MM-DD")}
                          {recCell(woRef ? r.emrReference : "", "emrReference", "WO ref.")}
                          {recCell(r.technician, "technician", "Technician")}
                          {/* Observations — contenteditable */}
                          <td className="px-2 py-1 min-w-[300px] max-w-sm align-top">
                            <div
                              key={`obs-${e.file.name}`}
                              contentEditable
                              suppressContentEditableWarning
                              className="w-full rounded-lg border px-2 py-1.5 text-[10px] outline-none min-h-[40px] [&_strong]:font-semibold [&_p]:leading-snug [&_p]:my-0"
                              style={{
                                background: "var(--bg-input, var(--bg-surface))",
                                borderColor: obs ? "var(--border-solid)" : "var(--border)",
                                color: obs ? "var(--text-secondary)" : "var(--text-label)",
                                whiteSpace: "normal",
                              }}
                              // eslint-disable-next-line react/no-danger
                              dangerouslySetInnerHTML={{ __html: obs || '<p style="opacity:0.4">Click to edit observations…</p>' }}
                              onFocus={(ev) => {
                                ev.currentTarget.style.borderColor = "var(--accent)";
                                if (!obs) ev.currentTarget.innerHTML = "";
                              }}
                              onBlur={(ev) => {
                                const html = ev.currentTarget.innerHTML.trim();
                                ev.currentTarget.style.borderColor = html ? "var(--border-solid)" : "var(--border)";
                                applyEdit(e.file.name, { observationsHtml: html || undefined });
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs" style={{ color: "var(--text-label)" }}>
                Observations are auto-built from scope + calibration data. Click the cell to edit — changes are included when you click + Train AI.
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
