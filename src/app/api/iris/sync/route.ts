import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { NextRequest } from "next/server";
import type { Browser } from "playwright";
import { chromium } from "playwright";
import type { RepairFinding, RepairReport } from "@/lib/types";
import { sse } from "./playwright-helpers";
import { login } from "./iris-steps/login";
import { selectSite } from "./iris-steps/site";
import { findOrCreateAsset } from "./iris-steps/asset";
import { updateComponents } from "./iris-steps/specs";
import { createRecord } from "./iris-steps/record";
import { attachPdf } from "./iris-steps/pdf-attach";

export const dynamic = "force-dynamic";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SyncEventStep =
  | "asset_find"
  | "asset_create"
  | "specs"
  | "report_create"
  | "pdf_attach"
  | "done"
  | "error"
  | "skip";

export type SyncEvent = {
  report: string;
  step: SyncEventStep;
  status: "ok" | "error" | "skip" | "info";
  message?: string;
  errorType?: "TRANSIENT" | "SKIP_REPORT" | "ABORT_BATCH";
  synced?: number;
  skipped?: number;
  total?: number;
  screenshot?: string; // base64 JPEG for live preview
};

export type IrisSyncReportPayload = {
  report: RepairReport;
  findings: RepairFinding[];
  pdfBase64: string;
  pdfFilename: string;
};

// ── Sync one report ───────────────────────────────────────────────────────────

async function syncOneReport(
  page: import("playwright").Page,
  payload: IrisSyncReportPayload,
  emit: (e: SyncEvent) => void,
  abort: { requested: boolean },
): Promise<void> {
  const { report, findings, pdfBase64, pdfFilename } = payload;

  const pdfPath = path.join(
    os.tmpdir(),
    `iris-sync-${report.id}-${pdfFilename}`,
  );
  fs.writeFileSync(pdfPath, Buffer.from(pdfBase64, "base64"));

  try {
    await findOrCreateAsset(page, report, emit, abort);
    await updateComponents(page, report, emit, abort);
    await createRecord(page, report, findings, emit, abort);
    await attachPdf(page, report, pdfPath, emit, abort);
    emit({ report: report.id, step: "done", status: "ok" });
  } finally {
    try {
      fs.unlinkSync(pdfPath);
    } catch {}
  }
}

// ── Route handlers ────────────────────────────────────────────────────────────

// Keeps a reference to the running browser so the stop endpoint can kill it
let activeBrowser: Browser | null = null;

export async function DELETE() {
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 503 });
  }
  if (activeBrowser) {
    await activeBrowser.close().catch(() => {});
    activeBrowser = null;
  }
  return new Response(null, { status: 204 });
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new Response(
      JSON.stringify({
        error:
          "Iris Sync is a local-only feature. Run the app with npm run dev.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: {
    irisCustomer?: string;
    irisSite?: string;
    reports?: IrisSyncReportPayload[];
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { irisCustomer = "", irisSite = "", reports } = body;

  if (!Array.isArray(reports) || reports.length === 0)
    return new Response(JSON.stringify({ error: "No reports to sync" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });

  const encoder = new TextEncoder();
  const abort = { requested: false };

  req.signal.addEventListener("abort", () => {
    abort.requested = true;
  });

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: SyncEvent) {
        try {
          controller.enqueue(encoder.encode(sse(event)));
        } catch {}
      }

      const browser = await chromium.launch({ headless: false, slowMo: 150 });
      activeBrowser = browser;

      let synced = 0;
      let skipped = 0;

      try {
        const page = await browser.newPage();
        page.setDefaultTimeout(30_000);

        emit({
          report: "system",
          step: "asset_find",
          status: "info",
          message: "Logging into Iris…",
        });

        try {
          await login(page, emit);
          await selectSite(page, irisCustomer, irisSite, emit);
        } catch (err) {
          emit({
            report: "system",
            step: "error",
            status: "error",
            message: `Login failed: ${err instanceof Error ? err.message : String(err)}`,
            errorType: "ABORT_BATCH",
          });
          return;
        }

        emit({
          report: "system",
          step: "asset_find",
          status: "ok",
          message: `Logged in. Processing ${reports.length} report(s)…`,
        });

        for (const payload of reports) {
          if (abort.requested) {
            emit({
              report: "system",
              step: "error",
              status: "info",
              message: "Sync stopped by user.",
            });
            break;
          }
          try {
            await syncOneReport(page, payload, emit, abort);
            synced++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const errorType =
              (err as { errorType?: string }).errorType === "ABORT_BATCH"
                ? "ABORT_BATCH"
                : "SKIP_REPORT";
            emit({
              report: payload.report.id,
              step: "error",
              status: "error",
              message: msg,
              errorType,
            });
            if (errorType === "ABORT_BATCH") break;
            skipped++;
          }
        }
      } finally {
        await browser.close().catch(() => {});
        activeBrowser = null;
        emit({
          report: "system",
          step: "done",
          status: "ok",
          message: "Batch complete.",
          synced,
          skipped,
          total: reports.length,
        });
        controller.close();
      }
    },

    cancel() {
      abort.requested = true;
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
