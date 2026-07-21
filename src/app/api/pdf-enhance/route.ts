import type { NextRequest } from "next/server";
import { getIp } from "@/lib/ip";

// AI provider — Groq by default, swappable to any OpenAI-compatible API
// (NVIDIA NIM, OpenRouter, Together, a local server) with env vars only.
// To point at NVIDIA's free tier, set in .env.local and Vercel:
//   AI_BASE_URL=https://integrate.api.nvidia.com/v1
//   AI_MODEL=meta/llama-3.1-8b-instruct
//   AI_MODEL_PROSE=meta/llama-3.3-70b-instruct
//   AI_API_KEY=<your nvidia key>
//   AI_TPM_LIMIT=<nvidia's tokens-per-minute; the throttle paces to this>
// Leave them unset to stay on Groq. Voice transcription stays on GROQ_API_KEY
// (see api/transcribe) regardless, so swapping this does not break dictation.
const AI_BASE_URL = (process.env.AI_BASE_URL ?? "https://api.groq.com/openai/v1").replace(/\/$/, "");
const AI_CHAT_URL = `${AI_BASE_URL}/chat/completions`;
const AI_MODEL = process.env.AI_MODEL ?? "llama-3.1-8b-instant";
const AI_MODEL_PROSE = process.env.AI_MODEL_PROSE ?? "llama-3.3-70b-versatile";
/** The AI key. Falls back to GROQ_API_KEY so existing deploys keep working. */
const AI_API_KEY = process.env.AI_API_KEY ?? process.env.GROQ_API_KEY;

// Per-IP rate limit: 30 requests per 10 minutes to protect Groq API key spend.
// In-memory only — resets on process restart (acceptable for local/self-hosted).
const enhanceAttempts = new Map<string, { count: number; resetAt: number }>();
const ENHANCE_WINDOW_MS = 10 * 60 * 1000;
const ENHANCE_MAX = 30;

function checkEnhanceRateLimit(req: NextRequest): Response | null {
  const ip = getIp(req);
  const now = Date.now();
  const entry = enhanceAttempts.get(ip);
  if (entry && now > entry.resetAt) enhanceAttempts.delete(ip);
  const current = enhanceAttempts.get(ip);
  if (current && current.count >= ENHANCE_MAX) {
    return Response.json({ error: "Rate limit exceeded — try again later" }, { status: 429 });
  }
  enhanceAttempts.set(ip, { count: (current?.count ?? 0) + 1, resetAt: current?.resetAt ?? now + ENHANCE_WINDOW_MS });
  return null;
}
// The provider bills a request against a per-minute token budget as
// `prompt_tokens + max_tokens`. On Groq's free tier that cap is 6000, so any
// single request reserving more is rejected 413 and can never succeed — no
// amount of waiting helps. Everything below keeps one request under the cap.
// AI_TPM_LIMIT raises it for a roomier tier (NVIDIA free, Groq Developer, etc.);
// GROQ_TPM_LIMIT is still read for backward compatibility.
const TPM_LIMIT = Number(process.env.AI_TPM_LIMIT ?? process.env.GROQ_TPM_LIMIT ?? 6000);
const TPM_SAFETY_MARGIN = 400;

/** Rough token estimate. Groq/Llama averages ~4 chars per token for English. */
const estimateTokens = (s: string): number => Math.ceil(s.length / 4);

/**
 * Output reservation. Actual output is ~530 tokens (fields JSON ~230 + prose
 * HTML ~300); these leave headroom without eating the whole TPM budget.
 */
const MAX_OUT_MERGED = 1400;
const MAX_OUT_FIELDS = 900;

export async function GET() {
  const available = Boolean(AI_API_KEY);
  // tpmLimit lets the client throttle pace to THIS provider's budget instead of
  // a hardcoded 6000 — otherwise a roomier tier (NVIDIA) would still be throttled
  // as if it were Groq free, and the test would show no improvement.
  const host = (() => {
    try {
      return new URL(AI_BASE_URL).host;
    } catch {
      return "unknown";
    }
  })();
  return Response.json({ available, provider: available ? host : null, tpmLimit: TPM_LIMIT });
}

interface TrainingExample {
  rawText: string;
  fields: Record<string, string>;
  filename?: string;
}

/**
 * The observations structure, shared by the merged extraction prompt and the
 * standalone 70b prose call so both produce an identical block shape.
 */
/**
 * The model writes ONLY these two prose sections.
 *
 * Customer, tech, asset ID, valve, actuator and scope are extracted fields, and
 * buildObservationsHtml (src/lib/exports/iris.ts) renders them deterministically
 * above whatever comes back from here. The model used to emit the equipment line
 * too, which let it describe a valve the asset record contradicted. Keeping it
 * out of the header is what makes that impossible rather than merely unlikely.
 */
const OBSERVATIONS_STRUCTURE = `<p><strong>Findings:</strong></p>
<p>&bull; <strong>[Component]:</strong> [condition found — one clause, not a sentence]</p>
<p>&bull; <strong>[Component]:</strong> [condition found, or "Worn &rarr; Replaced"]</p>
<p><br></p>
<p><strong>Corrective Action:</strong></p>
<p>&bull; [what was actually done]</p>
<p>&bull; [what was actually done]</p>
<p><br></p>
<p><strong>Test Data:</strong></p>
<p>&bull; <strong>[Test name]:</strong> [pressure/class/duration and PASS or FAIL]</p>
<p>&bull; <strong>[Test name]:</strong> [result]</p>`;

function buildPrompt(
  fields: Array<{ key: string; desc: string }>,
  rawText: string,
  examples: TrainingExample[],
  rules: string[] = [],
  withObservations = false,
): string {
  const fieldList = fields.map((f) => `- "${f.key}": ${f.desc}`).join("\n");

  // User correction rules block (each truncated to keep tokens bounded)
  const rulesBlock = rules
    .map((r) => r.trim().slice(0, 300))
    .filter(Boolean)
    .map((r) => `- ${r}`)
    .join("\n");

  // Few-shot examples block. One example only: every example costs prompt
  // tokens on EVERY extraction forever, and against a 6000 TPM ceiling that
  // budget is better spent on the report being read than on a second sample
  // of the same fixed template.
  const EXAMPLE_COUNT = 1;
  const EXAMPLE_TEXT_CHARS = 900;
  let examplesBlock = "";
  for (const ex of examples.slice(0, EXAMPLE_COUNT)) {
    const nonEmpty = Object.fromEntries(
      Object.entries(ex.fields).filter(([, v]) => v?.trim()),
    );
    if (!Object.keys(nonEmpty).length) continue;
    examplesBlock += `
--- EXAMPLE${ex.filename ? ` (${ex.filename})` : ""} ---
PDF text:
${ex.rawText.slice(0, EXAMPLE_TEXT_CHARS)}

Correct extraction:
${JSON.stringify(nonEmpty)}

`;
  }

  // Give the report text whatever budget is left after the fixed blocks and
  // the output reservation. This is what makes a 413 structurally impossible:
  // the request is sized to the cap instead of hoping it fits.
  const fixedChars =
    fieldList.length +
    rulesBlock.length +
    examplesBlock.length +
    (withObservations ? OBSERVATIONS_STRUCTURE.length + 400 : 0) +
    600; // prompt scaffolding + system message
  const reserved =
    estimateTokens("x".repeat(fixedChars)) +
    (withObservations ? MAX_OUT_MERGED : MAX_OUT_FIELDS) +
    TPM_SAFETY_MARGIN;
  const rawTextTokenBudget = Math.max(0, TPM_LIMIT - reserved);
  // Also keep the previous hard ceiling — never send more than we used to.
  const newTextLimit = Math.min(examplesBlock ? 6000 : 9000, rawTextTokenBudget * 4);

  return `You are extracting data from an Applied Control repair report PDF.

Fields to extract:
${fieldList}
${
  rulesBlock
    ? `
User correction rules — follow these strictly, they override your defaults:
${rulesBlock}
`
    : ""
}${
  examplesBlock
    ? `
Here are real examples showing how to read these reports correctly:
${examplesBlock}
Now extract from this NEW report using the same format:`
    : ""
}

PDF text:
${rawText.slice(0, newTextLimit)}
${
  withObservations
    ? `
Also write an "observationsHtml" block summarising this SAME report text, using
EXACTLY this structure:

${OBSERVATIONS_STRUCTURE}

Observations rules:
- Use ONLY information found in the report text above. Never invent findings.
- Do NOT write customer, technician, asset ID, valve, actuator or scope lines.
  Those are rendered separately from extracted data and will be duplicated.
  Start at "Findings:".
- [Component] is whatever the report actually names (Valve, Disc/Seat, Gasket
  Surface, Actuator, Bushings, Packing, Trim, Seat Ring...). Not a fixed list.
  Use one bullet per component; omit the section if the report has none.
- Keep bullets terse: a clause, not a sentence. "Worn &rarr; Replaced" over
  "The bushings were found to be worn and were subsequently replaced."
- Only <p>, <strong> and <br> tags. No markdown, no code fences, no <ul>/<li>.
- Encode & as &amp; inside text content.
`
    : ""
}
Return a JSON object with the field keys listed above${withObservations ? `, plus an "observationsHtml" key holding the HTML block as a single string` : ""}. Use "" for any field not found.
Do not guess or invent values — only extract what is clearly present in the text.`;
}

/**
 * Standalone prose prompt for the 70b model. Only used for the on-demand
 * "Write with AI" upgrade — the normal per-file path gets observations from
 * the merged extraction call instead, which reads the document once.
 */
function buildObservationsPrompt(rawText: string): string {
  return `You are analyzing a valve repair report. Generate an HTML observations block for the Iris asset management system.

Use EXACTLY this structure:

${OBSERVATIONS_STRUCTURE}

Rules:
- Use ONLY information found in the repair report text. Never invent or guess findings.
- Do NOT write customer, technician, asset ID, valve, actuator or scope lines.
  Those are rendered separately from extracted data and would be duplicated.
  Start at "Findings:".
- [Component] is whatever the report actually names (Valve, Disc/Seat, Gasket
  Surface, Actuator, Bushings, Packing, Trim, Seat Ring...). Not a fixed list.
  One bullet per component; omit a section entirely if the report has nothing for it.
- Keep bullets terse: a clause, not a sentence. "Worn &rarr; Replaced" over
  "The bushings were found to be worn and were subsequently replaced."
- No markdown, no code fences, no <ul>/<li> — only <p>, <strong>, and <br>.
- Encode & as &amp; inside text content.
- Return ONLY the HTML block. No explanation, no preamble.

Repair report text:
${rawText.slice(0, 8000)}`;
}

export async function POST(req: NextRequest) {
  const rateLimitHit = checkEnhanceRateLimit(req);
  if (rateLimitHit) return rateLimitHit;

  const apiKey = AI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "No AI key configured — set AI_API_KEY (or GROQ_API_KEY)" },
      { status: 503 },
    );
  }

  let body: {
    rawText?: string;
    fields?: Array<{ key: string; desc: string }>;
    examples?: TrainingExample[];
    rules?: string[];
    generateObservations?: boolean;
    withObservations?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { rawText, fields, examples = [], rules = [], generateObservations, withObservations = false } = body;

  // Guard oversized inputs to cap Groq cost and prevent abuse
  if ((rawText?.length ?? 0) > 100_000) {
    return Response.json({ error: "rawText too large" }, { status: 413 });
  }
  if ((examples?.length ?? 0) > 10) {
    return Response.json({ error: "too many examples" }, { status: 400 });
  }
  if (!Array.isArray(rules) || rules.length > 50 || rules.some((r) => typeof r !== "string")) {
    return Response.json({ error: "invalid rules" }, { status: 400 });
  }

  // ── Observations HTML generation mode ──────────────────────────────────────
  if (generateObservations) {
    if (!rawText?.trim()) {
      return Response.json({ error: "rawText is required" }, { status: 400 });
    }
    try {
      const res = await fetch(AI_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: AI_MODEL_PROSE,
          messages: [
            {
              role: "system",
              content:
                "You are a technical writer for a valve repair company. Output only the requested HTML — no markdown, no explanation.",
            },
            { role: "user", content: buildObservationsPrompt(rawText) },
          ],
          temperature: 0.1,
          max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const err = await res.text().catch(() => "");
        return Response.json(
          { error: `AI ${res.status}: ${err.slice(0, 200)}` },
          { status: 502 },
        );
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const html = data.choices?.[0]?.message?.content?.trim() ?? "";
      return Response.json({ observationsHtml: html });
    } catch (err) {
      return Response.json(
        {
          error: `Observations generation failed: ${err instanceof Error ? err.message : String(err)}`,
        },
        { status: 502 },
      );
    }
  }

  // ── Field extraction mode (existing) ───────────────────────────────────────
  if (!rawText || !fields?.length) {
    return Response.json(
      { error: "rawText and fields are required" },
      { status: 400 },
    );
  }

  const prompt = buildPrompt(fields, rawText, examples, rules, withObservations);

  try {
    const res = await fetch(AI_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a data extraction assistant. Always respond with valid JSON only — no markdown, no explanation, no code fences.",
          },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
        // Groq counts prompt + max_tokens against the TPM cap, so an oversized
        // reservation alone can 413 a request that would never have used it.
        // Real output is ~530 tokens; these keep headroom without burning budget.
        max_tokens: withObservations ? MAX_OUT_MERGED : MAX_OUT_FIELDS,
      }),
      signal: AbortSignal.timeout(withObservations ? 45_000 : 30_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return Response.json(
        { error: `AI ${res.status}: ${err.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (content == null || content.trim() === "") {
      return Response.json(
        { error: "Enhancement failed: AI returned no content" },
        { status: 502 },
      );
    }

    let extracted: Record<string, string>;
    try {
      extracted = JSON.parse(content);
    } catch {
      return Response.json(
        { error: `Enhancement failed: unexpected AI response format` },
        { status: 422 },
      );
    }

    return Response.json(extracted);
  } catch (err) {
    return Response.json(
      {
        error: `Groq request failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 },
    );
  }
}
