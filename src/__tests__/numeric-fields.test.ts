import { describe, expect, it } from "vitest";
import { isBadNumericFor } from "@/lib/imports/pdfParser";

// The number-only check exists to catch findings-list item numbers ("1.", "2.")
// leaking into equipment fields. It used to reject EVERY bare number, which
// silently deleted real Fisher model numbers and numeric serials on every file.

describe("isBadNumericFor — model numbers survive", () => {
  it("keeps Fisher actuator model numbers", () => {
    for (const model of ["667", "657", "1052", "585", "1051"]) {
      expect(isBadNumericFor("actuatorModelSize", model)).toBe(false);
    }
  });

  it("keeps numeric positioner models", () => {
    expect(isBadNumericFor("positionerModelAction", "3582")).toBe(false);
  });

  it("keeps a numeric valve model", () => {
    expect(isBadNumericFor("valveModelSize", "667")).toBe(false);
  });

  it("keeps all-digit serial numbers", () => {
    expect(isBadNumericFor("valveSerialNumber", "12345678")).toBe(false);
    expect(isBadNumericFor("actuatorSerialNumber", "0042")).toBe(false);
  });
});

describe("isBadNumericFor — findings item numbers still rejected", () => {
  it("rejects the item-number shape in model fields", () => {
    expect(isBadNumericFor("valveModelSize", "1.")).toBe(true);
    expect(isBadNumericFor("actuatorModelSize", "12.")).toBe(true);
  });

  it("rejects any bare number in make fields", () => {
    expect(isBadNumericFor("valveMake", "667")).toBe(true);
    expect(isBadNumericFor("actuatorMake", "2")).toBe(true);
    expect(isBadNumericFor("positionerMake", "3.")).toBe(true);
  });

  it("rejects bare numbers in flow direction", () => {
    expect(isBadNumericFor("valveFlowDirection", "1.")).toBe(true);
  });
});

describe("isBadNumericFor — non-numeric values are never flagged", () => {
  it("passes normal values through", () => {
    expect(isBadNumericFor("valveModelSize", "EZ")).toBe(false);
    expect(isBadNumericFor("valveMake", "FISHER")).toBe(false);
    expect(isBadNumericFor("positionerModelAction", "DVC6200")).toBe(false);
    expect(isBadNumericFor("valveSerialNumber", "F002396631")).toBe(false);
  });

  it("treats empty as fine (validateResult skips empties anyway)", () => {
    expect(isBadNumericFor("valveModelSize", "")).toBe(false);
    expect(isBadNumericFor("valveModelSize", "   ")).toBe(false);
  });
});
