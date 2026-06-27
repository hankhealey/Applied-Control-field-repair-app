import type { NextRequest } from "next/server";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.1-8b-instant";

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
): string {
  const fieldList = fields.map((f) => `- "${f.key}": ${f.desc}`).join("\n");

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

export async function POST(req: NextRequest) {
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
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { rawText, fields, examples = [] } = body;
  if (!rawText || !fields?.length) {
    return Response.json(
      { error: "rawText and fields are required" },
      { status: 400 },
    );
  }

  const prompt = buildPrompt(fields, rawText, examples);

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
    const content = data.choices?.[0]?.message?.content ?? "{}";

    let extracted: Record<string, string>;
    try {
      extracted = JSON.parse(content);
    } catch {
      return Response.json(
        { error: `Could not parse Groq response: ${content.slice(0, 80)}` },
        { status: 502 },
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
