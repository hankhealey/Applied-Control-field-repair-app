// PDF text extraction + field parsing for Applied Control Repair Reports
// Rebuilt with section detection, dedup, and 3-pass validation

export interface ParsedPdfReport {
  filename: string;
  tagOrUnit: string;
  /**
   * IRIS asset ID, e.g. "2003245". Printed in the report's NOTES line rather
   * than a labelled construction cell, so it is matched by pattern against the
   * raw text in finish() — not by the positional label lookup extractFields uses.
   */
  assetId: string;
  customer: string;
  siteTitle: string;
  repairDate: string;
  technician: string;
  process: string;
  emrReference: string;
  crmodReference: string;
  scopeOfWork: string;
  valveMake: string;
  valveSerialNumber: string;
  valveModelSize: string;
  valveClassConnection: string;
  valvePackingConfiguration: string;
  valveTrimCharPort: string;
  valveFlowDirection: string;
  actuatorMake: string;
  actuatorSerialNumber: string;
  actuatorModelSize: string;
  actuatorActionHandwheel: string;
  positionerMake: string;
  positionerSerialNumber: string;
  positionerModelAction: string;
  ratedTravel: string;
  benchSetAsLeft: string;
  openSignalAsLeft: string;
  closedSignalAsLeft: string;
  supplyPressureAsLeft: string;
  failActionAsLeft: string;
  actuatorAirAction: string;
  seatLeakClass: string;
  // AI-generated observations HTML for the IRIS records CSV Observations field
  observationsHtml?: string;
  // Internal: which pass produced this result + any validation notes
  _passCount?: number;
  _warnings?: string[];
  // Raw text for Ollama enhancement pass
  _rawText?: string;
  // Set when the AI pass failed — the result is regex-only, so user rules and
  // training examples never reached the model. Surfaced in the UI with a retry.
  // Kept a string (not a boolean flag) so the all-string casts in this file
  // still type-check; use isRateLimit() to classify it.
  _aiError?: string;
}

/** True when an _aiError came from a provider rate limit rather than a real fault. */
export function isRateLimit(aiError: string | undefined): boolean {
  return Boolean(aiError && /rate.?limit|429|too many requests/i.test(aiError));
}

/**
 * IRIS asset ID out of the report's NOTES prose, e.g. "Asset ID 2003245".
 * Tolerates "Asset ID:", "AssetID", and a value split across pdf.js text runs
 * (hence \s* rather than a single literal space between the words).
 *
 * Matched by pattern rather than by label position: the asset ID is printed in
 * free text, so there is no construction cell for findValue to anchor to.
 * Returns "" when absent — plenty of reports have no asset ID, which is not an error.
 */
export function findAssetId(rawText: string): string {
  const m = /\bAsset\s*ID\b\s*[:#]?\s*([0-9]{4,12})\b/i.exec(rawText ?? "");
  return m ? m[1] : "";
}

/** A positioned text run from the PDF. Public for the learned field map. */
export interface TextItem {
  str: string;
  x: number;
  y: number; // top-down (inverted from PDF coords)
  w: number;
  page: number;
}

/** Internal alias — this file used TItem throughout before it was exported. */
type TItem = TextItem;

// ── String utilities ──────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * Strip a manufacturer/make prefix from a model string.
 * "FISHER EZ 1-1/2" with make "FISHER" → "EZ 1-1/2"
 * Only strips when the model starts with the make (case-insensitive).
 */
function stripMakePrefix(model: string, make: string): string {
  if (!make || !model) return model;
  const prefix = norm(make).toLowerCase();
  const candidate = norm(model);
  if (candidate.toLowerCase().startsWith(prefix)) {
    return norm(candidate.slice(prefix.length));
  }
  return candidate;
}

/** Remove repeated-text patterns. "PV-4176B PV-4176B PV-4176B" → "PV-4176B" */
function dedup(value: string): string {
  if (!value) return "";
  const words = norm(value).split(" ");
  if (words.length < 2) return value.trim();

  // Try pattern lengths from 1 word up to half the total
  for (let len = 1; len <= Math.floor(words.length / 2); len++) {
    const pattern = words.slice(0, len).join(" ");
    // Check if the whole string is just this pattern repeated
    const rest = norm(value.slice(pattern.length)).trim();
    if (rest.startsWith(pattern) || rest === "") return pattern;
    // Regex-based: 2+ consecutive occurrences
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^(${escaped}\\s*){2,}`, "i");
    if (re.test(norm(value))) return pattern;
  }
  return norm(value);
}

// Words that belong in a findings/actions table, NOT in equipment fields
const REPAIR_WORDS = new Set([
  "polish",
  "reuse",
  "replace",
  "clean",
  "inspect",
  "rework",
  "repair",
  "discard",
  "lubricate",
  "lap",
  "hone",
  "adjust",
  "retainer",
  "retorque",
  "lapping",
  "grinding",
  "cleaning",
  "polishing",
  "lube",
]);

// Labels that mark the START of the findings / action table
const FINDINGS_HEADERS = [
  "FINDINGS",
  "Repair Findings",
  "REPAIR FINDINGS",
  "Condition Found",
  "Recommended Action",
  "As Left Action",
  "Component Category",
  "conditionFound",
];

// Equipment fields — must not contain repair action words
type EquipKey = keyof ParsedPdfReport;
const EQUIPMENT_FIELDS = new Set<EquipKey>([
  "valveMake",
  "valveSerialNumber",
  "valveModelSize",
  "valveClassConnection",
  "valvePackingConfiguration",
  "valveTrimCharPort",
  "valveFlowDirection",
  "actuatorMake",
  "actuatorSerialNumber",
  "actuatorModelSize",
  "actuatorActionHandwheel",
  "positionerMake",
  "positionerSerialNumber",
  "positionerModelAction",
]);

/**
 * Fields where a bare number is never a real value — a manufacturer is not
 * "667", a flow direction is not "2". These stay under the strict rule.
 */
const NEVER_NUMERIC_FIELDS = new Set<EquipKey>([
  "valveMake",
  "actuatorMake",
  "positionerMake",
  "valveFlowDirection",
  "actuatorActionHandwheel",
]);

/**
 * What the number-only check is actually defending against: findings lists
 * number their items ("1.", "2.", "12.") and those leak into equipment fields.
 *
 * Everything else numeric must be LEFT ALONE. Fisher actuator models are bare
 * numbers (667, 657, 1052, 585), positioners too (3582), and serials are often
 * all digits. Rejecting every numeric value deleted all of them on every file.
 */
const FINDINGS_ITEM_NUMBER = /^\d{1,2}\.$/;

/**
 * Component prefixes that own a construction row. These reports use generic
 * labels ("Model Number", "Model / Size") under per-component headings, and
 * findValue matches by substring — so a valve lookup for "Model Number" would
 * happily match the cell "Actuator Model Number" and file a 667 actuator as
 * the valve model. Each lookup passes the owners it must NOT steal from.
 */
export const ACTUATOR_OWNERS = ["Actuator", "Act.", "Act "] as const;
export const POSITIONER_OWNERS = [
  "Positioner",
  "Pos.",
  "Instrument",
  "DVC",
  "Device",
] as const;
export const VALVE_OWNERS = ["Valve", "Body"] as const;

/**
 * True when `text` matches a generic `label` only because a DIFFERENT
 * component's name is attached to it. Exact-label cells are never owned.
 */
export function isOwnedByOther(
  text: string,
  label: string,
  excludeOwners: readonly string[],
): boolean {
  if (!excludeOwners.length) return false;
  const t = norm(text).toLowerCase();
  const l = norm(label).toLowerCase();
  if (t === l) return false; // the bare label itself — not owned by anyone
  return excludeOwners.some((owner) => ownerRegex(owner).test(t));
}

/**
 * Match an owner as a WHOLE WORD. A plain substring test is what caused the
 * bug this guard exists to prevent: the owner "Act" is inside "Action", so
 * the positioner's own "Model / Action" row looked actuator-owned. Owners
 * ending in a word char get a trailing boundary; "Act." ends in a period,
 * which is already a boundary.
 */
const ownerRegexCache = new Map<string, RegExp>();
function ownerRegex(owner: string): RegExp {
  const key = norm(owner).toLowerCase();
  const cached = ownerRegexCache.get(key);
  if (cached) return cached;
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const trailing = /\w$/.test(key) ? "\\b" : "";
  const re = new RegExp(`\\b${escaped}${trailing}`, "i");
  ownerRegexCache.set(key, re);
  return re;
}

/**
 * True when a number-shaped value is definitely not real data for this field.
 * One rule, used by validation and by both retry guards, so they can't drift.
 */
export function isBadNumericFor(key: string, value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  return NEVER_NUMERIC_FIELDS.has(key as EquipKey)
    ? /^\d+\.?$/.test(t)
    : FINDINGS_ITEM_NUMBER.test(t);
}

// ── Text extraction ───────────────────────────────────────────────────────────

interface PageItems {
  page1: TItem[]; // page 1 only — most reliable for header + construction
  all: TItem[]; // all pages combined
  pageWidth: number;
  findingsStartY: number; // y where findings table begins (Infinity if not found)
}

export async function extractTextItems(file: File): Promise<PageItems> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const buf = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buf });
  const pdf = await loadingTask.promise;

  const all: TItem[] = [];
  const page1: TItem[] = [];
  let pageWidth = 612;

  // These reports run 10-15 MB (embedded photos). pdf.js holds every page's
  // parsed structures until told otherwise, so without the cleanup/destroy
  // below a few files in a row exhaust the tab's memory and kill it.
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      try {
        const vp = page.getViewport({ scale: 1 });
        if (p === 1) pageWidth = vp.width;

        const content = await page.getTextContent();
        for (const raw of content.items as Array<{
          str: string;
          transform: number[];
          width: number;
        }>) {
          const s = raw.str.trim();
          if (!s) continue;
          const item: TItem = {
            str: s,
            x: raw.transform[4],
            y: vp.height - raw.transform[5],
            w: Math.max(raw.width, 2),
            page: p,
          };
          all.push(item);
          if (p === 1) page1.push(item);
        }
      } finally {
        // Release this page's operator list / font data before the next one
        page.cleanup();
      }
    }
  } finally {
    // Tear the document down even if a page threw — otherwise the worker keeps
    // the whole file resident and the next upload starts from a worse baseline.
    // In pdfjs-dist 6.x the teardown lives on the loading task, not the proxy.
    await loadingTask.destroy().catch(() => {});
  }

  // Detect where findings section begins (search all pages)
  let findingsStartY = Infinity;
  for (const hdr of FINDINGS_HEADERS) {
    const hit = all.find((i) => i.str.includes(hdr));
    if (hit) {
      const y = hit.page === 1 ? hit.y : 99999;
      if (y < findingsStartY) findingsStartY = y;
    }
  }

  return { page1, all, pageWidth, findingsStartY };
}

// ── Core lookup helpers ───────────────────────────────────────────────────────

/**
 * Vertical slack, in PDF units, for two runs to count as the same visual row.
 * Exported so the learned field map scans rows on exactly the same terms — if
 * the map and the parser disagreed about what "same row" means, a mapping
 * would read a different cell than the one it was taught.
 */
export const ROW_TOL = 5;

/** True when `a` and `b` sit on the same visual row of the same page. */
export const sameRow = (a: TextItem, b: TextItem, tol: number = ROW_TOL): boolean =>
  a.page === b.page && Math.abs(a.y - b.y) <= tol;

/** Items to the right of `origin` on the same row */
function rightOf(
  items: TItem[],
  origin: TItem,
  rowTol = ROW_TOL,
  _maxGap = 25,
): TItem[] {
  return items
    .filter(
      (i) =>
        // sameRow includes the page test. Without it, a label on page 1 could
        // match a value at the same y on page 3: y is computed per page
        // (vp.height - transform[5]), so coordinates repeat on every page.
        sameRow(i, origin, rowTol) &&
        i.x > origin.x + origin.w - 4 &&
        norm(i.str) !== norm(origin.str),
    )
    .sort((a, b) => a.x - b.x);
}

/** Build a value string by concatenating adjacent items (stops at gap > maxGap or after maxTokens) */
function buildValue(sorted: TItem[], maxTokens = 5, maxGap = 22): string {
  if (!sorted.length) return "";
  let value = sorted[0].str;
  let lastRight = sorted[0].x + sorted[0].w;
  for (let i = 1; i < Math.min(sorted.length, maxTokens); i++) {
    const gap = sorted[i].x - lastRight;
    if (gap > maxGap) break;
    value += ` ${sorted[i].str}`;
    lastRight = sorted[i].x + sorted[i].w;
  }
  return dedup(norm(value));
}

/**
 * Find a field value: search `items` for any of `labels`, then return
 * the concatenated text to the right.
 *
 * `strategy`:
 *  - "first"   → use the first (topmost/leftmost) label occurrence
 *  - "rightmost" → use the rightmost label occurrence (for AS LEFT column)
 *  - "strict"  → take only ONE token to the right (no multi-word concat)
 */
function findValue(
  items: TItem[],
  labels: string[],
  strategy: "first" | "rightmost" | "strict" = "first",
  rowTol = 5,
  excludeOwners: readonly string[] = [],
): string {
  for (const label of labels) {
    const lnorm = norm(label);
    let matches = items.filter(
      (i) =>
        (norm(i.str) === lnorm || i.str.includes(label)) &&
        !isOwnedByOther(i.str, label, excludeOwners),
    );

    if (!matches.length) continue;

    if (strategy === "rightmost") {
      matches = [matches.reduce((a, b) => (a.x > b.x ? a : b))];
    } else {
      matches = matches.sort((a, b) => a.y - b.y || a.x - b.x);
    }

    for (const match of matches) {
      const candidates = rightOf(items, match, rowTol);
      if (!candidates.length) continue;
      const val =
        strategy === "strict"
          ? dedup(norm(candidates[0].str))
          : buildValue(candidates);
      if (val) return val;
    }
  }
  return "";
}

/**
 * Find the "As Left" calibration row and return the value at column `colIdx`
 * (0-indexed from left after the row label).
 */
/**
 * Component ownership by POSITION, for reports that label construction rows
 * generically.
 *
 * Verified against a real Applied Control report. CONSTRUCTION (AS FOUND) and
 * (AS LEFT) are printed SIDE BY SIDE — identical y values, different x — and
 * each column runs Body → Actuator → Positioner using the same bare labels:
 *
 *   AS LEFT column (x >= pageWidth/2), label x-positions ~376-414:
 *     y=209.4 "Make"          y=289.6 "Make"          y=358.6 "Make"
 *     y=220.7 "S/N"           y=300.9 "S/N"           y=369.9 "S/N"
 *     y=231.9 "Model / Size"  y=312.1 "Model / Size"  y=381.1 "Model / Action"
 *     └──── Body ────┘        └── Actuator ──┘        └─ Positioner ─┘
 *
 * So ownership is positional twice over: which COLUMN (as-found vs as-left) and
 * which OCCURRENCE (which component). Neither is in the label text, which is
 * why `isOwnedByOther` cannot help — "Make" carries no owner word.
 *
 * An earlier attempt scoped by the rotated component headings ("Body",
 * "Actuator", "Position.") in the left gutter. That was wrong twice: the
 * heading "Position." is not any of POSITIONER_OWNERS, and pdf.js reports a
 * rotated label near the BOTTOM of its block, so a band of "rows below the
 * heading" collects the NEXT component's rows.
 */

/** Items in the AS LEFT column. AS FOUND occupies the left half of the page. */
function asLeftColumn(items: TItem[], pageWidth: number): TItem[] {
  return items.filter((i) => i.x >= pageWidth / 2);
}

/**
 * Value of the Nth occurrence of a bare label within the AS LEFT column,
 * counting top to bottom. `occurrence` is 1-based: 1 = Body, 2 = Actuator,
 * 3 = Positioner.
 *
 * Matches the label EXACTLY (not by substring) so a bare "Make" never picks up
 * "Actuator Make" on a report that does prefix its labels — those are handled
 * by the prefixed lookups that run before this.
 */
function nthInAsLeft(
  items: TItem[],
  labels: string[],
  occurrence: number,
  pageWidth: number,
  maxGap = 22,
): string {
  const col = asLeftColumn(items, pageWidth);
  for (const label of labels) {
    const lnorm = norm(label).toLowerCase();
    const hits = col
      .filter((i) => norm(i.str).toLowerCase() === lnorm)
      .sort((a, b) => a.y - b.y);
    if (hits.length < occurrence) continue;
    const right = rightOf(col, hits[occurrence - 1]);
    const val = right.length ? buildValue(right, 5, maxGap) : "";
    if (val) return val;
  }
  return "";
}

function findCalAL(items: TItem[], colIdx: number): string {
  const AL_LABELS = ["As Left", "AS LEFT", "As left"];
  const rows = items.filter((i) => AL_LABELS.includes(norm(i.str)));
  if (!rows.length) return "";

  // Take the row that has the most items to its right (the full calibration row)
  let best: TItem | null = null;
  let bestCount = -1;
  for (const row of rows) {
    const cnt = rightOf(items, row, 8).length;
    if (cnt > bestCount) {
      best = row;
      bestCount = cnt;
    }
  }
  if (!best) return "";

  const right = rightOf(items, best, 8, 999); // wide gap OK for columns
  if (right.length <= colIdx) return "";
  return dedup(norm(right[colIdx].str));
}

// ── Validation ────────────────────────────────────────────────────────────────

interface ValidationIssue {
  field: EquipKey;
  value: string;
  reason: "repeated" | "repair_action" | "too_long" | "number_only";
}

function validateResult(result: ParsedPdfReport): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const key of Object.keys(result) as EquipKey[]) {
    if (key.startsWith("_")) continue;
    const v = String(result[key] ?? "");
    if (!v) continue;

    // Detect repeated text that dedup() should have caught
    if (v !== dedup(v)) {
      issues.push({ field: key, value: v, reason: "repeated" });
      continue;
    }
    // Repair action word in equipment field
    if (EQUIPMENT_FIELDS.has(key) && REPAIR_WORDS.has(v.toLowerCase().trim())) {
      issues.push({ field: key, value: v, reason: "repair_action" });
      continue;
    }
    // Number-only value in equipment fields. Only makes/flow-direction reject
    // every bare number; model and serial fields reject just the findings
    // item-number shape, because 667 / 1052 / 3582 are real model numbers.
    if (EQUIPMENT_FIELDS.has(key) && isBadNumericFor(key, v)) {
      issues.push({ field: key, value: v, reason: "number_only" });
      continue;
    }
    // Sentence-like value (multi-sentence with period) in equipment fields
    if (EQUIPMENT_FIELDS.has(key) && v.split(" ").length > 6) {
      issues.push({ field: key, value: v, reason: "too_long" });
    }
  }
  return issues;
}


/**
 * Copy values from `wider` into fields that `base` left EMPTY. Never overwrites
 * a value the narrower, more reliable pass already found.
 *
 * This is the guard that makes widening the search safe: page 1 above the
 * findings header stays authoritative, and a looser scan can only ever fill
 * gaps it would otherwise have left blank.
 */
export function mergeBlanks<T extends Record<string, unknown>>(
  base: T,
  wider: T,
  onlyKeys?: ReadonlySet<string>,
): T {
  const out = { ...base };
  for (const [k, v] of Object.entries(wider)) {
    if (k.startsWith("_")) continue; // never merge internal/meta fields
    if (onlyKeys && !onlyKeys.has(k)) continue;
    if (typeof v !== "string" || !v.trim()) continue;
    const current = out[k];
    if (typeof current === "string" && current.trim()) continue; // base wins
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

// ── Field extraction (one pass) ───────────────────────────────────────────────

/**
 * Extract all fields from `scope` items.
 * `scope` = page 1 only items for pass 1; relaxed for later passes.
 * `findingsY` = y above which construction data lives.
 * `strategy` = how aggressive to be on concat.
 */
export function extractFields(
  scope: TItem[],
  _allItems: TItem[],
  _pageWidth: number,
  findingsY: number,
  strategy: "first" | "rightmost" | "strict",
): Omit<ParsedPdfReport, "filename" | "_passCount" | "_warnings"> {
  // Items above the findings section (only for construction field searching)
  const safe = scope.filter((i) => i.y < findingsY);

  // ── Header / job info — use all scope items ───────────────────────────────
  const tagOrUnit = findValue(
    scope,
    [
      "Tag / Unit",
      "Tag No.",
      "Tag No",
      "Tag Number",
      "Tag:",
      "Tag",
      "Unit No.",
    ],
    strategy,
  );

  const customer = findValue(
    scope,
    ["Customer", "Customer:", "Client", "Client:", "CUSTOMER"],
    strategy,
  );

  const siteTitle = findValue(
    scope,
    ["Site", "Site:", "Location", "Plant", "Facility"],
    strategy,
  );

  const repairDate = findValue(
    scope,
    ["Repair Date", "Date", "Date:", "Completed At", "Service Date"],
    strategy,
  );

  // "Tech" first so the report-header cell wins. The label "Technician" is a
  // substring of "As Left Calibration Technician" and "Test Date / Technician",
  // both lower on the page — matching those returned the calibration tech
  // instead of the service tech named in the header. The excludeOwners reject
  // any tech label that belongs to the calibration or test rows.
  const technician = findValue(
    scope,
    ["Tech", "Technician", "Tech:", "Completed By", "Service Tech"],
    strategy,
    5,
    ["Calibration", "Witness", "Test", "Date", "Signature"],
  );

  const process = findValue(
    scope,
    ["Process", "Process Fluid", "Process:", "Application", "Service"],
    strategy,
  );

  const emrReference = findValue(
    scope,
    [
      "EMR Reference",
      "EMR Ref.",
      "EMR Ref",
      "EMR #",
      "EMR:",
      "Work Order",
      "WO #",
    ],
    strategy,
  );

  const crmodReference = findValue(
    scope,
    [
      "CRMoD Reference",
      "CRMod Ref.",
      "CRMod",
      "CRMoD Ref",
      "PO Number",
      "PO No.",
      "CRMoD:",
    ],
    strategy,
  );

  const scopeOfWork = findValue(
    scope,
    [
      "Scope of Work",
      "Scope",
      "Problem Description",
      "Work Performed",
      "Description",
    ],
    "first",
    8,
  ); // wider row tolerance for multi-line

  // ── Construction — AS LEFT preferred (rightmost) ──────────────────────────
  // Restrict to `safe` items (above findings section) for construction fields.

  // Generic construction labels ("Make", "S/N", "Model Number") appear under
  // a per-component heading, and findValue matches by substring — so a valve
  // lookup must never match an Actuator/Positioner row. This is how a Fisher
  // 667 actuator ended up in the valve model column.
  const NOT_VALVE = [...ACTUATOR_OWNERS, ...POSITIONER_OWNERS];

  // Ordinal position within the AS LEFT column: 1 = Body, 2 = Actuator,
  // 3 = Positioner. Returns "" when the report doesn't use bare labels, so
  // every lookup falls through to the behaviour it had before.
  const asLeftNth = (labels: string[], n: number, maxGap?: number) =>
    nthInAsLeft(safe, labels, n, _pageWidth, maxGap);
  const valveMake =
    findValue(
      safe,
      [
        "Valve Make",
        "Valve Manufacturer",
        "Valve Mfr.",
        "Valve Mfr",
        "Body Make",
        "Body Manufacturer",
      ],
      "rightmost",
    ) ||
    // Bare "Make" under a "Valve"/"Body" heading, scoped to that band.
    // Must precede the guarded whole-page fallback below: on a stacked layout
    // every "Make" shares an x, `rightmost` degenerates to last-in-order, and
    // the valve inherits whichever component is printed last.
    asLeftNth(["Make", "Manufacturer", "Mfr."], 1) ||
    // Generic "Make" must not match an Actuator/Positioner row
    findValue(safe, ["Make"], "rightmost", 5, NOT_VALVE);

  const valveSerialNumber =
    findValue(
      safe,
      [
        "Valve S/N",
        "Valve Serial No.",
        "Valve Serial Number",
        "Valve Serial",
        "Body S/N",
        "Body Serial",
      ],
      "rightmost",
    ) ||
    asLeftNth(["S/N", "Serial No.", "Serial"], 1) ||
    // Generic "S/N" matches "Actuator S/N" / "Positioner S/N" by substring —
    // without this guard the valve inherits another component's serial.
    findValue(safe, ["S/N"], "rightmost", 5, NOT_VALVE);
  const valveModelSize =
    findValue(
      safe,
      ["Valve Model No.", "Valve Model/Size", "Valve Model"],
      "rightmost",
    ) ||
    // Bare "Model / Size", 1st occurrence in the AS LEFT column = Body. Must
    // precede the guarded fallback below: that one picks by max x, and since
    // both construction columns put this label at the same x it resolves to the
    // LAST row in document order — the actuator. That is how 657 landed here.
    // Wide gap because the value is two cells ("U" then 3") ~47px apart.
    asLeftNth(["Model / Size", "Model Number", "Model/Size"], 1, 55) ||
    findValue(
      safe,
      ["Model Number", "Model / Size", "Model/Size"],
      "rightmost",
      5,
      NOT_VALVE,
    );

  const valveClassConnection =
    findValue(
    safe,
    [
      "Class / Conn.",
      "Class / Connection",
      "Pressure Class",
      "ANSI Class",
      "Class/Connection",
      "Class & Rating",
    ],
    "rightmost",
  ) || asLeftNth(["Class/Conn.", "Class / Conn.", "Class/Connection"], 1, 55);

  const valvePackingConfiguration = findValue(
    safe,
    [
      "Pkg. Configuration",
      "Packing Config.",
      "Packing Type",
      "Packing Configuration",
      "Packing",
      "Pkg Config",
    ],
    "rightmost",
  );

  const valveTrimCharPort =
    // First, because the lookup below matches the same bare label but reads it
    // with the default 22px gap and so returns only the first cell
    // ("Mod. Linear", dropping the 3" beside it).
    asLeftNth(["Trim Char/Port", "Trim Char / Port"], 1, 55) ||
    findValue(
      safe,
      [
        "Trim Char / Port",
        "Trim / Char / Port",
        "Trim Style",
        "Trim Characteristic",
        "Trim Char/Port",
        "Trim",
      ],
      "rightmost",
    );

  const valveFlowDirection = findValue(
    safe,
    ["Flow Direction", "Flow Dir.", "Flow Dir", "Flow"],
    "rightmost",
  );

  const actuatorMake =
    findValue(
      safe,
      ["Actuator Make", "Actuator Manufacturer", "Actuator Mfr.", "Act. Make"],
      "rightmost",
    ) ||
    // Bare "Make" under an "Actuator" heading. No prefixed text to guard on, so
    // scope to the heading's band instead.
    asLeftNth(["Make", "Manufacturer", "Mfr."], 2);

  const actuatorSerialNumber =
    findValue(
      safe,
      ["Actuator S/N", "Actuator Serial No.", "Actuator Serial", "Act. S/N"],
      "rightmost",
    ) ||
    asLeftNth(["S/N", "Serial No.", "Serial"], 2);

  const actuatorModelSize =
    findValue(
      safe,
      [
        "Actuator Model",
        "Act. Model",
        "Actuator Model/Size",
        "Act. Model / Size",
        "Actuator Size",
        "Act. Size",
      ],
      "rightmost",
    ) ||
    // 2nd "Model / Size" IN THE AS LEFT COLUMN. The fallback below counts
    // across both columns, and since as-found and as-left share y values that
    // made hits[1] the as-left BODY row — which is how the valve's "U" ended up
    // in Actuator model.
    asLeftNth(["Model / Size", "Model Number", "Model/Size"], 2, 55) ||
    (() => {
      // If there are 2+ "Model / Size" labels, the second is actuator.
      // But stop here — the third would be the positioner.
      const hits = safe
        .filter((i) => norm(i.str) === "Model / Size")
        .sort((a, b) => a.y - b.y);
      if (hits.length >= 2) {
        const r = rightOf(safe, hits[1]);
        const val = r.length ? buildValue(r) : "";
        // DVC6200 and similar are positioners — skip if found here
        if (val && /dvc|svi|hart|3582/i.test(val)) return "";
        return val;
      }
      return "";
    })();

  const actuatorActionHandwheel =
    // First — same reason as Trim: the lookup below truncates to "PDTC" and
    // drops the "None" beside it.
    asLeftNth(["Action/Handwheel", "Action / Handwheel"], 1, 55) ||
    findValue(
      safe,
      [
        "Action / Handwheel",
        "Actuator Action",
        "Act. Action",
        "Action/Handwheel",
        "Action / H.W.",
      ],
      "rightmost",
    );

  const positionerMake =
    findValue(
      safe,
      [
        "Positioner Make",
        "Positioner Manufacturer",
        "Positioner Mfr.",
        "Pos. Make",
      ],
      "rightmost",
    ) ||
    asLeftNth(["Make", "Manufacturer", "Mfr."], 3);

  const positionerSerialNumber =
    findValue(
      safe,
      [
        "Positioner S/N",
        "Positioner Serial No.",
        "Positioner Serial",
        "Pos. S/N",
      ],
      "rightmost",
    ) ||
    // The reported bug: reports print a bare "S/N" under a "Positioner"
    // heading, and every prefixed label above misses.
    asLeftNth(["S/N", "Serial No.", "Serial"], 3);

  const positionerModelAction =
    findValue(
      safe,
      [
        "Pos. Model / Action",
        "Positioner Model",
        "Pos. Model",
        "Positioner Model/Size",
      ],
      "rightmost",
    ) ||
    // "Model / Action" belongs to the positioner block and occurs once per
    // column. Wide gap: model and action are two cells ("DVC6200" then "Direct").
    asLeftNth(["Model / Action", "Model/Action"], 1, 55) ||
    // "Model / Action" is generic — don't let it match a valve/actuator row
    findValue(safe, ["Model / Action"], "rightmost", 5, [
      ...VALVE_OWNERS,
      ...ACTUATOR_OWNERS,
    ]) ||
    (() => {
      // Third "Model / Size" label (after valve and actuator) is positioner
      const hits = safe
        .filter((i) => norm(i.str) === "Model / Size")
        .sort((a, b) => a.y - b.y);
      if (hits.length >= 3) {
        const r = rightOf(safe, hits[2]);
        return r.length ? buildValue(r) : "";
      }
      return "";
    })();

  // ── Calibration — AS LEFT row ─────────────────────────────────────────────
  // Calibration is on page 1; use `scope` (not `safe`) since calibration
  // appears before the findings table y anyway.
  const ratedTravel =
    findCalAL(scope, 0) ||
    findValue(scope, ["Rated Travel", "Travel"], "first");

  const benchSetAsLeft = findCalAL(scope, 1);
  const openSignalAsLeft = findCalAL(scope, 2);
  const closedSignalAsLeft = findCalAL(scope, 3);
  const supplyPressureAsLeft =
    findCalAL(scope, 4) ||
    findValue(scope, ["Supply Pressure", "Supply", "Supply Pres."], "first");
  const failActionAsLeft = findCalAL(scope, 5);
  const actuatorAirAction = findCalAL(scope, 6);

  // ── Test data ─────────────────────────────────────────────────────────────
  const seatLeakClass = findValue(
    scope,
    [
      "Seat Leak Class",
      "Leak Class",
      "ANSI Leak Class",
      "Leakage Class",
      "Seat Leakage Class",
    ],
    "first",
  );

  return {
    tagOrUnit,
    // Filled by pattern in finish() — the asset ID lives in the NOTES prose,
    // not in a labelled cell, so there is nothing positional to look up here.
    assetId: "",
    customer,
    siteTitle,
    repairDate,
    technician,
    process,
    emrReference,
    crmodReference,
    scopeOfWork,
    valveMake,
    valveSerialNumber,
    valveModelSize: stripMakePrefix(valveModelSize, valveMake),
    valveClassConnection,
    valvePackingConfiguration,
    valveTrimCharPort,
    valveFlowDirection,
    actuatorMake,
    actuatorSerialNumber,
    actuatorModelSize: stripMakePrefix(actuatorModelSize, actuatorMake),
    actuatorActionHandwheel,
    positionerMake,
    positionerSerialNumber,
    positionerModelAction: stripMakePrefix(
      positionerModelAction,
      positionerMake,
    ),
    ratedTravel,
    benchSetAsLeft,
    openSignalAsLeft,
    closedSignalAsLeft,
    supplyPressureAsLeft,
    failActionAsLeft,
    actuatorAirAction,
    seatLeakClass,
  };
}

// ── Fix a bad field value using stricter strategy ─────────────────────────────

function fixIssues(
  result: Omit<ParsedPdfReport, "filename" | "_passCount" | "_warnings">,
  issues: ValidationIssue[],
  scope: TItem[],
  allItems: TItem[],
  pageWidth: number,
  findingsY: number,
): Omit<ParsedPdfReport, "filename" | "_passCount" | "_warnings"> {
  const fixed = { ...result };
  const safe = scope.filter((i) => i.y < findingsY);

  for (const issue of issues) {
    const key = issue.field;

    if (issue.reason === "repeated") {
      // Just dedup the value
      (fixed as Record<string, string>)[key] = dedup(issue.value);
      continue;
    }

    if (
      issue.reason === "repair_action" ||
      issue.reason === "number_only" ||
      issue.reason === "too_long"
    ) {
      // Clear the bad value and try strict single-token on safe items
      (fixed as Record<string, string>)[key] = "";

      // Retry with strict strategy on page 1 safe items only
      const retried = extractFields(
        safe,
        allItems,
        pageWidth,
        findingsY,
        "strict",
      );
      const retriedVal = String((retried as Record<string, string>)[key] ?? "");

      if (
        retriedVal &&
        !REPAIR_WORDS.has(retriedVal.toLowerCase()) &&
        !isBadNumericFor(key, retriedVal)
      ) {
        (fixed as Record<string, string>)[key] = retriedVal;
      }
      // Otherwise leave empty — better than wrong
    }
  }

  return fixed;
}

// ── Main exported function — 3-pass validation ────────────────────────────────

export async function parsePdfFile(file: File): Promise<ParsedPdfReport> {
  const { page1, all, pageWidth, findingsStartY } =
    await extractTextItems(file);

  // Flat raw text for Ollama enhancement (first 12 000 chars is enough for any report)
  const rawText = all
    .map((i) => i.str)
    .join(" ")
    .slice(0, 12_000);

  // If no text found at all (image-based PDF)
  if (all.length < 10) {
    return {
      filename: file.name,
      tagOrUnit: "",
      assetId: "",
      customer: "",
      siteTitle: "",
      repairDate: "",
      technician: "",
      process: "",
      emrReference: "",
      crmodReference: "",
      scopeOfWork: "",
      valveMake: "",
      valveSerialNumber: "",
      valveModelSize: "",
      valveClassConnection: "",
      valvePackingConfiguration: "",
      valveTrimCharPort: "",
      valveFlowDirection: "",
      actuatorMake: "",
      actuatorSerialNumber: "",
      actuatorModelSize: "",
      actuatorActionHandwheel: "",
      positionerMake: "",
      positionerSerialNumber: "",
      positionerModelAction: "",
      ratedTravel: "",
      benchSetAsLeft: "",
      openSignalAsLeft: "",
      closedSignalAsLeft: "",
      supplyPressureAsLeft: "",
      failActionAsLeft: "",
      actuatorAirAction: "",
      seatLeakClass: "",
      _passCount: 0,
      _rawText: rawText,
      _warnings: [
        "PDF appears to be image-based — text could not be extracted. Enter fields manually.",
      ],
    };
  }

  const warnings: string[] = [];

  /** Single exit for all three passes — one place that shapes the result. */
  const finish = (
    result: Omit<ParsedPdfReport, "filename" | "_passCount" | "_warnings">,
    passCount: number,
    notes: string[],
  ): ParsedPdfReport => ({
    filename: file.name,
    ...result,
    // Pattern, not position: the asset ID is printed in the NOTES prose
    // ("Asset ID 2003245"), so a label lookup has nothing to anchor to.
    // Never overwrite a value a pass already found.
    assetId: result.assetId || findAssetId(rawText),
    _passCount: passCount,
    _rawText: rawText,
    _warnings: notes,
  });

  // ── Pass 1: Standard extraction from page 1 ──────────────────────────────
  const scope1 = page1.length > 5 ? page1 : all; // fall back to all if page1 is sparse
  let fields = extractFields(scope1, all, pageWidth, findingsStartY, "first");

  // ── Pass 1b: widen the search for fields pass 1 left EMPTY ───────────────
  // Pass 1 only reads page 1 above the findings header. Anything below that
  // line, or on page 2+, was invisible: validateResult ignores empty fields
  // (see `if (!v) continue`), so a missing serial produced zero issues, took
  // the early return below, and never reached the all-pages pass 3. The AI
  // masked this until a rate limit skipped it.
  //
  // Widen one rung at a time, fill-only via mergeBlanks, so the narrow and
  // reliable page-1 result always wins and this can only add what was blank.
  fields = mergeBlanks(
    fields,
    extractFields(scope1, all, pageWidth, Number.POSITIVE_INFINITY, "first"),
  );
  // Later pages hold the findings tables and photo captions. Only EQUIPMENT
  // FIELDS may be filled from there: they are the ones validateResult polices
  // for repair words and item numbers. Fields like benchSetAsLeft, ratedTravel
  // and technician have NO such guard, so hunting them in narrative prose can
  // fabricate a calibration spec — worse than leaving the cell blank.
  const laterPages = all.filter((i) => i.page > 1);
  if (laterPages.length > 0) {
    fields = mergeBlanks(
      fields,
      extractFields(laterPages, all, pageWidth, Number.POSITIVE_INFINITY, "first"),
      EQUIPMENT_FIELDS as ReadonlySet<string>,
    );
  }

  let issues = validateResult({ filename: file.name, ...fields });

  if (issues.length === 0) {
    return finish(fields, 1, []);
  }

  warnings.push(
    `Pass 1: ${issues.length} issue(s) detected — ${issues.map((i) => `${i.field}="${i.value}" (${i.reason})`).join("; ")}`,
  );

  // ── Pass 2: Fix issues with stricter extraction ──────────────────────────
  fields = fixIssues(fields, issues, scope1, all, pageWidth, findingsStartY);
  issues = validateResult({ filename: file.name, ...fields });

  if (issues.length === 0) {
    return finish(fields, 2, warnings);
  }

  warnings.push(
    `Pass 2: ${issues.length} issue(s) remain — retrying with strict single-token strategy`,
  );

  // ── Pass 3: Full strict pass on all items, tightest criteria ────────────
  const strictFields = extractFields(
    all.filter((i) => i.y < findingsStartY || i.page === 1),
    all,
    pageWidth,
    findingsStartY,
    "strict",
  );
  // Merge: for any field that was fixed in pass 2, keep that; use pass 3 for remainder issues
  for (const issue of issues) {
    const strictVal = String(
      (strictFields as Record<string, string>)[issue.field] ?? "",
    );
    if (
      strictVal &&
      !REPAIR_WORDS.has(strictVal.toLowerCase()) &&
      !isBadNumericFor(issue.field, strictVal)
    ) {
      (fields as Record<string, string>)[issue.field] = strictVal;
    } else {
      // Give up — clear the field rather than store wrong data
      (fields as Record<string, string>)[issue.field] = "";
    }
  }

  const remaining = validateResult({ filename: file.name, ...fields });
  if (remaining.length > 0) {
    warnings.push(
      `Pass 3 (final): ${remaining.length} field(s) cleared — could not reliably extract: ${remaining.map((i) => i.field).join(", ")}`,
    );
    for (const issue of remaining) {
      (fields as Record<string, string>)[issue.field] = "";
    }
  }

  return finish(fields, 3, warnings);
}
