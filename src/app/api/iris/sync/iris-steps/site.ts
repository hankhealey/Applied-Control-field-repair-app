import type { Page } from "playwright";
import type { SyncEvent } from "../route";
import { IRIS_URL, emitScreenshot } from "../playwright-helpers";

export async function goToAssets(page: Page): Promise<void> {
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

export async function selectSite(
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
      await page.keyboard.press("Escape");
      emit({
        report: "system",
        step: "asset_find",
        status: "info",
        message: `Customer "${irisCustomer}" not found in dropdown — skipping site filter`,
      });
    }

    // Wait for the site dropdown to become enabled after customer selection
    await page
      .waitForLoadState("networkidle", { timeout: 10_000 })
      .catch(() => {});
    await page.waitForTimeout(600);
    await emitScreenshot(page, emit);
  }

  // Site dropdown — must be re-queried AFTER customer settles because MUI
  // remounts or disables it while loading the filtered site list.
  if (irisSite) {
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
      await page
        .waitForFunction(
          () => {
            const combos = document.querySelectorAll('[role="combobox"]');
            const el = combos[1] as HTMLElement | undefined;
            return (
              el &&
              !el.hasAttribute("disabled") &&
              el.getAttribute("aria-disabled") !== "true"
            );
          },
          { timeout: 10_000 },
        )
        .catch(() => {});

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
