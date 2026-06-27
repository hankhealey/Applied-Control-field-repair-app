import type { Page } from "playwright";
import type { RepairFinding, RepairReport } from "@/lib/types";
import type { SyncEvent } from "./route";

export const IRIS_URL = "https://iris-appliedcontrols.bluemarvel.ai";

export function sse(event: SyncEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function buildObservations(
  r: RepairReport,
  findings: RepairFinding[],
): string {
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

export async function emitScreenshot(
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

// Iris uses MUI DataGrid toolbars. The button label may vary in casing and the
// button may be inside a specific toolbar section.
export async function clickActionsMenu(
  page: Page,
  emit: (e: SyncEvent) => void,
  scope?: import("playwright").Locator,
): Promise<void> {
  await emitScreenshot(page, emit);

  const root = scope ?? page;

  const btn = root
    .getByRole("button", { name: /^actions$/i })
    .or(
      root.locator(
        'button:has-text("ACTIONS"), button:has-text("Actions"), button:has-text("actions")',
      ),
    )
    .first();

  await btn.waitFor({ state: "visible", timeout: 10_000 });
  await btn.click();
  await page.waitForTimeout(300);
}
