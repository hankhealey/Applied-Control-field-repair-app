import type { Page } from "playwright";
import type { RepairReport } from "@/lib/types";
import type { SyncEvent } from "../route";
import { emitScreenshot } from "../playwright-helpers";

export async function attachPdf(
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
      .or(
        page.locator(
          'button:has-text("ACTIONS"), button:has-text("Actions")',
        ),
      )
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
