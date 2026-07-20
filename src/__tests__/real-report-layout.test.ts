import { describe, expect, it } from "vitest";
import fixture from "./fixtures/fv4101-items.json";
import { extractFields, type TextItem } from "@/lib/imports/pdfParser";

// Real coordinates from a real Applied Control repair report, customer strings
// redacted (see fixtures/README.md). Hand-built fixtures are what let a broken
// fix ship: an earlier attempt assumed component headings sit ABOVE their rows
// and passed its own invented fixture, while in the real document the rotated
// heading sits near the BOTTOM of its block. Nothing here is invented.
//
// Layout facts this pins:
//   CONSTRUCTION (AS FOUND) and (AS LEFT) are SIDE BY SIDE — same y, different
//   x — and each column runs Body → Actuator → Positioner using bare labels.
//   In the AS LEFT column "Make" occurs at y=209.4 / 289.6 / 358.6 and "S/N" at
//   220.7 / 300.9 / 369.9.

const page1 = fixture.page1 as TextItem[];
const pageWidth = fixture.pageWidth;
const FINDINGS_Y = 99999; // real value: the findings header is on page 2

function parse() {
  return extractFields(page1, page1, pageWidth, FINDINGS_Y, "first");
}

/** Ground truth read off the PDF's CONSTRUCTION (AS LEFT) block, redacted to match. */
const AS_LEFT = {
  valveMake: "FISHER",
  valveSerialNumber: "1234567",
  valveModelSize: 'U 3"',
  valveClassConnection: "300 FF",
  valvePackingConfiguration: "PTFE V-Ring",
  valveTrimCharPort: 'Mod. Linear 3"',
  valveFlowDirection: "Forward",
  actuatorMake: "FISHER",
  actuatorSerialNumber: "1234567",
  actuatorModelSize: "657 46",
  actuatorActionHandwheel: "PDTC None",
  positionerMake: "FISHER",
  positionerSerialNumber: "FA00099999",
  positionerModelAction: "DVC6200 Direct",
} as const;

describe("the reported bug: positioner fields", () => {
  it("reads the positioner serial from the AS LEFT column", () => {
    expect(parse().positionerSerialNumber).toBe("FA00099999");
  });

  it("reads the positioner make", () => {
    expect(parse().positionerMake).toBe("FISHER");
  });

  it("does NOT take the as-found positioner serial", () => {
    // AS FOUND has 1234567 here (same as body/actuator); AS LEFT has FA00099999.
    expect(parse().positionerSerialNumber).not.toBe("1234567");
  });
});

describe("valve and actuator must not swap", () => {
  // The shipped export had Valve model "657" and Actuator model "U" — each
  // holding the other's value, because the Model/Size ordinal was counted
  // across both columns and as-found/as-left share y values.
  it("valve model is the body's, not the actuator's", () => {
    expect(parse().valveModelSize).toBe('U 3"');
  });

  it("actuator model is the actuator's, not the body's", () => {
    expect(parse().actuatorModelSize).toBe("657 46");
  });

  it("the two are never equal on this report", () => {
    const r = parse();
    expect(r.valveModelSize).not.toBe(r.actuatorModelSize);
  });
});

describe("two-cell values keep both cells", () => {
  // Model/Size, Class/Conn., Trim Char/Port and Action/Handwheel each render as
  // two cells ~25-47px apart. buildValue's default 22px gap dropped the second.
  it.each([
    ["valveModelSize", 'U 3"'],
    ["valveClassConnection", "300 FF"],
    ["valveTrimCharPort", 'Mod. Linear 3"'],
    ["actuatorModelSize", "657 46"],
    ["actuatorActionHandwheel", "PDTC None"],
    ["positionerModelAction", "DVC6200 Direct"],
  ])("%s keeps both cells", (field, want) => {
    expect((parse() as Record<string, string>)[field]).toBe(want);
  });
});

describe("AS LEFT is preferred over AS FOUND", () => {
  it("takes the replaced positioner, not the one that came off", () => {
    // AS FOUND positioner model is 3582; it was replaced with a DVC6200.
    const r = parse();
    expect(r.positionerModelAction).toContain("DVC6200");
    expect(r.positionerModelAction).not.toContain("3582");
  });
});

describe("scorecard", () => {
  it("extracts every AS LEFT construction field", () => {
    const r = parse() as Record<string, string>;
    const wrong = Object.entries(AS_LEFT).filter(([k, v]) => r[k] !== v);
    // Printed on failure so a regression names the fields, not just a count.
    expect({ wrong: wrong.map(([k, v]) => `${k}: want ${v}, got ${r[k] || "(blank)"}`) })
      .toEqual({ wrong: [] });
  });
});
