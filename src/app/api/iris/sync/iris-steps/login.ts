import type { Page } from "playwright";
import type { SyncEvent } from "../route";
import { IRIS_URL, emitScreenshot } from "../playwright-helpers";

export async function login(
  page: Page,
  emit: (e: SyncEvent) => void,
): Promise<void> {
  await page.goto(IRIS_URL);
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => {});

  await emitScreenshot(page, emit);

  if (!page.url().includes("auth0.com")) {
    return;
  }

  emit({
    report: "system",
    step: "asset_find",
    status: "info",
    message:
      "🔐 Please log into Iris in the browser window that just opened. Waiting up to 2 minutes…",
  });

  await page.waitForURL(
    (url) =>
      url.href.startsWith(IRIS_URL) && !url.href.includes("auth0.com"),
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
