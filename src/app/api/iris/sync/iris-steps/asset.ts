import type { Page } from "playwright";
import type { RepairReport } from "@/lib/types";
import type { SyncEvent } from "../route";
import { emitScreenshot, clickActionsMenu } from "../playwright-helpers";
import { goToAssets } from "./site";

export async function findOrCreateAsset(
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

  // Try searching if the table might be paginated
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

  await page.waitForSelector('[role="dialog"], [role="main"] form', {
    timeout: 10_000,
  });
  await emitScreenshot(page, emit);

  // Scope to the dialog to avoid matching DataGrid column-header buttons
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
