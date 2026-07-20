import { describe, expect, it } from "vitest";
import { irisColumnsFor, type IrisAssetType } from "@/lib/exports/iris";

// The /import preview builds its full-column view from irisColumnsFor(assetType).
// Only three templates carry the Device 1 (positioner) block, so on the other
// eight a positioner serial read off the PDF has no column to land in and
// silently vanishes at export. page.tsx surfaces that as a warning; these tests
// pin which types are which so the warning can't drift out of sync.

const WITH_DEVICE_1: IrisAssetType[] = [
  "Control Valve",
  "Isolation Valve",
  "Motor Operated Valve",
];

const WITHOUT_DEVICE_1: IrisAssetType[] = [
  "Relief Valve",
  "Manual Valve",
  "Regulator",
  "Steam Trap",
  "General",
  "Machinery",
  "Measurement",
  "Tank",
];

describe("Device 1 (positioner) columns by asset type", () => {
  it.each(WITH_DEVICE_1)("%s HAS Device 1 Serial number", (type) => {
    expect(irisColumnsFor(type)).toContain("Device 1 Serial number");
  });

  it.each(WITHOUT_DEVICE_1)("%s has NO Device 1 columns", (type) => {
    expect(irisColumnsFor(type).filter((h) => h.startsWith("Device 1"))).toEqual([]);
  });

  it("puts Device 1 Serial number at index 84 for Control Valve", () => {
    // The design doc verified this against Copilot's independent column map
    // (column CG). iris.ts:340 writes r.positionerSerialNumber to this index.
    expect(irisColumnsFor("Control Valve")[84]).toBe("Device 1 Serial number");
  });

  it("strips the leading tab IRIS prepends, so header lookups match", () => {
    // page.tsx matches CSV_COLS headers against these by exact string. A stray
    // tab here silently unmaps every column in the full-column view.
    const cols = irisColumnsFor("Control Valve");
    expect(cols.some((h) => h.startsWith("\t"))).toBe(false);
    expect(cols[0]).toBe("Tag");
  });
});

describe("every CSV_COLS header exists in the Control Valve template", () => {
  // Mirror of the CSV_COLS header list in src/app/import/page.tsx. If a header
  // is renamed on one side only, the full-column view silently degrades that
  // column to an unmapped hand-fill cell.
  const CSV_COL_HEADERS = [
    "Tag", "Service description", "P & ID no.", "Datasheet no.",
    "Valve manufacturer", "Valve model", "Valve serial number", "Valve size",
    "Valve pressure class", "Valve rated travel", "Valve leak class",
    "Valve trim style/number", "Valve packing type/material", "Valve flow direction",
    "Actuator manufacturer", "Actuator model", "Actuator size",
    "Actuator serial number", "Actuator lower bench set", "Actuator upper bench set",
    "Actuator nominal supply pressure", "Actuator fail action", "Actuator air",
    "Device 1 Manufacturer", "Device 1 Model number", "Device 1 Serial number",
  ];

  it.each(CSV_COL_HEADERS)("%s is a real Control Valve column", (header) => {
    expect(irisColumnsFor("Control Valve")).toContain(header);
  });
});
