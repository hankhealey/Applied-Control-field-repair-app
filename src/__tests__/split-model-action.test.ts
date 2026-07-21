import { describe, expect, it } from "vitest";
import { irisColumnsFor, irisPreviewRow, splitModelAction } from "@/lib/exports/iris";
import type { ParsedPdfReport } from "@/lib/imports/pdfParser";

// The positioner row prints "Model / Action" as two cells ("DVC6200" then
// "Direct"). Device 1 Model number (col 82) wants only the model, Instrument
// action (col 94) only the action. Writing the joined value to both put
// "DVC6200 Direct" in the model column and "DVC6200" in the action column.

describe("splitModelAction", () => {
  it("splits a model and a trailing known action", () => {
    expect(splitModelAction("DVC6200 Direct")).toEqual({ model: "DVC6200", action: "Direct" });
  });

  it("recognises Reverse and Indirect", () => {
    expect(splitModelAction("SVI II Reverse")).toEqual({ model: "SVI II", action: "Reverse" });
    expect(splitModelAction("3582 Indirect")).toEqual({ model: "3582", action: "Indirect" });
  });

  it("leaves the model whole when the last word is NOT an action", () => {
    // No action word — don't guess. Whole thing is the model.
    expect(splitModelAction("DVC6200")).toEqual({ model: "DVC6200", action: "" });
    expect(splitModelAction("SVI II AP")).toEqual({ model: "SVI II AP", action: "" });
  });

  it("handles blank", () => {
    expect(splitModelAction("")).toEqual({ model: "", action: "" });
  });
});

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
    actuatorAirAction: "", seatLeakClass: "", ...over,
  };
}

describe("Device 1 columns split correctly in the export row", () => {
  const preview = irisPreviewRow(
    report({ positionerMake: "FISHER", positionerModelAction: "DVC6200 Direct" }),
    "Control Valve",
  );
  const byHeader = new Map(preview.map((p) => [p.header, p.value]));

  it("Model number gets only the model", () => {
    expect(byHeader.get("Device 1 Model number")).toBe("DVC6200");
  });

  it("Instrument action gets only the action", () => {
    expect(byHeader.get("Device 1 Instrument action")).toBe("Direct");
  });

  it("the two columns line up with their headers", () => {
    const cols = irisColumnsFor("Control Valve");
    expect(cols[82]).toBe("Device 1 Model number");
    expect(cols[94]).toBe("Device 1 Instrument action");
  });
});
