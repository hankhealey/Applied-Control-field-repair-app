import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { NextRequest } from "next/server";
import type { Browser, Page } from "playwright";
import { chromium } from "playwright";
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
  screenshot?: string; // base64 PNG for live preview
};

export type IrisSyncReportPayload = {
  report: RepairReport;
  findings: RepairFinding[];
  pdfBase64: string;
  pdfFilename: string;
};

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sse(event: SyncEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

// ── Observations text builder ─────────────────────────────────────────────────

function buildObservations(r: RepairReport, findings: RepairFinding[]): string {
  const lines: string[] = [];

  if (findings.length > 0) {
    lines.push("Observations & Findings");
    for (const f of findings) {
      if (f.conditionFound)
        lines.push(`${f.componentName}: ${f.conditionFound}`);
    }
    lines.push("");
    lines.push("Work Performed Summary");
    for (const f of findings) {
      const parts = [f.componentName];
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

// ── Screenshot helper ─────────────────────────────────────────────────────────

async function emitScreenshot(
  page: Page,
  emit: (e: SyncEvent) => void,
): Promise<void> {
  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 60 });
    emit({
      report: "system",
      step: "asset_find",
      status: "info",
      screenshot: buf.toString("base64"),
    });
  } catch {
    // Non-fatal — screenshot failed during navigation
  }
}

// ── ACTIONS menu helper ───────────────────────────────────────────────────────
// Iris uses MUI DataGrid toolbars. The button label may vary in casing and the
// button may be inside a specific toolbar section. Tries several patterns and
// emits a screenshot first so we can see the page state if it fails.

async function clickActionsMenu(
  page: Page,
  emit: (e: SyncEvent) => void,
  scope?: import("playwright").Locator,
): Promise<void> {
  await emitScreenshot(page, emit);

  const root = scope ?? page;

  // Try visible button with any casing of "ACTIONS", then common icon-only fallbacks
  const btn = root
    .getByRole("button", { name: /^actions$/i })
    .or(root.locator('button:has-text("ACTIONS"), button:has-text("Actions"), button:has-text("actions")'))
    .first();

  await btn.waitFor({ state: "visible", timeout: 10_000 });
  await btn.click();
  await page.waitForTimeout(300);
}

// ── Login ─────────────────────────────────────────────────────────────────────

const IRIS_URL = "https://iris-appliedcontrols.bluemarvel.ai";

async function login(page: Page, emit: (e: SyncEvent) => void): Promise<void> {
  await page.goto(IRIS_URL);
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {});

  await emitScreenshot(page, emit);

  // Already logged in — nothing to do.
  if (!page.url().includes("auth0.com")) {
    return;
  }

  // Auth0 is showing — ask the user to log in manually in the browser window.
  emit({
    report: "system",
    step: "asset_find",
    status: "info",
    message:
      "🔐 Please log into Iris in the browser window that just opened. Waiting up to 2 minutes…",
  });

  // Wait for navigation to land back on Iris (user completes login).
  await page.waitForURL(
    (url) => url.href.startsWith(IRIS_URL) && !url.href.includes("auth0.com"),
    { timeout: 120_000 },
  );

  await page
    .waitForLoadState("networkidle", { timeout: 10_000 })
    .catch(() => {});

  if (page.url().includes("auth0.com")) {
    throw Object.assign(
      new Error(
        "Login timed out — please try again and complete login within 2 minutes",
      ),
      { errorType: "ABORT_BATCH" },
    );
  }

  await emitScreenshot(page, emit);
}

// ── Select customer + site ────────────────────────────────────────────────────

async function selectSite(
  page: Page,
  irisCustomer: string,
  irisSite: string,
  emit: (e: SyncEvent) => void,
): Promise<void> {
  if (!irisCustomer && !irisSite) return;

  emit({
    report: "system",
    step: "asset_find",
    status: "info",
    message: `Selecting site: ${irisCustomer} → ${irisSite}`,
  });

  // Customer dropdown — always re-query; don't cache across selections because
  // MUI remounts the site combobox after the customer changes.
  if (irisCustomer) {
    const customerDropdown = page.getByRole("combobox").first();
    await customerDropdown.waitFor({ state: "visible", timeout: 10_000 });
    await customerDropdown.click();
    await page.waitForTimeout(500);

    const customerOption = page
      .getByRole("option", { name: new RegExp(irisCustomer, "i") })
      .or(page.getByText(irisCustomer, { exact: false }).first())
      .first();

    if ((await customerOption.count()) > 0) {
      await customerOption.click();
    } else {
      // Dismiss open dropdown and continue — don't abort the whole batch
      await page.keyboard.press("Escape");
      emit({
        report: "system",
        step: "asset_find",
        status: "info",
        message: `Customer "${irisCustomer}" not found in dropdown — skipping site filter`,
      });
    }

    // Wait for the page to settle and the site dropdown to become enabled
    await page
      .waitForLoadState("networkidle", { timeout: 10_000 })
      .catch(() => {});
    await page.waitForTimeout(600);
    await emitScreenshot(page, emit);
  }

  // Site dropdown — must be re-queried AFTER customer settles because MUI
  // remounts or disables it while loading the filtered site list.
  if (irisSite) {
    // The site dropdown is the second combobox; wait for it to be enabled
    const siteDropdown = page.getByRole("combobox").nth(1);
    await siteDropdown
      .waitFor({ state: "visible", timeout: 10_000 })
      .catch(() => {});

    if ((await siteDropdown.count()) === 0) {
      emit({
        report: "system",
        step: "asset_find",
        status: "info",
        message: "Site dropdown not found — continuing without site filter",
      });
    } else {
      // Wait for it to be enabled (not disabled while loading options)
      await page.waitForFunction(
        () => {
          const combos = document.querySelectorAll('[role="combobox"]');
          const el = combos[1] as HTMLElement | undefined;
          return el && !el.hasAttribute("disabled") && el.getAttribute("aria-disabled") !== "true";
        },
        { timeout: 10_000 },
      ).catch(() => {});

      await emitScreenshot(page, emit);
      await siteDropdown.click();
      await page.waitForTimeout(600);

      const siteOption = page
        .getByRole("option", { name: new RegExp(irisSite, "i") })
        .or(page.getByText(irisSite, { exact: false }).first())
        .first();

      if ((await siteOption.count()) > 0) {
        await siteOption.click();
        await page
          .waitForLoadState("networkidle", { timeout: 10_000 })
          .catch(() => {});
      } else {
        await page.keyboard.press("Escape");
        emit({
          report: "system",
          step: "asset_find",
          status: "info",
          message: `Site "${irisSite}" not found in dropdown — continuing without site filter`,
        });
      }
    }
  }

  await emitScreenshot(page, emit);
}

// ── Navigate to assets page ───────────────────────────────────────────────────

async function goToAssets(page: Page): Promise<void> {
  await page.goto(`${IRIS_URL}/assets`);
  await page.waitForLoadState("networkidle", { timeout: 20_000 });

  if (!page.url().includes("/assets")) {
    const assetNav = page
      .getByRole("link", { name: /assets/i })
      .or(page.locator('nav a[href*="asset"]'))
      .first();
    if ((await assetNav.count()) > 0) {
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
  abort: { requested: boolean },
): Promise<void> {
  const tag = report.tagOrUnit;
  emit({
    report: report.id,
    step: "asset_find",
    status: "info",
    message: `Searching for "${tag}"`,
  });

  if (abort.requested)
    throw Object.assign(new Error("Aborted"), { errorType: "ABORT_BATCH" });

  await goToAssets(page);
  await emitScreenshot(page, emit);

  // Try direct link match first
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assetLink = page
    .getByRole("link", { name: new RegExp(`^${escaped}$`) })
    .first();

  if ((await assetLink.count()) > 0) {
    emit({
      report: report.id,
      step: "asset_find",
      status: "ok",
      message: `Found "${tag}"`,
    });
    await assetLink.click();
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await emitScreenshot(page, emit);
    return;
  }

  // Try searching if table might be paginated
  const searchInput = page
    .getByPlaceholder(/search/i)
    .or(page.locator('input[type="search"]'))
    .first();

  if ((await searchInput.count()) > 0) {
    await searchInput.fill(tag);
    await page.waitForTimeout(800);
    const filtered = page
      .getByRole("link", { name: new RegExp(`^${escaped}$`) })
      .first();
    if ((await filtered.count()) > 0) {
      emit({
        report: report.id,
        step: "asset_find",
        status: "ok",
        message: `Found "${tag}" via search`,
      });
      await filtered.click();
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      await emitScreenshot(page, emit);
      return;
    }
  }

  // Not found — create it
  emit({
    report: report.id,
    step: "asset_create",
    status: "info",
    message: `Creating asset "${tag}"`,
  });

  await clickActionsMenu(page, emit);

  await page
    .getByRole("menuitem", { name: /create.?asset/i })
    .or(page.getByText("Create asset", { exact: false }))
    .first()
    .click();

  // Wait for the Create Asset dialog/drawer to appear
  await page.waitForSelector('[role="dialog"], [role="main"] form', {
    timeout: 10_000,
  });
  await emitScreenshot(page, emit);

  // Scope to the dialog so we don't match MUI DataGrid column-header buttons
  // that also carry aria-label="Tag column menu"
  const dialog = page
    .getByRole("dialog")
    .or(page.locator('form:has(button:has-text("Create"))'))
    .first();

  const tagInput = dialog
    .getByRole("textbox", { name: /^tag$/i })
    .or(dialog.locator('input[name="tag"], input[id*="tag" i]'))
    .or(dialog.getByLabel(/^tag$/i))
    .first();
  await tagInput.fill(tag);

  if (report.scopeOfWork) {
    const svcDesc = dialog.getByLabel(/service.?description/i).first();
    if ((await svcDesc.count()) > 0)
      await svcDesc.fill(report.scopeOfWork.slice(0, 200));
  }

  await page
    .getByRole("button", { name: /create.?and.?open/i })
    .first()
    .click();
  await page.waitForLoadState("networkidle", { timeout: 20_000 });
  await emitScreenshot(page, emit);

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
  abort: { requested: boolean },
): Promise<void> {
  emit({
    report: report.id,
    step: "specs",
    status: "info",
    message: "Updating components",
  });

  const components: [string, string, string, string][] = [];
  if (report.valveMake || report.valveModelSize || report.valveSerialNumber)
    components.push([
      "Valve",
      report.valveMake,
      report.valveModelSize,
      report.valveSerialNumber,
    ]);
  if (
    report.actuatorMake ||
    report.actuatorModelSize ||
    report.actuatorSerialNumber
  )
    components.push([
      "Actuator",
      report.actuatorMake,
      report.actuatorModelSize,
      report.actuatorSerialNumber,
    ]);
  if (
    report.positionerMake ||
    report.positionerModelAction ||
    report.positionerSerialNumber
  )
    components.push([
      "Device 1",
      report.positionerMake,
      report.positionerModelAction,
      report.positionerSerialNumber,
    ]);

  for (const [label, manufacturer, model, serial] of components) {
    if (abort.requested)
      throw Object.assign(new Error("Aborted"), { errorType: "ABORT_BATCH" });

    const row = page.locator("tr", { hasText: label }).first();

    if ((await row.count()) > 0) {
      const threeDotsBtn = row
        .getByRole("button", { name: /more|menu|options/i })
        .or(row.locator("button[aria-haspopup]"))
        .or(row.locator('button:has-text("⋮"), button:has-text("…")'))
        .first();
      await threeDotsBtn.click();
      await page.waitForTimeout(300);
      await page
        .getByRole("menuitem", { name: /edit/i })
        .or(page.getByText("Edit", { exact: true }))
        .first()
        .click();
    } else {
      const compSection = page
        .locator("section, div")
        .filter({ hasText: "Components and Specifications" })
        .first();
      await clickActionsMenu(page, emit, compSection);
      await page
        .getByRole("menuitem", { name: /add.?component/i })
        .or(page.getByText("Add component", { exact: false }))
        .first()
        .click();
      const typeSelect = page
        .getByLabel(/component.?type/i)
        .or(page.getByRole("combobox").first());
      await typeSelect.click();
      await page.getByRole("option", { name: label }).click();
    }

    await page.waitForTimeout(300);
    await emitScreenshot(page, emit);

    const mfrField = page.getByLabel(/manufacturer/i).last();
    if ((await mfrField.count()) > 0 && manufacturer) {
      await mfrField.clear();
      await mfrField.fill(manufacturer);
    }

    const modelField = page.getByLabel(/^model$/i).last();
    if ((await modelField.count()) > 0 && model) {
      await modelField.clear();
      await modelField.fill(model);
    }

    const serialField = page.getByLabel(/serial.?number/i).last();
    if ((await serialField.count()) > 0 && serial) {
      await serialField.clear();
      await serialField.fill(serial);
    }

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
  abort: { requested: boolean },
): Promise<void> {
  emit({
    report: report.id,
    step: "report_create",
    status: "info",
    message: "Creating record",
  });

  if (abort.requested)
    throw Object.assign(new Error("Aborted"), { errorType: "ABORT_BATCH" });

  await page.getByRole("tab", { name: /records/i }).click();
  await page.waitForTimeout(500);

  const recordsActions = page
    .getByRole("button", { name: /^actions$/i })
    .or(page.locator('button:has-text("ACTIONS"), button:has-text("Actions")'))
    .last();
  if ((await recordsActions.count()) > 0) {
    await emitScreenshot(page, emit);
    await recordsActions.waitFor({ state: "visible", timeout: 10_000 });
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
      .first()
      .click();
  }

  await page.waitForSelector("text=Create record for asset", {
    timeout: 10_000,
  });
  await emitScreenshot(page, emit);

  // Select Type = Preventative
  const typeDropdown = page
    .getByLabel("Type")
    .or(page.getByRole("combobox"))
    .first();
  await typeDropdown.click();
  await page.waitForTimeout(300);
  await page
    .getByRole("option", { name: /preventative/i })
    .or(page.getByText("Preventative", { exact: false }))
    .first()
    .click();

  await page
    .getByRole("button", { name: /create.?and.?open/i })
    .first()
    .click();
  await page.waitForLoadState("networkidle", { timeout: 20_000 });
  await emitScreenshot(page, emit);

  // Fill record detail fields
  if (report.repairDate) {
    const dateField = page
      .getByLabel(/occurrence.?date/i)
      .or(page.locator('input[placeholder="YYYY-MM-DD"]'))
      .first();
    if ((await dateField.count()) > 0) await dateField.fill(report.repairDate);
  }

  const woRef = report.emrReference || report.crmodReference || "";
  if (woRef) {
    const refField = page.getByLabel(/ref.*wo|wo.*moc|work.?order/i).first();
    if ((await refField.count()) > 0) await refField.fill(woRef);
  }

  const obsText = buildObservations(report, findings);
  if (obsText) {
    const obsEditor = page
      .locator('[contenteditable="true"]')
      .or(page.locator(".ProseMirror, .ql-editor, .DraftEditor-root"))
      .first();
    if ((await obsEditor.count()) > 0) {
      await obsEditor.click();
      await page.keyboard.press("Control+a");
      await obsEditor.fill(obsText);
    }
  }

  const saveBtn = page
    .getByRole("button", { name: /^save$/i })
    .or(page.getByRole("button", { name: /save.?record/i }))
    .first();
  if ((await saveBtn.count()) > 0) {
    await saveBtn.click();
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
  }

  emit({
    report: report.id,
    step: "report_create",
    status: "ok",
    message: "Record created",
  });
}

// ── Attach PDF ────────────────────────────────────────────────────────────────

async function attachPdf(
  page: Page,
  report: RepairReport,
  pdfPath: string,
  emit: (e: SyncEvent) => void,
  abort: { requested: boolean },
): Promise<void> {
  emit({
    report: report.id,
    step: "pdf_attach",
    status: "info",
    message: "Attaching PDF",
  });

  if (abort.requested)
    throw Object.assign(new Error("Aborted"), { errorType: "ABORT_BATCH" });

  await page.getByRole("tab", { name: /attachments/i }).click();
  await page.waitForTimeout(500);
  await emitScreenshot(page, emit);

  const directInput = page.locator('input[type="file"]').first();
  if ((await directInput.count()) > 0) {
    await directInput.setInputFiles(pdfPath);
  } else {
    const attachActions = page
      .getByRole("button", { name: /^actions$/i })
      .or(page.locator('button:has-text("ACTIONS"), button:has-text("Actions")'))
      .last();
    if ((await attachActions.count()) > 0) {
      const [chooser] = await Promise.all([
        page.waitForEvent("filechooser", { timeout: 10_000 }),
        (async () => {
          await attachActions.waitFor({ state: "visible", timeout: 10_000 });
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
    }
  }

  await page.waitForLoadState("networkidle", { timeout: 20_000 });
  await emitScreenshot(page, emit);

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

// ── Route handler ─────────────────────────────────────────────────────────────

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

  // Kill on client disconnect
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
      // Stream cancelled by client — stop Playwright
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
