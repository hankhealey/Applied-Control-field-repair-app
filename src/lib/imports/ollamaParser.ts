// AI-powered PDF field enhancement via /api/pdf-enhance (Groq in production).
// Called client-side after the regex parser runs. Sends empty fields + raw PDF
// text to the server route, which calls Groq and returns extracted values.

import type { ParsedPdfReport } from "./pdfParser";

export const PDF_FIELDS: Array<{ key: keyof ParsedPdfReport; desc: string }> = [
  { key: "tagOrUnit", desc: "equipment tag or unit ID (e.g. PV-4176B)" },
  { key: "customer", desc: "customer or client company name" },
  { key: "siteTitle", desc: "site, plant, or facility name" },
  {
    key: "repairDate",
    desc: "repair or service date (YYYY-MM-DD if possible)",
  },
  { key: "technician", desc: "technician or service tech name" },
  { key: "process", desc: "process fluid or application" },
  { key: "emrReference", desc: "EMR, work order, or WO reference number" },
  { key: "crmodReference", desc: "CRMoD, PO, or purchase order number" },
  { key: "scopeOfWork", desc: "scope of work or problem description" },
  {
    key: "valveMake",
    desc: "valve body manufacturer name (e.g. FISHER, EMERSON)",
  },
  {
    key: "valveSerialNumber",
    desc: "valve body serial number — only if explicitly labeled as valve or body serial number",
  },
  {
    key: "valveModelSize",
    desc: "valve model code and size — do NOT include the manufacturer name (e.g. 'EZ 1-1/2\"' not 'FISHER EZ 1-1/2\"')",
  },
  { key: "valveClassConnection", desc: "pressure class and connection type" },
  { key: "valvePackingConfiguration", desc: "packing type or configuration" },
  { key: "valveTrimCharPort", desc: "trim characteristic and port size" },
  { key: "valveFlowDirection", desc: "flow direction (e.g. FTO, FTC)" },
  { key: "actuatorMake", desc: "actuator manufacturer name" },
  {
    key: "actuatorSerialNumber",
    desc: "actuator serial number — only if explicitly labeled as actuator serial, do NOT use the valve serial number",
  },
  {
    key: "actuatorModelSize",
    desc: "mechanical actuator model (e.g. 657, 1052, 1051, 585) — this is the pneumatic spring-diaphragm or piston actuator, NOT the positioner or digital valve controller. DVC6200 is a positioner, never put it here.",
  },
  {
    key: "actuatorActionHandwheel",
    desc: "actuator action type and handwheel info",
  },
  { key: "positionerMake", desc: "positioner manufacturer name" },
  {
    key: "positionerSerialNumber",
    desc: "positioner serial number — only if explicitly labeled as positioner serial, do NOT use the valve or actuator serial number",
  },
  {
    key: "positionerModelAction",
    desc: "positioner or digital valve controller model (e.g. DVC6200, SVI, 3582, HART positioner) — this is separate from the actuator",
  },
  { key: "ratedTravel", desc: "rated travel value" },
  { key: "benchSetAsLeft", desc: "bench set pressure (as left)" },
  {
    key: "openSignalAsLeft",
    desc: "open signal value (as left, e.g. 4 mA or 0%)",
  },
  { key: "closedSignalAsLeft", desc: "closed signal value (as left)" },
  { key: "supplyPressureAsLeft", desc: "supply pressure (as left)" },
  {
    key: "failActionAsLeft",
    desc: "fail action (as left, e.g. Fail Open, Fail Closed)",
  },
  { key: "actuatorAirAction", desc: "actuator air action (e.g. Air to Open)" },
  {
    key: "seatLeakClass",
    desc: "seat leakage class (e.g. Class IV, Class VI)",
  },
];

/** Check whether the server-side AI route is configured (Groq key present). */
export async function checkAiAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/pdf-enhance", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { available?: boolean };
    return data.available === true;
  } catch {
    return false;
  }
}

function stripMake(model: string, make: string): string {
  if (!make || !model) return model;
  const prefix = make.trim().toLowerCase();
  const m = model.trim();
  if (m.toLowerCase().startsWith(prefix)) return m.slice(prefix.length).trim();
  return m;
}

export interface AiExample {
  rawText: string;
  fields: Record<string, string>;
  filename?: string;
}

/**
 * Ask Groq to generate the full Observations HTML block from raw PDF text.
 * Returns the HTML string, or null if unavailable / generation fails.
 */
export async function generateObservationsHtml(
  rawText: string,
): Promise<string | null> {
  if (!rawText?.trim()) return null;
  try {
    const res = await fetch("/api/pdf-enhance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawText, generateObservations: true }),
      signal: AbortSignal.timeout(35_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { observationsHtml?: string };
    const html = data.observationsHtml?.trim();
    return html || null;
  } catch {
    return null;
  }
}

/**
 * Extract all fields from a parsed PDF report using Groq (via /api/pdf-enhance).
 * Sends the full raw text and all fields — AI results overwrite regex output so
 * fields the regex got wrong or missed are corrected from the source document.
 * Pass training examples for few-shot prompting to improve accuracy.
 */
export async function enhanceWithAi(
  parsed: ParsedPdfReport,
  onProgress?: (message: string) => void,
  examples: AiExample[] = [],
  rules: string[] = [],
): Promise<ParsedPdfReport> {
  const rawText = parsed._rawText;
  if (!rawText?.trim()) {
    return {
      ...parsed,
      _warnings: [...(parsed._warnings ?? []), "AI: no raw text available"],
    };
  }

  onProgress?.("Reading document with AI…");

  try {
    const res = await fetch("/api/pdf-enhance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawText,
        fields: PDF_FIELDS.map((f) => ({ key: f.key, desc: f.desc })),
        examples,
        rules,
        // One call returns fields AND the observations block. Previously the
        // prose was a second request that re-sent the same document to the 70b
        // model — the document is now read once, on the roomier 8b limit.
        withObservations: true,
      }),
      signal: AbortSignal.timeout(35_000),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({ error: "unknown" }))) as {
        error?: string;
      };
      // A rate limit means the model never saw the text — rules and training
      // examples did NOT apply. Never fail silently here: the regex-only result
      // looks identical to a successful run.
      const raw = `${err.error ?? ""} ${res.status}`;
      const rateLimited = res.status === 429 || /rate.?limit|429|too many requests/i.test(raw);
      const message = rateLimited
        ? "Rate limit hit — AI skipped, so your rules did NOT apply. Wait ~60s and re-extract."
        : `AI error: ${err.error ?? res.status}`;
      onProgress?.(message);
      return {
        ...parsed,
        _aiError: message,
        _warnings: [...(parsed._warnings ?? []), message],
      };
    }

    const extracted = (await res.json()) as Partial<Record<string, string>>;

    const enhanced = { ...parsed };
    const filled: string[] = [];

    for (const { key } of PDF_FIELDS) {
      const val = extracted[key as string];
      if (val && typeof val === "string" && val.trim()) {
        (enhanced as Record<string, unknown>)[key] = val.trim();
        filled.push(key);
      }
    }

    // Strip manufacturer prefix from model fields in case AI included it
    enhanced.valveModelSize = stripMake(
      enhanced.valveModelSize,
      enhanced.valveMake,
    );
    enhanced.actuatorModelSize = stripMake(
      enhanced.actuatorModelSize,
      enhanced.actuatorMake,
    );
    enhanced.positionerModelAction = stripMake(
      enhanced.positionerModelAction,
      enhanced.positionerMake,
    );

    // Observations come back from the SAME call as the fields (withObservations),
    // so the report is read once. A second request to the 70b prose model used
    // to re-send the whole document and blew its ~6k tokens/min ceiling after
    // ~2 files, which rate-limited extraction itself. The 70b path still exists
    // behind the on-demand "Write with AI" button when prose quality matters.
    const obs = typeof extracted.observationsHtml === "string" ? extracted.observationsHtml.trim() : "";
    if (obs) enhanced.observationsHtml = obs;

    enhanced._warnings = [
      ...(parsed._warnings ?? []),
      `AI extracted ${filled.length} field(s)${obs ? " + observations" : ""}`,
    ];

    onProgress?.(
      filled.length > 0
        ? `✓ AI filled ${filled.length} field(s)${obs ? " + observations" : ""}`
        : "AI found no additional data",
    );

    return enhanced;
  } catch (err) {
    const message = `AI: ${err instanceof Error ? err.message : String(err)}`;
    onProgress?.(message);
    return {
      ...parsed,
      _aiError: message,
      _warnings: [...(parsed._warnings ?? []), message],
    };
  }
}
