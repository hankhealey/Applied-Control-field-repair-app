// PDF text extraction + field parsing for Applied Control Repair Reports
// Rebuilt with section detection, dedup, and 3-pass validation

export interface ParsedPdfReport {
  filename: string;
  tagOrUnit: string;
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
  // Internal: which pass produced this result + any validation notes
  _passCount?: number;
  _warnings?: string[];
}

interface TItem {
  str: string;
  x: number;
  y: number; // top-down (inverted from PDF coords)
  w: number;
  page: number;
}

// ── String utilities ──────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.trim().replace(/\s+/g, " ");
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
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  const all: TItem[] = [];
  const page1: TItem[] = [];
  let pageWidth = 612;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
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

/** Items to the right of `origin` on the same row */
function rightOf(
  items: TItem[],
  origin: TItem,
  rowTol = 5,
  maxGap = 25,
): TItem[] {
  return items
    .filter(
      (i) =>
        Math.abs(i.y - origin.y) <= rowTol &&
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
    value += " " + sorted[i].str;
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
): string {
  for (const label of labels) {
    const lnorm = norm(label);
    let matches = items.filter(
      (i) => norm(i.str) === lnorm || i.str.includes(label),
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
    // Number-only value in equipment fields (likely a finding item number)
    if (EQUIPMENT_FIELDS.has(key) && /^\d+\.?$/.test(v.trim())) {
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

// ── Field extraction (one pass) ───────────────────────────────────────────────

/**
 * Extract all fields from `scope` items.
 * `scope` = page 1 only items for pass 1; relaxed for later passes.
 * `findingsY` = y above which construction data lives.
 * `strategy` = how aggressive to be on concat.
 */
function extractFields(
  scope: TItem[],
  allItems: TItem[],
  pageWidth: number,
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

  const technician = findValue(
    scope,
    ["Technician", "Tech", "Tech:", "Completed By", "Service Tech"],
    strategy,
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
    ) || findValue(safe, ["Make"], "rightmost");

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
    ) || findValue(safe, ["S/N"], "rightmost");

  const valveModelSize =
    findValue(
      safe,
      [
        "Valve Model",
        "Valve Model No.",
        "Model Number",
        "Valve Model/Size",
        "Model / Size",
        "Model/Size",
      ],
      "rightmost",
    ) || findValue(safe, ["Model / Size", "Model/Size"], "rightmost");

  const valveClassConnection = findValue(
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
  );

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

  const valveTrimCharPort = findValue(
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

  const actuatorMake = findValue(
    safe,
    ["Actuator Make", "Actuator Manufacturer", "Actuator Mfr.", "Act. Make"],
    "rightmost",
  );

  const actuatorSerialNumber = findValue(
    safe,
    ["Actuator S/N", "Actuator Serial No.", "Actuator Serial", "Act. S/N"],
    "rightmost",
  );

  const actuatorModelSize =
    findValue(
      safe,
      [
        "Actuator Model",
        "Act. Model",
        "Actuator Model/Size",
        "Act. Model / Size",
      ],
      "rightmost",
    ) ||
    (() => {
      // If there are 2+ "Model / Size" labels, the second one is actuator
      const hits = safe.filter((i) => norm(i.str) === "Model / Size");
      if (hits.length >= 2) {
        const second = hits.sort((a, b) => a.y - b.y)[1];
        const r = rightOf(safe, second);
        return r.length ? buildValue(r) : "";
      }
      return "";
    })();

  const actuatorActionHandwheel = findValue(
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

  const positionerMake = findValue(
    safe,
    [
      "Positioner Make",
      "Positioner Manufacturer",
      "Positioner Mfr.",
      "Pos. Make",
    ],
    "rightmost",
  );

  const positionerSerialNumber = findValue(
    safe,
    [
      "Positioner S/N",
      "Positioner Serial No.",
      "Positioner Serial",
      "Pos. S/N",
    ],
    "rightmost",
  );

  const positionerModelAction = findValue(
    safe,
    ["Model / Action", "Pos. Model / Action", "Positioner Model", "Pos. Model"],
    "rightmost",
  );

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
    valveModelSize,
    valveClassConnection,
    valvePackingConfiguration,
    valveTrimCharPort,
    valveFlowDirection,
    actuatorMake,
    actuatorSerialNumber,
    actuatorModelSize,
    actuatorActionHandwheel,
    positionerMake,
    positionerSerialNumber,
    positionerModelAction,
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
        !/^\d+\.?$/.test(retriedVal)
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

  // If no text found at all (image-based PDF)
  if (all.length < 10) {
    return {
      filename: file.name,
      tagOrUnit: "",
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
      _warnings: [
        "PDF appears to be image-based — text could not be extracted. Enter fields manually.",
      ],
    };
  }

  const warnings: string[] = [];

  // ── Pass 1: Standard extraction from page 1 ──────────────────────────────
  const scope1 = page1.length > 5 ? page1 : all; // fall back to all if page1 is sparse
  let fields = extractFields(scope1, all, pageWidth, findingsStartY, "first");
  let issues = validateResult({ filename: file.name, ...fields });

  if (issues.length === 0) {
    return { filename: file.name, ...fields, _passCount: 1, _warnings: [] };
  }

  warnings.push(
    `Pass 1: ${issues.length} issue(s) detected — ${issues.map((i) => `${i.field}="${i.value}" (${i.reason})`).join("; ")}`,
  );

  // ── Pass 2: Fix issues with stricter extraction ──────────────────────────
  fields = fixIssues(fields, issues, scope1, all, pageWidth, findingsStartY);
  issues = validateResult({ filename: file.name, ...fields });

  if (issues.length === 0) {
    return {
      filename: file.name,
      ...fields,
      _passCount: 2,
      _warnings: warnings,
    };
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
      !/^\d+\.?$/.test(strictVal)
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

  return { filename: file.name, ...fields, _passCount: 3, _warnings: warnings };
}
