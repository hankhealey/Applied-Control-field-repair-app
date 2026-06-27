import type { Page } from "playwright";
import type { RepairReport } from "@/lib/types";
import type { SyncEvent } from "../route";
import { emitScreenshot, clickActionsMenu } from "../playwright-helpers";

export async function updateComponents(
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
