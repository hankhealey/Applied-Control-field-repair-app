import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Page } from "playwright";
import { chromium } from "playwright";
import type { NextRequest } from "next/server";
import type { RepairFinding, RepairReport } from "@/lib/types";

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
};

export type IrisSyncReportPayload = {
  report: RepairReport;
  findings: RepairFinding[];
  pdfBase64: string;
  pdfFilename: string;
};

// ── SSE helper ────────────────────────────────────────────────────────────────

function sse(event: SyncEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ── Observations text builder ─────────────────────────────────────────────────

function buildObservations(r: RepairReport, findings: RepairFinding[]): string {
  const lines: string[] = [];

  if (findings.length > 0) {
    lines.push("Observations & Findings");
    for (const f of findings) {
      if (f.conditionFound) {
        lines.push(`${f.componentName}: ${f.conditionFound}`);
      }
    }
    lines.push("");

    lines.push("Work Performed Summary");
    for (const f of findings) {
      const parts = [`${f.componentName}`];
      if (f.conditionFound) parts.push(`As Found: ${f.conditionFound}`);
      if (f.recommendedAction) parts.push(`Action: ${f.recommendedAction}`);
      if (f.asLeftAction) parts.push(`As Left: ${f.asLeftAction}`);
      lines.push(parts.join(" | "));
    }
    lines.push("");
  }

  if (r.scopeOfWork) {
    lines.push("Scope of Work");
    lines.push(r.scopeOfWork);
    lines.push("");
  }

  if (r.recommendations) {
    lines.push("Recommendations");
    lines.push(r.recommendations);
    lines.push("");
  }

  if (r.notes) {
    lines.push("Notes");
    lines.push(r.notes);
  }

  return lines.join("\n").trim();
}

// ── Login ─────────────────────────────────────────────────────────────────────

const IRIS_URL = "https://iris-appliedcontrols.bluemarvel.ai";

async function login(
  page: Page,
  irisUser: string,
  irisPassword: string,
): Promise<void> {
  await page.goto(IRIS_URL);
  // Redirects to Auth0 Universal Login
  await page.waitForURL(/auth0\.com/, { timeout: 15_000 });

  await page.fill('input[name="username"]', irisUser);
  await page.fill('input[name="password"]', irisPassword);
  await page.click('button[type="submit"]');

  // Wait for redirect back to Iris
  await page.waitForURL(`${IRIS_URL}/**`, { timeout: 20_000 }).catch(() => {
    // Some Auth0 setups redirect to root
    return page.waitForURL(IRIS_URL, { timeout: 10_000 });
  });

  // Confirm we're logged in (not on an error page)
  if (page.url().includes("auth0.com")) {
    throw Object.assign(new Error("Login failed — check Iris credentials"), {
      errorType: "ABORT_BATCH",
    });
  }
}

// ── Navigate to assets page ───────────────────────────────────────────────────

async function goToAssets(page: Page): Promise<void> {
  await page.goto(`${IRIS_URL}/assets`);
  await page.waitForLoadState("networkidle", { timeout: 20_000 });

  // Fallback: if the URL didn't change to /assets, try clicking the sidebar
  if (!page.url().includes("/assets")) {
    // Look for the Assets sidebar link (aria-label or link text)
    const assetNav = page
      .getByRole("link", { name: /assets/i })
      .or(page.locator('nav a[href*="asset"]'))
      .first();

    if (await assetNav.count() > 0) {
      await assetNav.click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
    }
  }
}

// ── Find or create asset ──────────────────────────────────────────────────────

async function findOrCreateAsset(
  page: Page,
  report: RepairReport,
  emit: (e: SyncEvent) => void,
): Promise<void> {
  const tag = report.tagOrUnit;
  emit({
    report: report.id,
    step: "asset_find",
    status: "info",
    message: `Searching for asset "${tag}"`,
  });

  await goToAssets(page);

  // Try to find asset link in the table
  const assetLink = page
    .getByRole("link", { name: new RegExp(`^${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) })
    .first();

  if (await assetLink.count() > 0) {
    emit({
      report: report.id,
      step: "asset_find",
      status: "ok",
      message: `Found asset "${tag}"`,
    });
    await assetLink.click();
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    return;
  }

  // Asset not found — search first in case of pagination
  const searchInput = page
    .getByPlaceholder(/search/i)
    .or(page.locator('input[type="search"]'))
    .or(page.locator('input[placeholder*="filter" i]'))
    .first();

  if (await searchInput.count() > 0) {
    await searchInput.fill(tag);
    await page.waitForTimeout(800); // debounce
    const filtered = page.getByRole("link", { name: new RegExp(`^${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) }).first();
    if (await filtered.count() > 0) {
      emit({
        report: report.id,
        step: "asset_find",
        status: "ok",
        message: `Found asset "${tag}" via search`,
      });
      await filtered.click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      return;
    }
  }

  // Not found — create it
  emit({
    report: report.id,
    step: "asset_create",
    status: "info",
    message: `Asset "${tag}" not found, creating…`,
  });

  // Click the top-level ACTIONS button on the assets page
  await page.getByRole("button", { name: "ACTIONS" }).first().click();
  await page.waitForTimeout(300);

  // Click "Create asset" in the dropdown
  await page
    .getByRole("menuitem", { name: /create.?asset/i })
    .or(page.getByText("Create asset", { exact: false }))
    .first()
    .click();

  // Wait for the Create asset modal
  await page.waitForSelector('text=Create asset', { timeout: 10_000 });

  // Fill Tag field (the label is "Tag")
  await page.getByLabel("Tag").fill(tag);

  // Asset type is already "Control Valve" by default — skip if OK
  // If you need a different type, set it here:
  // await page.getByLabel('Asset type').selectOption('Control Valve');

  // Service description (optional)
  if (report.scopeOfWork) {
    const svcDesc = page.getByLabel(/service.?description/i).first();
    if (await svcDesc.count() > 0) {
      await svcDesc.fill(report.scopeOfWork.slice(0, 200));
    }
  }

  // Click CREATE AND OPEN
  await page.getByRole("button", { name: /create.?and.?open/i }).first().click();
  await page.waitForLoadState("networkidle", { timeout: 20_000 });

  emit({
    report: report.id,
    step: "asset_create",
    status: "ok",
    message: `Asset "${tag}" created`,
  });
}

// ── Update component specs ────────────────────────────────────────────────────

async function updateComponents(
  page: Page,
  report: RepairReport,
  emit: (e: SyncEvent) => void,
): Promise<void> {
  emit({
    report: report.id,
    step: "specs",
    status: "info",
    message: "Updating component specs",
  });

  // Map: [Iris component label, manufacturer, model, serial]
  const components: [string, string, string, string][] = [];

  if (report.valveMake || report.valveModelSize || report.valveSerialNumber) {
    components.push(["Valve", report.valveMake, report.valveModelSize, report.valveSerialNumber]);
  }
  if (report.actuatorMake || report.actuatorModelSize || report.actuatorSerialNumber) {
    components.push(["Actuator", report.actuatorMake, report.actuatorModelSize, report.actuatorSerialNumber]);
  }
  if (report.positionerMake || report.positionerModelAction || report.positionerSerialNumber) {
    components.push(["Device 1", report.positionerMake, report.positionerModelAction, report.positionerSerialNumber]);
  }

  for (const [label, manufacturer, model, serial] of components) {
    // Find the row for this component type in the table
    const row = page.locator("tr", { hasText: label }).first();

    if (await row.count() > 0) {
      // Click the three-dot menu on this row
      const threeDotsBtn = row
        .getByRole("button", { name: /more|menu|options/i })
        .or(row.locator('button[aria-haspopup]'))
        .or(row.locator('button:has-text("⋮"), button:has-text("…")'))
        .first();

      await threeDotsBtn.click();
      await page.waitForTimeout(300);

      // Click Edit
      await page
        .getByRole("menuitem", { name: /edit/i })
        .or(page.getByText("Edit", { exact: true }))
        .first()
        .click();
    } else {
      // Component row doesn't exist — add via ACTIONS
      const compSection = page
        .locator("section, div")
        .filter({ hasText: "Components and Specifications" })
        .first();

      await compSection
        .getByRole("button", { name: "ACTIONS" })
        .click();
      await page.waitForTimeout(300);

      await page
        .getByRole("menuitem", { name: /add.?component/i })
        .or(page.getByText("Add component", { exact: false }))
        .first()
        .click();

      // Select the component type from a dropdown
      const typeSelect = page
        .getByLabel(/component.?type/i)
        .or(page.getByRole("combobox").first());
      await typeSelect.click();
      await page
        .getByRole("option", { name: label })
        .click();
    }

    // Fill in the edit/add form fields
    await page.waitForTimeout(300);

    const mfrField = page.getByLabel(/manufacturer/i).last();
    if (await mfrField.count() > 0 && manufacturer) {
      await mfrField.clear();
      await mfrField.fill(manufacturer);
    }

    const modelField = page.getByLabel(/^model$/i).last();
    if (await modelField.count() > 0 && model) {
      await modelField.clear();
      await modelField.fill(model);
    }

    const serialField = page.getByLabel(/serial.?number/i).last();
    if (await serialField.count() > 0 && serial) {
      await serialField.clear();
      await serialField.fill(serial);
    }

    // Save
    await page
      .getByRole("button", { name: /^save$/i })
      .or(page.getByRole("button", { name: /confirm|update/i }))
      .first()
      .click();

    await page.waitForLoadState("networkidle", { timeout: 10_000 });
  }

  emit({
    report: report.id,
    step: "specs",
    status: "ok",
    message: `Updated ${components.length} component(s)`,
  });
}

// ── Create record ─────────────────────────────────────────────────────────────

async function createRecord(
  page: Page,
  report: RepairReport,
  findings: RepairFinding[],
  emit: (e: SyncEvent) => void,
): Promise<void> {
  emit({
    report: report.id,
    step: "report_create",
    status: "info",
    message: "Creating Iris record",
  });

  // Click RECORDS tab at the bottom of the asset page
  await page.getByRole("tab", { name: /records/i }).click();
  await page.waitForTimeout(500);

  // Click the button to create a new record.
  // Try ACTIONS button first, then a direct "Create record" button.
  const recordsActions = page
    .getByRole("button", { name: "ACTIONS" })
    .last();

  if (await recordsActions.count() > 0) {
    await recordsActions.click();
    await page.waitForTimeout(300);
    await page
      .getByRole("menuitem", { name: /create.?record/i })
      .or(page.getByText("Create record", { exact: false }))
      .first()
      .click();
  } else {
    await page
      .getByRole("button", { name: /create.?record/i })
      .or(page.getByRole("link", { name: /create.?record/i }))
      .first()
      .click();
  }

  // Modal: "Create record for asset: <tag>"
  await page.waitForSelector("text=Create record for asset", { timeout: 10_000 });

  // Select Type = Preventative
  const typeDropdown = page.getByLabel("Type").or(page.getByRole("combobox")).first();
  await typeDropdown.click();
  await page.waitForTimeout(300);
  await page
    .getByRole("option", { name: /preventative/i })
    .or(page.getByText("Preventative", { exact: false }))
    .first()
    .click();

  // Click CREATE AND OPEN
  await page.getByRole("button", { name: /create.?and.?open/i }).first().click();

  // Wait for the record detail page to load
  await page.waitForLoadState("networkidle", { timeout: 20_000 });

  // ── Now fill in the record detail fields ───────────────────────────────────

  // Occurrence date (repair date)
  if (report.repairDate) {
    const dateField = page
      .getByLabel(/occurrence.?date/i)
      .or(page.locator('input[placeholder="YYYY-MM-DD"]'))
      .first();
    if (await dateField.count() > 0) {
      await dateField.fill(report.repairDate);
    }
  }

  // Ref. WO/MOC — use emrReference, fallback to crmodReference
  const woRef = report.emrReference || report.crmodReference || "";
  if (woRef) {
    const refField = page
      .getByLabel(/ref.*wo|wo.*moc|work.?order/i)
      .or(page.locator('input[placeholder*="WO"]'))
      .first();
    if (await refField.count() > 0) {
      await refField.fill(woRef);
    }
  }

  // Observations (rich text editor)
  const obsText = buildObservations(report, findings);
  if (obsText) {
    // The rich text editor is a contenteditable div
    const obsEditor = page
      .locator('[contenteditable="true"]')
      .or(page.locator(".ProseMirror, .ql-editor, .DraftEditor-root"))
      .first();

    if (await obsEditor.count() > 0) {
      await obsEditor.click();
      // Select all and replace
      await page.keyboard.press("Control+a");
      await obsEditor.fill(obsText);
    }
  }

  // Save the record (look for a Save button; some editors auto-save)
  const saveBtn = page
    .getByRole("button", { name: /^save$/i })
    .or(page.getByRole("button", { name: /save.?record/i }))
    .first();

  if (await saveBtn.count() > 0) {
    await saveBtn.click();
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
  }

  emit({
    report: report.id,
    step: "report_create",
    status: "ok",
    message: "Record created and filled",
  });
}

// ── Attach PDF ────────────────────────────────────────────────────────────────

async function attachPdf(
  page: Page,
  report: RepairReport,
  pdfPath: string,
  emit: (e: SyncEvent) => void,
): Promise<void> {
  emit({
    report: report.id,
    step: "pdf_attach",
    status: "info",
    message: "Attaching PDF",
  });

  // Click ATTACHMENTS tab
  await page.getByRole("tab", { name: /attachments/i }).click();
  await page.waitForTimeout(500);

  // Click ACTIONS → upload or click the upload button directly
  const attachActions = page
    .getByRole("button", { name: "ACTIONS" })
    .last();

  let fileInput: ReturnType<Page["locator"]> | null = null;

  // Check if there's a direct file input visible
  const directInput = page.locator('input[type="file"]').first();
  if (await directInput.count() > 0) {
    fileInput = directInput;
  } else if (await attachActions.count() > 0) {
    // Use the file chooser approach (works regardless of how the dialog opens)
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 10_000 }),
      (async () => {
        await attachActions.click();
        await page.waitForTimeout(300);
        await page
          .getByRole("menuitem", { name: /upload|add.?file|attach/i })
          .or(page.getByText("Upload", { exact: false }))
          .first()
          .click();
      })(),
    ]);
    await chooser.setFiles(pdfPath);
    await page.waitForLoadState("networkidle", { timeout: 20_000 });

    emit({
      report: report.id,
      step: "pdf_attach",
      status: "ok",
      message: "PDF attached",
    });
    return;
  }

  // Fallback: set files on any visible file input
  if (fileInput && await fileInput.count() > 0) {
    await fileInput.setInputFiles(pdfPath);
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
  }

  emit({
    report: report.id,
    step: "pdf_attach",
    status: "ok",
    message: "PDF attached",
  });
}

// ── Sync one report ───────────────────────────────────────────────────────────

async function syncOneReport(
  page: Page,
  payload: IrisSyncReportPayload,
  emit: (e: SyncEvent) => void,
): Promise<void> {
  const { report, findings, pdfBase64, pdfFilename } = payload;

  // Write PDF to temp file
  const tmpDir = os.tmpdir();
  const pdfPath = path.join(tmpDir, `iris-sync-${report.id}-${pdfFilename}`);
  fs.writeFileSync(pdfPath, Buffer.from(pdfBase64, "base64"));

  try {
    await findOrCreateAsset(page, report, emit);
    await updateComponents(page, report, emit);
    await createRecord(page, report, findings, emit);
    await attachPdf(page, report, pdfPath, emit);

    emit({ report: report.id, step: "done", status: "ok" });
  } finally {
    // Clean up temp PDF
    try { fs.unlinkSync(pdfPath); } catch {}
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new Response(
      JSON.stringify({
        error:
          "Iris Sync is a local-only feature. Run the app with npm run dev on your local machine.",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  let body: {
    irisUser?: string;
    irisPassword?: string;
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

  const { irisUser, irisPassword, reports } = body;

  if (!irisUser || !irisPassword) {
    return new Response(
      JSON.stringify({ error: "Missing irisUser or irisPassword" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  if (!Array.isArray(reports) || reports.length === 0) {
    return new Response(JSON.stringify({ error: "No reports to sync" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: SyncEvent) {
        try {
          controller.enqueue(encoder.encode(sse(event)));
        } catch {}
      }

      const browser = await chromium.launch({
        headless: false, // Tech can watch it run
        slowMo: 200,    // Slight delay so pages don't mis-fire
      });

      let synced = 0;
      let skipped = 0;

      try {
        const page = await browser.newPage();
        page.setDefaultTimeout(30_000);

        // Login once for the whole batch
        emit({
          report: "system",
          step: "asset_find",
          status: "info",
          message: "Logging into Iris…",
        });

        try {
          await login(page, irisUser, irisPassword);
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

        // Process each report
        for (const payload of reports) {
          try {
            await syncOneReport(page, payload, emit);
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
        await browser.close();

        emit({
          report: "system",
          step: "done",
          status: "ok",
          message: `Batch complete.`,
          synced,
          skipped,
          total: reports.length,
        });

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
