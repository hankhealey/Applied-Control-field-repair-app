import { describe, expect, it } from "vitest";
import { buildObservationsHtml } from "@/lib/exports/iris";
import { findAssetId, type ParsedPdfReport } from "@/lib/imports/pdfParser";

// The IRIS Observations cell has a house format. These tests pin it, because
// the block is written by two systems that must agree: buildObservationsHtml
// renders the header from extracted fields, and the model writes the prose
// sections (see OBSERVATIONS_STRUCTURE in api/pdf-enhance/route.ts).
//
// Reference block, from the real report this format was specified against:
//
//   Customer: HF Sinclair | Tech: Justin Sestak | Asset ID: 2003245
//   Valve: VELAN 12" Butterfly, 300 RF Flg | Actuator: BETTIS CBA730, Lock in Last
//   Scope: Customer onsite stroke testing...
//   Findings:          • Valve: Stuck at mid stroke...
//   Corrective Action: • Realigned seal ring...
//   Test Data:         • Pkg/Gst: 1125 psi - PASS

function report(over: Partial<ParsedPdfReport> = {}): ParsedPdfReport {
  return {
    filename: "", tagOrUnit: "", assetId: "", customer: "", siteTitle: "", repairDate: "",
    technician: "", process: "", emrReference: "", crmodReference: "", scopeOfWork: "",
    valveMake: "", valveSerialNumber: "", valveModelSize: "", valveClassConnection: "",
    valvePackingConfiguration: "", valveTrimCharPort: "", valveFlowDirection: "",
    actuatorMake: "", actuatorSerialNumber: "", actuatorModelSize: "",
    actuatorActionHandwheel: "", positionerMake: "", positionerSerialNumber: "",
    positionerModelAction: "", ratedTravel: "", benchSetAsLeft: "", openSignalAsLeft: "",
    closedSignalAsLeft: "", supplyPressureAsLeft: "", failActionAsLeft: "",
    actuatorAirAction: "", seatLeakClass: "",
    ...over,
  };
}

const FULL = report({
  customer: "HF Sinclair",
  technician: "Justin Sestak",
  assetId: "2003245",
  valveMake: "VELAN",
  valveModelSize: '12" Butterfly',
  valveClassConnection: "300 RF Flg",
  actuatorMake: "BETTIS",
  actuatorModelSize: "CBA730",
  actuatorActionHandwheel: "Lock in Last",
  scopeOfWork: 'Customer onsite stroke testing - valve "stuck", difficult to move.',
});

describe("header block — deterministic, built from extracted fields", () => {
  it("renders the who line with bolded labels, pipe-separated", () => {
    expect(buildObservationsHtml(FULL)).toContain(
      "<p><strong>Customer:</strong> HF Sinclair | <strong>Tech:</strong> Justin Sestak | <strong>Asset ID:</strong> 2003245</p>",
    );
  });

  it("renders the equipment line as make + model/size, then class/connection", () => {
    expect(buildObservationsHtml(FULL)).toContain(
      '<p><strong>Valve:</strong> VELAN 12" Butterfly, 300 RF Flg | <strong>Actuator:</strong> BETTIS CBA730, Lock in Last</p>',
    );
  });

  it("renders scope with a bolded label", () => {
    expect(buildObservationsHtml(FULL)).toContain("<strong>Scope:</strong> Customer onsite");
  });

  it("omits a whole line rather than printing an empty label", () => {
    const html = buildObservationsHtml(report({ customer: "HF Sinclair" }));
    expect(html).toContain("<strong>Customer:</strong> HF Sinclair");
    expect(html).not.toContain("Tech:");
    expect(html).not.toContain("Asset ID:");
    expect(html).not.toContain("Valve:");
  });

  it("drops the separator when only one item is present on a line", () => {
    const html = buildObservationsHtml(report({ customer: "HF Sinclair" }));
    expect(html).toContain("<p><strong>Customer:</strong> HF Sinclair</p>");
    expect(html).not.toContain("| </p>");
  });

  it("returns empty string for a report with nothing extracted", () => {
    expect(buildObservationsHtml(report())).toBe("");
  });
});

describe("AI prose — appended verbatim, never escaped", () => {
  const prose =
    "<p><strong>Findings:</strong></p><p>&bull; <strong>Bushings:</strong> Worn &rarr; Replaced</p>";

  it("keeps model HTML as markup rather than rendering tags as text", () => {
    const html = buildObservationsHtml(report({ ...FULL, observationsHtml: prose }));
    expect(html).toContain("<strong>Findings:</strong>");
    expect(html).not.toContain("&lt;strong&gt;");
  });

  it("still renders the deterministic header above the prose", () => {
    const html = buildObservationsHtml(report({ ...FULL, observationsHtml: prose }));
    expect(html.indexOf("Customer:")).toBeLessThan(html.indexOf("Findings:"));
  });

  it("separates header from prose with a spacer paragraph", () => {
    const html = buildObservationsHtml(report({ ...FULL, observationsHtml: prose }));
    expect(html).toContain("<p><br></p><p><strong>Findings:</strong>");
  });
});

describe("Test Data is a fallback, not a duplicate", () => {
  // The model writes Test Data because Pkg/Gst and Hydro have no extracted
  // fields. Emitting the extracted values too would print seat leak class twice
  // in a customer-visible IRIS record.
  it("is suppressed when the model already wrote prose", () => {
    const html = buildObservationsHtml(
      report({ ...FULL, seatLeakClass: "Class VI", observationsHtml: "<p>x</p>" }),
    );
    expect(html).not.toContain("Test Data:");
    expect(html).not.toContain("Class VI");
  });

  it("renders extracted calibration values when there is no prose", () => {
    const html = buildObservationsHtml(
      report({ ...FULL, seatLeakClass: "Class VI", supplyPressureAsLeft: "60" }),
    );
    expect(html).toContain("<p><strong>Test Data:</strong></p>");
    expect(html).toContain("&bull; <strong>Seat Leak:</strong> Class VI");
    expect(html).toContain("<strong>Supply Pressure (As Left):</strong> 60 psi");
  });
});

describe("IRIS compatibility", () => {
  it("uses only the tags already proven to survive the importer", () => {
    const html = buildObservationsHtml(
      report({ ...FULL, seatLeakClass: "Class VI" }),
    );
    const tags = [...html.matchAll(/<\/?([a-z]+)[^>]*>/g)].map((m) => m[1]);
    expect([...new Set(tags)].sort()).toEqual(["br", "p", "strong"]);
  });

  it("never emits <ul>/<li> — IRIS may strip lists and collapse the bullets", () => {
    const html = buildObservationsHtml(report({ ...FULL, seatLeakClass: "Class VI" }));
    expect(html).not.toMatch(/<\/?(ul|li|ol)\b/);
    expect(html).toContain("&bull;");
  });

  it("escapes user data so a stray < cannot break the cell", () => {
    const html = buildObservationsHtml(report({ customer: "A & B <Ltd>" }));
    expect(html).toContain("A &amp; B &lt;Ltd&gt;");
  });
});

describe("findAssetId", () => {
  it("reads the NOTES prose form", () => {
    expect(findAssetId("NOTES: Asset ID 2003245 replaced under WO 4471")).toBe("2003245");
  });

  it("tolerates a colon, a hash, and no space", () => {
    expect(findAssetId("Asset ID: 2003245")).toBe("2003245");
    expect(findAssetId("Asset ID #2003245")).toBe("2003245");
    expect(findAssetId("AssetID 2003245")).toBe("2003245");
  });

  it("survives the value being split across pdf.js text runs", () => {
    expect(findAssetId("Asset   ID   2003245")).toBe("2003245");
  });

  it("returns empty for an absent id rather than guessing a nearby number", () => {
    expect(findAssetId("WO 4471 completed 2026-07-19")).toBe("");
    expect(findAssetId("")).toBe("");
  });

  it("does not match a too-short run of digits", () => {
    expect(findAssetId("Asset ID 12")).toBe("");
  });
});
