import { describe, expect, it } from "vitest";
import { extractFields, type TextItem } from "@/lib/imports/pdfParser";

// This file used to carry a hand-built "stacked single column" fixture with
// component headings above their rows. It passed, and it was fiction — the real
// reports print CONSTRUCTION (AS FOUND) and (AS LEFT) SIDE BY SIDE, and the
// rotated component heading sits near the BOTTOM of its block, not the top. A
// fix built to satisfy that invented layout shipped and did nothing on real
// documents.
//
// Real-layout coverage now lives in real-report-layout.test.ts, driven by
// coordinates captured from an actual report. What remains here is the one case
// that fixture never covered: a report that DOES prefix its labels, where the
// bare-label ordinal lookups must stay out of the way.

function item(str: string, x: number, y: number, page = 1): TextItem {
  return { str, x, y, w: Math.max(str.length * 5, 2), page };
}

describe("reports that prefix their labels", () => {
  const PREFIXED: TextItem[] = [
    item("Valve S/N", 60, 120), item("VALVE-SN", 200, 120),
    item("Actuator S/N", 60, 140), item("ACT-SN", 200, 140),
    item("Positioner S/N", 60, 160), item("POS-SN", 200, 160),
    item("Valve Make", 60, 180), item("VALVE-MK", 200, 180),
    item("Actuator Make", 60, 200), item("ACT-MK", 200, 200),
    item("Positioner Make", 60, 220), item("POS-MK", 200, 220),
  ];

  const parsed = () => extractFields(PREFIXED, PREFIXED, 612, 9999, "rightmost");

  it("binds each component from its own explicit label", () => {
    const r = parsed();
    expect(r.valveSerialNumber).toBe("VALVE-SN");
    expect(r.actuatorSerialNumber).toBe("ACT-SN");
    expect(r.positionerSerialNumber).toBe("POS-SN");
  });

  it("does the same for Make", () => {
    const r = parsed();
    expect(r.actuatorMake).toBe("ACT-MK");
    expect(r.positionerMake).toBe("POS-MK");
  });

  it("never lets one component inherit another's value", () => {
    const r = parsed();
    expect(new Set([r.valveSerialNumber, r.actuatorSerialNumber, r.positionerSerialNumber]).size).toBe(3);
  });
});

describe("a report with no positioner", () => {
  const NO_POSITIONER: TextItem[] = [
    item("Valve S/N", 60, 120), item("VSN-1", 200, 120),
    item("Actuator S/N", 60, 140), item("ASN-1", 200, 140),
  ];

  it("leaves positioner fields empty rather than inventing one", () => {
    const r = extractFields(NO_POSITIONER, NO_POSITIONER, 612, 9999, "rightmost");
    expect(r.positionerSerialNumber).toBe("");
    expect(r.positionerMake).toBe("");
    expect(r.actuatorSerialNumber).toBe("ASN-1");
  });
});
