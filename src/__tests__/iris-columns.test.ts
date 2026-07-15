import { describe, expect, it } from "vitest";
import { irisColumnsFor, irisPreviewRow } from "@/lib/exports/iris";
import type { ParsedPdfReport } from "@/lib/imports/pdfParser";

function report(overrides: Partial<ParsedPdfReport> = {}): ParsedPdfReport {
  return {
    filename: "", tagOrUnit: "", customer: "", siteTitle: "", repairDate: "",
    technician: "", process: "", emrReference: "", crmodReference: "",
    scopeOfWork: "", valveMake: "", valveSerialNumber: "", valveModelSize: "",
    valveClassConnection: "", valvePackingConfiguration: "", valveTrimCharPort: "",
    valveFlowDirection: "", actuatorMake: "", actuatorSerialNumber: "",
    actuatorModelSize: "", actuatorActionHandwheel: "", positionerMake: "",
    positionerSerialNumber: "", positionerModelAction: "", ratedTravel: "",
    benchSetAsLeft: "", openSignalAsLeft: "", closedSignalAsLeft: "",
    supplyPressureAsLeft: "", failActionAsLeft: "", actuatorAirAction: "",
    seatLeakClass: "",
    ...overrides,
  };
}

describe("irisColumnsFor", () => {
  it("Control Valve has the full 153-column template with clean labels", () => {
    const cols = irisColumnsFor("Control Valve");
    expect(cols.length).toBe(153);
    expect(cols[0]).toBe("Tag"); // leading tab stripped
    expect(cols).toContain("Valve body material");
    expect(cols).toContain("Device 3 Vent id");
  });

  it("Relief Valve uses its own shorter template", () => {
    expect(irisColumnsFor("Relief Valve").length).toBeLessThan(153);
    expect(irisColumnsFor("Relief Valve")[0]).toBe("Tag");
  });
});

describe("irisPreviewRow", () => {
  it("zips every column with its live export value", () => {
    const row = irisPreviewRow(report({ tagOrUnit: "PV-1", valveMake: "FISHER" }), "Control Valve");
    expect(row.length).toBe(153);
    expect(row.find((c) => c.header === "Tag")?.value).toBe("PV-1");
    expect(row.find((c) => c.header === "Valve manufacturer")?.value).toBe("FISHER");
    // A column with no source data comes back blank — ready to hand-fill
    expect(row.find((c) => c.header === "Valve body material")?.value).toBe("");
  });

  it("splits model/size into their separate IRIS columns", () => {
    const row = irisPreviewRow(report({ valveModelSize: "EZ 2" }), "Control Valve");
    expect(row.find((c) => c.header === "Valve model")?.value).toBe("EZ");
    expect(row.find((c) => c.header === "Valve size")?.value).toBe("2");
  });
});
