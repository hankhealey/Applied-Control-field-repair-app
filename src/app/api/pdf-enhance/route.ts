import type { NextRequest } from "next/server";
import { getIp } from "@/lib/ip";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

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
const GROQ_MODEL = "llama-3.1-8b-instant";
const GROQ_MODEL_PROSE = "llama-3.3-70b-versatile";

export async function GET() {
  const available = Boolean(process.env.GROQ_API_KEY);
  return Response.json({ available, provider: available ? "groq" : null });
}

interface TrainingExample {
  rawText: string;
  fields: Record<string, string>;
  filename?: string;
}

function buildPrompt(
  fields: Array<{ key: string; desc: string }>,
  rawText: string,
  examples: TrainingExample[],
  rules: string[] = [],
): string {
  const fieldList = fields.map((f) => `- "${f.key}": ${f.desc}`).join("\n");

  // User correction rules block (each truncated to keep tokens bounded)
  const rulesBlock = rules
    .map((r) => r.trim().slice(0, 300))
    .filter(Boolean)
    .map((r) => `- ${r}`)
    .join("\n");

  // Few-shot examples block (max 3, truncate each to keep tokens reasonable)
  let examplesBlock = "";
  for (const ex of examples.slice(0, 3)) {
    const nonEmpty = Object.fromEntries(
      Object.entries(ex.fields).filter(([, v]) => v?.trim()),
    );
    if (!Object.keys(nonEmpty).length) continue;
    examplesBlock += `
--- EXAMPLE${ex.filename ? ` (${ex.filename})` : ""} ---
PDF text:
${ex.rawText.slice(0, 2500)}

Correct extraction:
${JSON.stringify(nonEmpty, null, 2)}

`;
  }

  // Shrink new PDF text if examples are taking space
  const newTextLimit = examples.length > 0 ? 6000 : 9000;

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

Return a JSON object with the field keys listed above. Use "" for any field not found.
Do not guess or invent values — only extract what is clearly present in the text.`;
}

function buildObservationsPrompt(rawText: string): string {
  return `You are analyzing a valve repair report. Generate an HTML observations block for the Iris asset management system.

Use EXACTLY this structure (omit any component line if that component is not mentioned in the report):

<p><strong>Observations &amp; Findings</strong></p>
<p>Body: [1-2 sentences: condition found and work done to valve body/bonnet]</p>
<p>Trim: [1-2 sentences: condition found and work done to trim/plug/stem/seat/cage]</p>
<p>Actuator: [1-2 sentences: condition found and work done to actuator]</p>
<p>Positioner: [1-2 sentences: condition found and work done to positioner/DVC]</p>
<p>Tubing / Airset: [1-2 sentences: condition found and work done to tubing, air filter regulator]</p>
<p><br></p>
<p><strong>Work Performed Summary</strong></p>
<p>Body – As Found: [brief condition] | Action: [brief action] | As Left: [brief result]</p>
<p>Trim – As Found: [brief condition] | Action: [brief action] | As Left: [brief result]</p>
<p>Actuator – As Found: [brief condition] | Action: [brief action] | As Left: [brief result]</p>
<p>Positioner – As Found: [brief condition] | Action: [brief action] | As Left: [brief result]</p>
<p>Tubing / Airset – As Found: [brief condition] | Action: [brief action] | As Left: [brief result]</p>

Rules:
- Use ONLY information found in the repair report text. Never invent or guess findings.
- Omit any component line (from both sections) if that component is not mentioned.
- No markdown, no extra HTML tags, no code fences — only <p>, <strong>, and <br>.
- Encode & as &amp; inside text content.
- Return ONLY the HTML block. No explanation, no preamble.

Repair report text:
${rawText.slice(0, 8000)}`;
}

export async function POST(req: NextRequest) {
  const rateLimitHit = checkEnhanceRateLimit(req);
  if (rateLimitHit) return rateLimitHit;

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "GROQ_API_KEY not configured" },
      { status: 503 },
    );
  }

  let body: {
    rawText?: string;
    fields?: Array<{ key: string; desc: string }>;
    examples?: TrainingExample[];
    rules?: string[];
    generateObservations?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { rawText, fields, examples = [], rules = [], generateObservations } = body;

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
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL_PROSE,
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
          { error: `Groq ${res.status}: ${err.slice(0, 200)}` },
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

  const prompt = buildPrompt(fields, rawText, examples, rules);

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
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
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return Response.json(
        { error: `Groq ${res.status}: ${err.slice(0, 200)}` },
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
