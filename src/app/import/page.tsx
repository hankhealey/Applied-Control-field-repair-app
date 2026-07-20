"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import {
  buildObservationsHtml,
  exportIrisCsvFromParsed,
  exportRecordsCsvFromParsed,
  irisColumnsFor,
  irisPreviewRow,
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
  RULE_SCOPES,
  type RuleScope,
  rulesForType,
  ruleTextsForPrompt,
} from "@/lib/imports/aiRules";
import { applyEditPatch, type EditPatch } from "@/lib/imports/editOverrides";
import { checkAiAvailable, enhanceWithAi, generateObservationsHtml } from "@/lib/imports/ollamaParser";
import { isRateLimit, type ParsedPdfReport, parsePdfFile } from "@/lib/imports/pdfParser";
import { DEFAULT_TPM_LIMIT, estimateRequestTokens, groqBudget } from "@/lib/imports/tokenBudget";
import { blankFieldsForRules, enforceBlankFields } from "@/lib/imports/ruleActions";
import {
  deleteTrainingExample,
  getTrainingExamples,
  pickExamplesForType,
  retagUntypedExamples,
  saveTrainingExample,
  type TrainingExample,
  updateTrainingExampleType,
} from "@/lib/imports/trainingExamples";

type CsvCol = {
  header: string;
  /** r is the merged result; p is the raw edit patch (split-cell overrides live there). */
  getValue: (r: ParsedPdfReport, p: EditPatch) => string;
  onEdit: (current: ParsedPdfReport, p: EditPatch, v: string) => EditPatch;
};

// Split cells (model/size, bench set) write _-prefixed overrides instead of
// re-joining the combined field per keystroke — the join happens once in
// applyEditPatch. On first edit the sibling half is snapshotted so later
// keystrokes are plain text edits with no feedback loop.
const CSV_COLS: CsvCol[] = [
  { header: "Tag",                              getValue: r => r.tagOrUnit,                                    onEdit: (_, _p, v) => ({ tagOrUnit: v }) },
  { header: "Service description",              getValue: r => r.scopeOfWork,                                  onEdit: (_, _p, v) => ({ scopeOfWork: v }) },
  { header: "P & ID no.",                       getValue: r => r.emrReference,                                 onEdit: (_, _p, v) => ({ emrReference: v }) },
  { header: "Datasheet no.",                    getValue: r => r.crmodReference,                               onEdit: (_, _p, v) => ({ crmodReference: v }) },
  { header: "Valve manufacturer",               getValue: r => r.valveMake,                                    onEdit: (_, _p, v) => ({ valveMake: v }) },
  { header: "Valve model",                      getValue: (r, p) => p._valveModel ?? splitModelSize(r.valveModelSize).model,       onEdit: (r, p, v) => ({ _valveModel: v, _valveSize: p._valveSize ?? splitModelSize(r.valveModelSize).size }) },
  { header: "Valve serial number",              getValue: r => r.valveSerialNumber,                            onEdit: (_, _p, v) => ({ valveSerialNumber: v }) },
  { header: "Valve size",                       getValue: (r, p) => p._valveSize ?? splitModelSize(r.valveModelSize).size,         onEdit: (r, p, v) => ({ _valveSize: v, _valveModel: p._valveModel ?? splitModelSize(r.valveModelSize).model }) },
  { header: "Valve pressure class",             getValue: r => r.valveClassConnection,                         onEdit: (_, _p, v) => ({ valveClassConnection: v }) },
  { header: "Valve rated travel",               getValue: r => r.ratedTravel,                                  onEdit: (_, _p, v) => ({ ratedTravel: v }) },
  { header: "Valve leak class",                 getValue: r => r.seatLeakClass,                                onEdit: (_, _p, v) => ({ seatLeakClass: v }) },
  { header: "Valve trim style/number",          getValue: r => r.valveTrimCharPort,                            onEdit: (_, _p, v) => ({ valveTrimCharPort: v }) },
  { header: "Valve packing type/material",      getValue: r => r.valvePackingConfiguration,                    onEdit: (_, _p, v) => ({ valvePackingConfiguration: v }) },
  { header: "Valve flow direction",             getValue: r => r.valveFlowDirection,                           onEdit: (_, _p, v) => ({ valveFlowDirection: v }) },
  { header: "Actuator manufacturer",            getValue: r => r.actuatorMake,                                 onEdit: (_, _p, v) => ({ actuatorMake: v }) },
  { header: "Actuator model",                   getValue: (r, p) => p._actuatorModel ?? splitModelSize(r.actuatorModelSize).model, onEdit: (r, p, v) => ({ _actuatorModel: v, _actuatorSize: p._actuatorSize ?? splitModelSize(r.actuatorModelSize).size }) },
  { header: "Actuator size",                    getValue: (r, p) => p._actuatorSize ?? splitModelSize(r.actuatorModelSize).size,   onEdit: (r, p, v) => ({ _actuatorSize: v, _actuatorModel: p._actuatorModel ?? splitModelSize(r.actuatorModelSize).model }) },
  { header: "Actuator serial number",           getValue: r => r.actuatorSerialNumber,                         onEdit: (_, _p, v) => ({ actuatorSerialNumber: v }) },
  { header: "Actuator lower bench set",         getValue: (r, p) => p._benchLow ?? splitBenchSet(r.benchSetAsLeft)[0],             onEdit: (r, p, v) => ({ _benchLow: v, _benchHigh: p._benchHigh ?? splitBenchSet(r.benchSetAsLeft)[1] }) },
  { header: "Actuator upper bench set",         getValue: (r, p) => p._benchHigh ?? splitBenchSet(r.benchSetAsLeft)[1],            onEdit: (r, p, v) => ({ _benchHigh: v, _benchLow: p._benchLow ?? splitBenchSet(r.benchSetAsLeft)[0] }) },
  { header: "Actuator nominal supply pressure", getValue: r => r.supplyPressureAsLeft,                         onEdit: (_, _p, v) => ({ supplyPressureAsLeft: v }) },
  { header: "Actuator fail action",             getValue: r => r.failActionAsLeft,                             onEdit: (_, _p, v) => ({ failActionAsLeft: v }) },
  { header: "Actuator air",                     getValue: r => r.actuatorAirAction,                            onEdit: (_, _p, v) => ({ actuatorAirAction: v }) },
  { header: "Device 1 Manufacturer",            getValue: r => r.positionerMake,                               onEdit: (_, _p, v) => ({ positionerMake: v }) },
  { header: "Device 1 Model number",            getValue: r => r.positionerModelAction,                        onEdit: (_, _p, v) => ({ positionerModelAction: v }) },
  { header: "Device 1 Serial number",           getValue: r => r.positionerSerialNumber,                       onEdit: (_, _p, v) => ({ positionerSerialNumber: v }) },
];

interface FileEntry {
  /**
   * Stable unique id. Filenames are NOT unique — the same report can be added
   * twice — and every per-file map here (edits, extra columns, busy flags) is
   * keyed by it, so a filename key made two entries share one edit overlay.
   */
  id: string;
  file: File;
  status: "pending" | "parsing" | "enhancing" | "done" | "error";
  statusMsg?: string;
  error?: string;
  result?: ParsedPdfReport;
  assetType: IrisAssetType;
  /** What training was sent with the last AI enhancement of this file. */
  training?: { examples: number; rules: number };
  /**
   * Rate-limit retries already spent on this file. A 429 means the AI never
   * saw the document, so the file is silently regex-only — retrying is what
   * the user would do by hand anyway, and doing it by hand starts every retry
   * at once. Capped so a genuinely exhausted quota can't loop forever.
   */
  rateLimitRetries?: number;
}

/** How many times a rate-limited file re-queues itself before giving up. */
const MAX_RATE_LIMIT_RETRIES = 2;

/** The 11 IRIS asset types, derived from RULE_SCOPES (minus "All"). */
const ASSET_TYPES = RULE_SCOPES.filter((s): s is IrisAssetType => s !== "All");

export default function ImportPage() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [editing, setEditing] = useState<Record<string, EditPatch>>({});
  // Hand-entered values for IRIS columns not backed by a structured field,
  // keyed by filename → column header. Overlaid onto the CSV export.
  const [extraColumns, setExtraColumns] = useState<Record<string, Record<string, string>>>({});
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [obsBusy, setObsBusy] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Serialises ALL parsing, across separate addFiles calls. */
  const parseQueue = useRef<Promise<void>>(Promise.resolve());
  /**
   * Live mirror of `entries`. Queued work runs inside a closure captured when
   * the file was added, so reading `entries` there returns a stale snapshot —
   * and a retry counter read from a stale snapshot never increments, which
   * would turn "retry twice" into an infinite loop.
   */
  const entriesRef = useRef<FileEntry[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const [pendingType, setPendingType] = useState<IrisAssetType | null>(null);

  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [useAi, setUseAi] = useState(true);
  // On by default for the free Groq tier (6k tokens/min). Turn it off after
  // upgrading — the Developer tier's 250k/min makes the wait always zero.
  const [throttle, setThrottle] = useState(true);
  const [examples, setExamples] = useState<TrainingExample[]>([]);
  const [showExamples, setShowExamples] = useState(false);
  const [rules, setRules] = useState<AIRule[]>([]);
  const [rulesShared, setRulesShared] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [ruleDraft, setRuleDraft] = useState("");
  const [ruleScope, setRuleScope] = useState<RuleScope>("All");
  const [rulesFilter, setRulesFilter] = useState<RuleScope | "Everything">("Everything");
  const [untypedTag, setUntypedTag] = useState<IrisAssetType>("Control Valve");

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    checkAiAvailable().then(setAiAvailable);
    setExamples(getTrainingExamples());
    try {
      const saved = localStorage.getItem("import-throttle");
      if (saved !== null) setThrottle(saved === "1");
    } catch {
      // storage unavailable — keep the safe default (throttle on)
    }
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
    const added: FileEntry[] = arr.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      status: "pending" as const,
      assetType: pendingType,
    }));
    setEntries((prev) => [...prev, ...added]);
    // Parse one at a time. These PDFs run 10-15 MB and pdf.js holds a whole
    // document in memory while reading it; three at once was enough to kill
    // the tab. Sequential also spaces out the Groq calls, which the 6k
    // tokens/min ceiling needs anyway.
    //
    // Chain onto ONE queue rather than starting a loop per call: dropping
    // files in one at a time used to spawn a second concurrent loop, which
    // reintroduced the parallel-parse crash and let two files race the token
    // budget (both saw it as free, both fired, both 429'd).
    for (const e of added) enqueue(e.id, e.file, e.assetType);
  }

  function setEntryAssetType(id: string, assetType: IrisAssetType) {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, assetType } : e));
  }

  async function parseFile(id: string, file: File, assetType: IrisAssetType) {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, status: "parsing", statusMsg: "Extracting fields…", training: undefined } : e));
    /** Set once the budget is reserved, so a failed send can hand it back. */
    let reservation: { tokens: number; at: number } | null = null;
    try {
      let result = await parsePdfFile(file);
      // Type-scoped training: rules for this type or "All"
      const scopedRules = rulesForType(rules, assetType);
      if (useAi && aiAvailable) {
        const chosenExamples = pickExamplesForType(examples, assetType);
        const training = { examples: chosenExamples.length, rules: scopedRules.length };
        const setMsg = (msg: string) =>
          setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, statusMsg: msg } : e)));
        setEntries((prev) => prev.map((e) => e.id === id ? { ...e, status: "enhancing", statusMsg: "AI filling missing fields…", training } : e));

        // Pace against the per-minute token ceiling instead of failing into it.
        // One report costs ~4.3k of a 6k/min free-tier budget, so file 2 in the
        // same minute always 429s unless it waits its turn.
        if (throttle) {
          const est = estimateRequestTokens({
            rawTextChars: result._rawText?.length ?? 0,
            exampleChars: chosenExamples.reduce(
              (n, ex) => n + Math.min(ex.rawText.length, 900) + JSON.stringify(ex.fields).length,
              0,
            ),
            ruleChars: scopedRules.reduce((n, r) => n + Math.min(r.text.length, 300), 0),
            withObservations: true,
          });
          const wait = groqBudget.waitFor(est);
          // waitFor never returns negative now — an oversized request waits for
          // a clear window rather than being sent immediately into a full one.
          const goAt = Date.now() + wait;
          // Reserve at the moment the request will actually go, BEFORE waiting.
          // Recording afterwards left the budget looking free for the whole
          // wait, so anything starting meanwhile computed a wrong (too short)
          // timer and fired into the ceiling.
          groqBudget.record(est, goAt);
          reservation = { tokens: est, at: goAt };
          if (wait > 0) {
            while (Date.now() < goAt) {
              setMsg(
                `Waiting ${Math.ceil((goAt - Date.now()) / 1000)}s — this file needs ~${est.toLocaleString()} of the ${DEFAULT_TPM_LIMIT.toLocaleString()} tokens/min budget`,
              );
              await new Promise((r) => setTimeout(r, 1000));
            }
            setMsg("AI filling missing fields…");
          }
        }

        result = await enhanceWithAi(result, setMsg, chosenExamples, ruleTextsForPrompt(scopedRules));

        // The request never reached Groq (network, timeout, bad key), so the
        // tokens we booked were never spent. Hand them back — otherwise every
        // file behind this one waits for capacity nothing consumed. A 429 is
        // deliberately excluded: Groq saw that request and counted it.
        if (reservation && result._aiError && !isRateLimit(result._aiError)) {
          groqBudget.release(reservation.tokens, reservation.at);
        }
      }
      // Deterministic enforcement: "leave X blank" rules clear fields the AI
      // and regex parser can't un-fill (empty AI answers never overwrite)
      result = enforceBlankFields(result, blankFieldsForRules(scopedRules.map((r) => r.text)));
      setEntries((prev) => prev.map((e) => e.id === id ? { ...e, status: "done", result, statusMsg: undefined } : e));

      // A rate limit means the AI never read the document — the file looks done
      // but its rules and training never applied. Re-queue it instead of
      // leaving the user to click Retry AI on each one, which is what caused
      // the pile-up in the first place: hand-retries all start at once.
      if (result._aiError && isRateLimit(result._aiError)) {
        const spent = entriesRef.current.find((e) => e.id === id)?.rateLimitRetries ?? 0;
        if (spent < MAX_RATE_LIMIT_RETRIES) {
          setEntries((prev) =>
            prev.map((e) =>
              e.id === id
                ? { ...e, status: "pending", statusMsg: `Rate limited — retrying automatically (${spent + 1}/${MAX_RATE_LIMIT_RETRIES})`, rateLimitRetries: spent + 1 }
                : e,
            ),
          );
          enqueue(id, file, assetType);
          return;
        }
        toast(
          `${file.name}: still rate limited after ${MAX_RATE_LIMIT_RETRIES} retries — wait a minute, then hit Retry AI`,
          "warning",
        );
        return;
      }

      // A silent AI failure looks exactly like a successful regex-only run, so
      // say it out loud — the user's rules did not reach the model.
      if (result._aiError) {
        toast(`${file.name}: ${result._aiError}`, "error");
      }
    } catch (err) {
      if (reservation) groqBudget.release(reservation.tokens, reservation.at);
      setEntries((prev) => prev.map((e) => e.id === id ? { ...e, status: "error", error: String(err), statusMsg: undefined } : e));
    }
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  /** Chain onto the ONE queue, so nothing ever parses in parallel. */
  function enqueue(id: string, file: File, assetType: IrisAssetType) {
    parseQueue.current = parseQueue.current
      .then(() => parseFile(id, file, assetType))
      .catch(() => {
        // one file's failure must not break the queue for the next
      });
  }

  /**
   * Re-run extraction with the current rules. Clears this file's manual edits
   * first: the edit overlay is applied ON TOP of the result, so a stale edit
   * silently beats whatever the rule just fixed and the row looks unchanged.
   */
  function reExtract(entry: FileEntry) {
    const hadEdits = Object.keys(editing[entry.id] ?? {}).length > 0;
    setEditing((prev) => {
      const next = { ...prev };
      delete next[entry.id];
      return next;
    });
    // Must go through the queue. Calling parseFile directly meant every click
    // started at once: after a rate-limited batch you retry each file by hand,
    // they all fire together, and they all get rate limited again — the exact
    // loop the queue exists to prevent.
    setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, status: "pending", statusMsg: "Queued…" } : e));
    enqueue(entry.id, entry.file, entry.assetType);
    if (hadEdits) toast("Manual edits cleared so the rules can take effect", "info");
  }

  function saveExample(entry: FileEntry) {
    const merged = getMergedResult(entry);
    if (!merged?._rawText) {
      toast("Cannot train: no raw text extracted from this PDF", "error");
      return;
    }
    // Save ONLY fields you actually touched.
    //
    // This used to save every non-empty field on screen, which meant unverified
    // AI guesses were stored as ground truth and fed back into the next
    // extraction as "here is how to read this correctly". Measured on a real
    // report: 20/21 fields correct with the AI alone, 12/21 after training on
    // its own output. The loop was teaching the model its own mistakes.
    //
    // An edited field is one you looked at and corrected, which is the only
    // signal here that a value is right. Everything else is the machine's guess
    // about itself.
    const original = entry.result;
    const fields = Object.fromEntries(
      Object.entries(merged).filter(([k, v]) => {
        if (k.startsWith("_") || k === "observationsHtml") return false;
        if (typeof v !== "string" || !v.trim()) return false;
        const before = (original as unknown as Record<string, unknown>)?.[k];
        return typeof before === "string" && before !== v;
      }),
    ) as Record<string, string>;

    if (Object.keys(fields).length === 0) {
      toast(
        "Nothing to train on — correct a cell first. Saving unedited values teaches the AI its own guesses.",
        "warning",
      );
      return;
    }

    const saved = saveTrainingExample({
      filename: entry.file.name.replace(/\.pdf$/i, ""),
      rawText: merged._rawText!,
      fields,
      assetType: entry.assetType,
    });
    setExamples((prev) => [...prev, saved]);

    toast(
      `${entry.assetType} example saved — ${Object.keys(fields).length} corrected field${Object.keys(fields).length !== 1 ? "s" : ""}`,
      "success",
    );

    // Offer a rule for anything the user corrected. Reuses `original` above —
    // `fields` is already exactly the set of corrections, so this just phrases
    // the first couple of them.
    if (original) {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(merged)) {
        if (k.startsWith("_") || k === "observationsHtml") continue;
        if (typeof v !== "string" || !v.trim()) continue;
        const orig = (original as unknown as Record<string, unknown>)[k];
        if (typeof orig !== "string" || orig === v) continue; // not a correction
        parts.push(`the "${k}" field should be "${v}" (extracted "${orig || "nothing"}")`);
        if (parts.length >= 2) break;
      }
      if (parts.length > 0) {
        setRuleDraft(`On reports like ${entry.file.name.replace(/\.pdf$/i, "")}, ${parts.join("; ")}. Rule: `);
        setRuleScope(entry.assetType);
        setShowRules(true);
        toast("Tip: turn that correction into a rule so the AI stops making it", "info");
      }
    }
  }

  function removeExample(id: string) {
    deleteTrainingExample(id);
    setExamples((prev) => prev.filter((e) => e.id !== id));
  }

  async function addRule() {
    const result = await addAIRule(ruleDraft, ruleScope);
    if ("error" in result) {
      toast(result.error, "error");
      return;
    }
    setRulesShared(result.shared);
    setRules((prev) => prev.some((r) => r.id === result.rule.id) ? prev : [...prev, result.rule]);
    setRuleDraft("");
    const scopeLabel = ruleScope === "All" ? "all asset types" : `${ruleScope} extractions`;
    toast(
      result.shared
        ? `Rule saved for ${scopeLabel} — shared with all users`
        : `Rule saved for ${scopeLabel} — this browser only`,
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

  function applyEdit(filename: string, patch: EditPatch) {
    setEditing((prev) => ({ ...prev, [filename]: { ...(prev[filename] ?? {}), ...patch } }));
  }

  function applyExtraEdit(filename: string, header: string, value: string) {
    setExtraColumns((prev) => ({ ...prev, [filename]: { ...(prev[filename] ?? {}), [header]: value } }));
  }

  /**
   * Generate AI observations prose for one report, on demand. This used to run
   * automatically for every file and was the single biggest source of rate
   * limiting (it targets the 70b prose model, ~6k tokens/min free tier).
   */
  async function generateObservations(entry: FileEntry) {
    const merged = getMergedResult(entry);
    if (!merged?._rawText) {
      toast("No raw text available for this PDF", "error");
      return;
    }
    setObsBusy((prev) => ({ ...prev, [entry.id]: true }));
    try {
      const html = await generateObservationsHtml(merged._rawText);
      if (html) {
        applyEdit(entry.id, { observationsHtml: html });
        toast(`Observations generated for ${merged.tagOrUnit || entry.file.name}`, "success");
      } else {
        toast("Observations unavailable — likely rate limited, wait ~60s and retry", "warning");
      }
    } finally {
      setObsBusy((prev) => ({ ...prev, [entry.id]: false }));
    }
  }

  function getMergedResult(entry: FileEntry): ParsedPdfReport | undefined {
    if (!entry.result) return undefined;
    return applyEditPatch(entry.result, editing[entry.id] ?? {});
  }

  const doneEntries = entries.filter((e) => e.status === "done");
  const mergedResults = doneEntries.map((e) => getMergedResult(e)).filter((r): r is ParsedPdfReport => r !== undefined);

  // Asset types present, in first-seen order, for grouped Assets CSV export
  const typesPresent = doneEntries.reduce<IrisAssetType[]>((acc, e) => {
    if (!acc.includes(e.assetType)) acc.push(e.assetType);
    return acc;
  }, []);

  // The table renders one column set; use the first done entry's type as its
  // template (batches are almost always a single asset type).
  const tableType: IrisAssetType = doneEntries[0]?.assetType ?? "Control Valve";
  const allColumnLabels = irisColumnsFor(tableType);
  const mappedByHeader = new Map(CSV_COLS.map((c) => [c.header, c]));
  const displayColumns: Array<{ label: string; col?: CsvCol }> = showAllColumns
    ? allColumnLabels.map((label) => ({ label, col: mappedByHeader.get(label) }))
    : CSV_COLS.map((c) => ({ label: c.header, col: c }));

  // Fields we extract that this asset type's IRIS template has no column for.
  // Only Control Valve / Isolation Valve / MOV carry the Device 1 block; the
  // other eight templates have none, so a positioner serial read off the PDF
  // has nowhere to go and vanishes at export. Say so rather than dropping it
  // silently — the column simply not being there reads as a bug.
  const unmappableCols = CSV_COLS.map((c) => c.header).filter(
    (h) => !allColumnLabels.includes(h),
  );

  function exportLabel() {
    if (mergedResults.length === 1) return mergedResults[0].tagOrUnit || "import";
    return `${mergedResults.length} reports`;
  }

  function exportAllAssets() {
    for (const t of typesPresent) {
      const entriesOfType = doneEntries.filter((e) => e.assetType === t);
      const reports = entriesOfType
        .map(getMergedResult)
        .filter((r): r is ParsedPdfReport => r !== undefined);
      const extras = entriesOfType.map((e) => extraColumns[e.id]);
      exportIrisCsvFromParsed(reports, t, extras);
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

          {aiAvailable && useAi && (
            <label
              className="flex items-center gap-1.5 text-xs cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
              title={
                throttle
                  ? "Spaces files out to fit the Groq tokens-per-minute limit. Slower, but files won't fail. Turn OFF if you're on a paid Groq tier."
                  : "Files are sent as fast as they parse. If you're on the free tier (6k tokens/min), expect everything after the first file to be rate limited."
              }
            >
              <input
                type="checkbox"
                checked={throttle}
                onChange={(e) => {
                  setThrottle(e.target.checked);
                  try {
                    localStorage.setItem("import-throttle", e.target.checked ? "1" : "0");
                  } catch {
                    // storage unavailable — the setting still applies this session
                  }
                }}
                className="rounded"
                style={{ accentColor: "var(--accent)" }}
              />
              Auto-throttle
              <span style={{ color: "var(--text-label)" }}>
                {throttle ? "(free tier safe)" : "(off — paid tier)"}
              </span>
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
              Training Examples — each trains extractions of its asset type
            </p>

            {/* Bulk-tag banner for examples saved before type-scoping */}
            {examples.some((ex) => !ex.assetType) && (
              <div
                className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 text-xs"
                style={{ background: "var(--bg-card)", borderColor: "var(--color-info-border)", color: "var(--color-info-text)" }}
              >
                <span>
                  {examples.filter((ex) => !ex.assetType).length} example
                  {examples.filter((ex) => !ex.assetType).length !== 1 ? "s" : ""} from before type-scoping — tag them as:
                </span>
                <select
                  value={untypedTag}
                  onChange={(ev) => setUntypedTag(ev.target.value as IrisAssetType)}
                  aria-label="Asset type to tag untyped examples with"
                  className="rounded border px-1.5 py-0.5 text-xs"
                  style={{ background: "var(--bg-surface)", borderColor: "var(--border-solid)", color: "var(--text-secondary)" }}
                >
                  {ASSET_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const count = examples.filter((ex) => !ex.assetType).length;
                    setExamples(retagUntypedExamples(untypedTag));
                    toast(`Tagged ${count} example${count !== 1 ? "s" : ""} as ${untypedTag}`, "success");
                  }}
                >
                  Apply
                </Button>
              </div>
            )}

            <div className="flex flex-col gap-1">
              {examples.map((ex) => (
                <div key={ex.id} className="flex items-center gap-2 text-xs" style={{ color: "var(--color-info-text)" }}>
                  <span className="flex-1 truncate">{ex.filename}</span>
                  <select
                    value={ex.assetType ?? "All"}
                    onChange={(ev) => setExamples(updateTrainingExampleType(ex.id, ev.target.value))}
                    aria-label={`Asset type for example ${ex.filename}`}
                    title="Asset type this example trains"
                    className="rounded border px-1.5 py-0.5 text-[10px]"
                    style={{ background: "var(--bg-surface)", borderColor: "var(--border-solid)", color: "var(--text-secondary)" }}
                  >
                    <option value="All">All types</option>
                    {ASSET_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
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
                Tell the AI what it keeps getting wrong. Rules apply to extractions of their asset type — &ldquo;All types&rdquo; rules apply everywhere.
              </p>
            </div>

            {(() => {
              const scopesWithRules = RULE_SCOPES.filter((s) => rules.some((r) => r.assetType === s));
              const effectiveFilter =
                rulesFilter !== "Everything" && !scopesWithRules.includes(rulesFilter) ? "Everything" : rulesFilter;
              const visibleRules =
                effectiveFilter === "Everything" ? rules : rules.filter((r) => r.assetType === effectiveFilter);
              return (
                <>
                  {scopesWithRules.length > 1 && (
                    <div className="flex flex-wrap gap-1.5 px-4 pt-3">
                      {(["Everything", ...scopesWithRules] as (RuleScope | "Everything")[]).map((scope) => {
                        const active = effectiveFilter === scope;
                        const count = scope === "Everything" ? rules.length : rules.filter((r) => r.assetType === scope).length;
                        return (
                          <button
                            key={scope}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setRulesFilter(scope)}
                            className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
                            style={
                              active
                                ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
                                : { background: "var(--bg-surface)", borderColor: "var(--border-solid)", color: "var(--text-secondary)" }
                            }
                          >
                            {scope === "Everything" ? "All rules" : scope === "All" ? "All types" : scope} {count}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {rules.length === 0 ? (
                    <div className="px-4 py-5 text-center">
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        No rules yet — teach the AI its first correction.
                      </p>
                      <p className="mt-1 text-xs" style={{ color: "var(--text-label)" }}>
                        Pick an asset type below, describe the fix, and every future extraction of that type will obey it.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 px-4 py-3 max-h-64 overflow-y-auto">
                      {visibleRules.map((rule) => (
                        <div key={rule.id} className="flex items-start gap-2 group">
                          <div
                            className="flex-1 rounded-lg rounded-tl-sm border px-3 py-2 text-xs leading-relaxed"
                            style={{
                              background: "var(--bg-surface)",
                              borderColor: "var(--border)",
                              color: "var(--text-primary)",
                            }}
                          >
                            <span
                              className="mr-2 inline-block rounded-full border px-1.5 py-px text-[10px] font-medium align-middle"
                              style={
                                rule.assetType === "All"
                                  ? { background: "var(--bg-card)", borderColor: "var(--border-solid)", color: "var(--text-label)" }
                                  : { background: "var(--color-info-bg)", borderColor: "var(--color-info-border)", color: "var(--color-info-text)" }
                              }
                            >
                              {rule.assetType === "All" ? "All types" : rule.assetType}
                            </span>
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
                </>
              );
            })()}

            <div
              className="flex items-end gap-2 px-4 py-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <select
                value={ruleScope}
                onChange={(ev) => setRuleScope(ev.target.value as RuleScope)}
                aria-label="Asset type this rule applies to"
                className="shrink-0 rounded-lg border px-2 py-2 text-xs outline-none"
                style={{
                  background: "var(--bg-input, var(--bg-surface))",
                  borderColor: "var(--border-solid)",
                  color: "var(--text-secondary)",
                }}
              >
                {RULE_SCOPES.map((s) => (
                  <option key={s} value={s}>{s === "All" ? "All types" : s}</option>
                ))}
              </select>
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
                placeholder='e.g. "Never include the manufacturer name in the valve model field" or "Leave Service description blank"'
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
            {ASSET_TYPES.map((type) => {
              const active = pendingType === type;
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={active}
                  onClick={() => { setPendingType(type); setRuleScope(type); }}
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
                  key={entry.id}
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
                    {entry.training && (entry.status === "enhancing" || entry.status === "done") && (
                      <p className="mt-0.5 text-xs" style={{ color: "var(--text-label)" }}>
                        Trained with {entry.training.examples} {entry.assetType} example{entry.training.examples !== 1 ? "s" : ""} · {entry.training.rules} rule{entry.training.rules !== 1 ? "s" : ""}
                      </p>
                    )}
                    {entry.status === "error" && entry.error && (
                      <p className="mt-0.5 text-xs break-words" style={{ color: "var(--color-danger-text)" }}>
                        {entry.error}
                      </p>
                    )}
                  </div>
                  {(entry.status === "parsing" || entry.status === "enhancing") && (
                    <span className="text-xs font-medium animate-pulse whitespace-nowrap" style={{ color: "var(--accent)" }}>
                      {entry.statusMsg ?? (entry.status === "enhancing" ? "AI…" : "Parsing…")}
                    </span>
                  )}
                  {entry.status === "done" && (
                    entry.result?._aiError ? (
                      <span
                        className="text-xs font-medium whitespace-nowrap"
                        style={{ color: "var(--color-warning-text)" }}
                        title={entry.result._aiError}
                      >
                        ⚠ Regex only — rules not applied
                      </span>
                    ) : (
                      <span className="text-xs font-medium whitespace-nowrap" style={{ color: "var(--color-success-text)" }}>
                        ✓ Done{entry.result?._warnings?.some((w) => w.includes("AI filled")) ? " + AI" : ""}
                      </span>
                    )
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
                    onChange={(ev) => setEntryAssetType(entry.id, ev.target.value as IrisAssetType)}
                    className="rounded border px-1.5 py-0.5 text-xs shrink-0"
                    style={{ background: "var(--bg-surface)", borderColor: "var(--border-solid)", color: "var(--text-secondary)" }}
                  >
                    {ASSET_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  {entry.status === "done" && (
                    <>
                      <button
                        type="button"
                        onClick={() => reExtract(entry)}
                        title="Re-run extraction with the current rules and training examples. Clears this file's manual edits so the rules can take effect."
                        className="rounded-lg border px-2 py-0.5 text-xs whitespace-nowrap transition-colors"
                        style={{
                          borderColor: entry.result?._aiError ? "var(--color-warning-text)" : "var(--border-solid)",
                          color: entry.result?._aiError ? "var(--color-warning-text)" : "var(--text-secondary)",
                          background: "var(--bg-surface)",
                        }}
                      >
                        ↻ {entry.result?._aiError ? "Retry AI" : "Re-extract"}
                      </button>
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
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
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
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="label-sm">
                    Extracted Data — review and correct before exporting
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowAllColumns((v) => !v)}
                    aria-pressed={showAllColumns}
                    className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors"
                    style={
                      showAllColumns
                        ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" }
                        : { background: "var(--bg-surface)", borderColor: "var(--border-solid)", color: "var(--text-secondary)" }
                    }
                    title={showAllColumns ? "Show only the key extracted columns" : `Show all ${allColumnLabels.length} IRIS columns for ${tableType}`}
                  >
                    {showAllColumns ? `Showing all ${allColumnLabels.length} columns` : `Show all ${allColumnLabels.length} columns`}
                  </button>
                </div>
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

              {unmappableCols.length > 0 && (
                <div
                  className="mb-2 rounded-lg border px-3 py-2 text-xs"
                  style={{
                    background: "var(--color-warning-bg)",
                    borderColor: "var(--color-warning-border)",
                    color: "var(--color-warning-text)",
                  }}
                >
                  <strong>
                    {unmappableCols.length} extracted field
                    {unmappableCols.length !== 1 ? "s have" : " has"} no column in the {tableType} IRIS
                    template
                  </strong>{" "}
                  — {unmappableCols.join(", ")}. {unmappableCols.length !== 1 ? "These are" : "This is"}{" "}
                  read from the PDF but will not appear in the exported CSV. Switch the file&rsquo;s asset
                  type to Control Valve, Isolation Valve or Motor Operated Valve if it has a positioner.
                </div>
              )}

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
                      {displayColumns.map(({ label, col }) => (
                        <th
                          key={label}
                          className="px-3 py-2 text-left font-semibold min-w-[140px] whitespace-nowrap"
                          style={{ color: col ? "var(--text-label)" : "var(--text-secondary)" }}
                          title={col ? undefined : "Extra IRIS column — not auto-extracted; fill by hand to include in the export"}
                        >
                          {label}
                          {!col && <span aria-hidden className="ml-1" style={{ opacity: 0.5 }}>+</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {doneEntries.map((e, rowIdx) => {
                      const merged = getMergedResult(e);
                      const patch = editing[e.id] ?? {};
                      const rowExtras = extraColumns[e.id] ?? {};
                      // Live export values for unmapped columns (only needed in full view)
                      const previewByHeader = showAllColumns && merged
                        ? new Map(irisPreviewRow(merged, e.assetType).map((p) => [p.header, p.value]))
                        : null;
                      return (
                        <tr
                          key={e.id}
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
                          {displayColumns.map(({ label, col }) => {
                            const isMapped = Boolean(col);
                            const val = col
                              ? (merged ? col.getValue(merged, patch) : "")
                              : (rowExtras[label] ?? previewByHeader?.get(label) ?? "");
                            const onChange = col
                              ? (v: string) => merged && applyEdit(e.id, col.onEdit(merged, patch, v))
                              : (v: string) => applyExtraEdit(e.id, label, v);
                            return (
                              <td key={label} className="px-2 py-1">
                                <input
                                  type="text"
                                  value={val}
                                  onChange={(ev) => onChange(ev.target.value)}
                                  className="w-full rounded-lg border px-2 py-1 text-xs outline-none"
                                  style={{
                                    background: isMapped ? "var(--bg-input, var(--bg-surface))" : "var(--bg-surface)",
                                    borderColor: val ? "var(--border-solid)" : "var(--border)",
                                    color: val ? "var(--text-primary)" : "var(--text-label)",
                                  }}
                                  onFocus={(ev) => (ev.currentTarget.style.borderColor = "var(--accent)")}
                                  onBlur={(ev) => (ev.currentTarget.style.borderColor = val ? "var(--border-solid)" : "var(--border)")}
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
                Column headers match the IRIS CSV exactly.{" "}
                {showAllColumns
                  ? `Showing all ${allColumnLabels.length} ${tableType} columns — cells marked + aren't auto-extracted; hand-filled values are included in the export.`
                  : "Click any cell to correct before exporting."}
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
                              onChange={(ev) => applyEdit(e.id, { [field]: ev.target.value })}
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
                        <tr key={e.id} style={{ borderTop: rowIdx > 0 ? "1px solid var(--border)" : undefined }}>
                          {/* Assets — sticky tag cell */}
                          <td className="sticky left-0 z-10 px-2 py-1 border-r min-w-[140px]" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
                            <input
                              type="text"
                              value={r.tagOrUnit}
                              onChange={(ev) => applyEdit(e.id, { tagOrUnit: ev.target.value })}
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
                          {/* Observations — contenteditable + on-demand AI prose */}
                          <td className="px-2 py-1 min-w-[300px] max-w-sm align-top">
                            <div className="mb-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => generateObservations(e)}
                                disabled={obsBusy[e.id] || !aiAvailable}
                                title={
                                  aiAvailable
                                    ? "Write this observations block with AI (uses the prose model — run only when you need it)"
                                    : "AI not configured"
                                }
                                className="rounded-lg border px-1.5 py-0.5 text-[10px] whitespace-nowrap transition-colors disabled:opacity-40"
                                style={{
                                  borderColor: "var(--color-info-border)",
                                  color: "var(--color-info-text)",
                                  background: "var(--color-info-bg)",
                                }}
                              >
                                {obsBusy[e.id] ? "Writing…" : "✨ Write with AI"}
                              </button>
                            </div>
                            <div
                              key={`obs-${e.id}`}
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
                                applyEdit(e.id, { observationsHtml: html || undefined });
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
