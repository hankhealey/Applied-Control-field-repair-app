import { describe, expect, it } from "vitest";
import { extractFields, type TextItem } from "@/lib/imports/pdfParser";

// Applied Control reports print GENERIC labels under a per-component heading:
//
//   Valve
//     Make        VELAN
//     Model/Size  12" Butterfly
//     S/N         6013-01017-002-001
//   Actuator
//     Make        BETTIS
//     ...
//   Positioner
//     Make        FISHER
//     S/N         F002363859
//
// The valve resolves through guarded generic fallbacks (["Make"], ["S/N"] with
// NOT_VALVE). The actuator and positioner had prefixed labels ONLY, so on this
// layout their Make and S/N silently extracted to "" — which is why a report
// with a positioner exported a blank Device 1 Serial number.

function item(str: string, x: number, y: number, page = 1): TextItem {
  return { str, x, y, w: Math.max(str.length * 5, 2), page };
}

/** Label at x=60, value at x=200, one row per y. */
function row(label: string, value: string, y: number): TextItem[] {
  return [item(label, 60, y), item(value, 200, y)];
}

/** The generic-label layout, all three components, no component prefixes. */
const GENERIC_LAYOUT: TextItem[] = [
  item("CONSTRUCTION (AS LEFT)", 50, 80),
  item("Valve", 50, 100),
  ...row("Make", "VELAN", 120),
  ...row("Model / Size", 'EZ 1-1/2', 140),
  ...row("S/N", "6013-01017-002-001", 160),
  item("Actuator", 50, 200),
  ...row("Make", "BETTIS", 220),
  ...row("Model / Size", "667", 240),
  ...row("S/N", "B-210U-S070", 260),
  item("Positioner", 50, 300),
  ...row("Make", "FISHER", 320),
  ...row("Model / Action", "DVC6200", 340),
  ...row("S/N", "F002363859", 360),
];

const FINDINGS_Y = 9999;

function extract(items: TextItem[] = GENERIC_LAYOUT) {
  return extractFields(items, items, 612, FINDINGS_Y, "rightmost");
}

describe("generic per-component labels — every component resolves", () => {
  it("reads the positioner serial (the reported bug)", () => {
    expect(extract().positionerSerialNumber).toBe("F002363859");
  });

  it("reads the positioner make", () => {
    expect(extract().positionerMake).toBe("FISHER");
  });

  it("reads the actuator serial", () => {
    expect(extract().actuatorSerialNumber).toBe("B-210U-S070");
  });

  it("reads the actuator make", () => {
    expect(extract().actuatorMake).toBe("BETTIS");
  });

  it("still reads the valve make and serial (must not regress)", () => {
    const r = extract();
    expect(r.valveMake).toBe("VELAN");
    expect(r.valveSerialNumber).toBe("6013-01017-002-001");
  });

  it("binds each component to its OWN row, never a neighbour's", () => {
    const r = extract();
    // The whole point of the ownership guards: three identical "S/N" labels,
    // three different values, each must land on the right field.
    expect(new Set([r.valveSerialNumber, r.actuatorSerialNumber, r.positionerSerialNumber]).size).toBe(3);
    expect(new Set([r.valveMake, r.actuatorMake, r.positionerMake]).size).toBe(3);
  });
});

describe("prefixed labels still win when the report uses them", () => {
  const PREFIXED: TextItem[] = [
    item("Valve S/N", 60, 120), item("VALVE-SN", 200, 120),
    item("Actuator S/N", 60, 140), item("ACT-SN", 200, 140),
    item("Positioner S/N", 60, 160), item("POS-SN", 200, 160),
    item("Valve Make", 60, 180), item("VALVE-MK", 200, 180),
    item("Actuator Make", 60, 200), item("ACT-MK", 200, 200),
    item("Positioner Make", 60, 220), item("POS-MK", 200, 220),
  ];

  it("does not let the generic fallback override an explicit label", () => {
    const r = extract(PREFIXED);
    expect(r.valveSerialNumber).toBe("VALVE-SN");
    expect(r.actuatorSerialNumber).toBe("ACT-SN");
    expect(r.positionerSerialNumber).toBe("POS-SN");
    expect(r.actuatorMake).toBe("ACT-MK");
    expect(r.positionerMake).toBe("POS-MK");
  });
});

describe("a report with no positioner leaves positioner fields empty", () => {
  const NO_POSITIONER: TextItem[] = [
    item("Valve", 50, 100),
    ...row("Make", "VELAN", 120),
    ...row("S/N", "VSN-1", 140),
    item("Actuator", 50, 200),
    ...row("Make", "BETTIS", 220),
    ...row("S/N", "ASN-1", 240),
  ];

  it("does not invent a positioner from the actuator's row", () => {
    const r = extract(NO_POSITIONER);
    expect(r.positionerSerialNumber).toBe("");
    expect(r.positionerMake).toBe("");
    // and the two that DO exist still resolve
    expect(r.actuatorSerialNumber).toBe("ASN-1");
    expect(r.actuatorMake).toBe("BETTIS");
  });
});
