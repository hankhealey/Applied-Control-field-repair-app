import type { Page } from "playwright";
import type { RepairFinding, RepairReport } from "@/lib/types";
import type { SyncEvent } from "../route";
import { emitScreenshot, buildObservations } from "../playwright-helpers";

export async function createRecord(
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
    .or(
      page.locator(
        'button:has-text("ACTIONS"), button:has-text("Actions")',
      ),
    )
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
