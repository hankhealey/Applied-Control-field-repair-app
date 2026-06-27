import type { NextRequest } from "next/server";
import { chromium } from "playwright";

export const dynamic = "force-dynamic";

const IRIS_URL = "https://iris-appliedcontrols.bluemarvel.ai";
const OLLAMA_URL = "http://localhost:11434";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ImportedAsset = {
  tag: string;
  type?: string;
  components?: {
    valve?: { manufacturer?: string; model?: string; serial?: string };
    actuator?: { manufacturer?: string; model?: string; serial?: string };
    positioner?: { manufacturer?: string; model?: string; serial?: string };
  };
};

export type ImportEvent =
  | { kind: "screenshot"; data: string }
  | { kind: "log"; level: "info" | "warn" | "error"; message: string }
  | { kind: "assets"; assets: ImportedAsset[]; total: number }
  | { kind: "done" }
  | { kind: "error"; message: string };

// ── GET — Ollama status + available models ─────────────────────────────────────

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 503 });
  }

  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) throw new Error("not ok");
    const data = (await res.json()) as {
      models?: Array<{ name: string; size: number }>;
    };
    const models = (data.models ?? []).map((m) => m.name).sort();
    return Response.json({ running: true, models });
  } catch {
    return Response.json({ running: false, models: [] });
  }
}

// ── SSE helper ─────────────────────────────────────────────────────────────────

function sse(e: ImportEvent): string {
  return `data: ${JSON.stringify(e)}\n\n`;
}

// ── Ollama chat call ───────────────────────────────────────────────────────────

async function ollamaChat(
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: false,
      format: "json",
      options: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "{}";
}

// ── Page text extraction ───────────────────────────────────────────────────────

async function getPageText(page: import("playwright").Page): Promise<string> {
  return page.evaluate(() => {
    // MUI DataGrid: prefer the grid content
    const grid = document.querySelector('[role="grid"]') as HTMLElement | null;
    if (grid?.innerText.trim()) return grid.innerText;

    const main = document.querySelector("main") as HTMLElement | null;
    if (main?.innerText.trim()) return main.innerText;

    return (document.body as HTMLElement).innerText;
  });
}

// ── POST — run import scan ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 503 });
  }

  let body: { model?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { model } = body;
  if (!model) {
    return Response.json({ error: "model is required" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(e: ImportEvent) {
        try {
          controller.enqueue(encoder.encode(sse(e)));
        } catch {}
      }

      function log(level: "info" | "warn" | "error", message: string) {
        emit({ kind: "log", level, message });
      }

      const browser = await chromium.launch({ headless: false, slowMo: 80 });

      try {
        const page = await browser.newPage();
        page.setDefaultTimeout(30_000);

        // ── Login ──────────────────────────────────────────────────────────────
        log("info", "Opening Iris…");
        await page.goto(IRIS_URL);
        await page
          .waitForLoadState("networkidle", { timeout: 15_000 })
          .catch(() => {});

        const shot = async () => {
          try {
            const buf = await page.screenshot({ type: "jpeg", quality: 55 });
            emit({ kind: "screenshot", data: buf.toString("base64") });
          } catch {}
        };

        await shot();

        if (page.url().includes("auth0.com")) {
          log(
            "info",
            "🔐 Please log into Iris in the browser window. Waiting up to 2 minutes…",
          );
          await page.waitForURL(
            (url) =>
              url.href.startsWith(IRIS_URL) && !url.href.includes("auth0.com"),
            { timeout: 120_000 },
          );
          await page
            .waitForLoadState("networkidle", { timeout: 10_000 })
            .catch(() => {});
        }

        log("info", "Logged in — navigating to Assets…");
        await shot();

        // ── Navigate to assets ─────────────────────────────────────────────────
        await page.goto(`${IRIS_URL}/assets`);
        await page
          .waitForLoadState("networkidle", { timeout: 20_000 })
          .catch(() => {});
        // Wait for MUI DataGrid to hydrate
        await page.waitForTimeout(1800);
        await shot();

        // ── Extract asset list text ────────────────────────────────────────────
        log("info", "Reading assets list…");
        const listText = await getPageText(page);

        if (!listText.trim()) {
          log(
            "warn",
            "Page appears empty — check that you are on the Assets page",
          );
          emit({ kind: "done" });
          return;
        }

        // ── Parse with Ollama ──────────────────────────────────────────────────
        log("info", `Parsing with ${model}…`);

        let assets: ImportedAsset[] = [];

        try {
          const raw = await ollamaChat(
            model,
            "You are a data extraction assistant. Always respond with valid JSON only — no markdown, no explanation.",
            `Extract all assets from this industrial equipment management system page.

Return a JSON object: { "assets": [ ... ] }

Each asset object must have:
- "tag": the asset tag/ID (e.g. "FV-4176B", "PV-100A")
- "type": equipment type if visible (e.g. "Control Valve", "Pressure Transmitter")

Include every row you can see. If you see pagination, extract all visible rows.

Page content:
${listText.slice(0, 7000)}`,
          );

          const parsed = JSON.parse(raw) as
            | ImportedAsset[]
            | { assets?: ImportedAsset[] };
          assets = Array.isArray(parsed)
            ? parsed
            : ((parsed as { assets?: ImportedAsset[] }).assets ?? []);

          // Deduplicate by tag
          const seen = new Set<string>();
          assets = assets.filter((a) => {
            if (!a.tag || seen.has(a.tag)) return false;
            seen.add(a.tag);
            return true;
          });
        } catch (err) {
          log(
            "error",
            `Ollama parse error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }

        log(
          assets.length > 0 ? "info" : "warn",
          assets.length > 0
            ? `Found ${assets.length} asset(s)`
            : "No assets extracted — try a larger model or check the page content",
        );

        emit({ kind: "assets", assets, total: assets.length });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emit({ kind: "error", message: msg });
      } finally {
        await browser.close().catch(() => {});
        emit({ kind: "done" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
