import { describe, expect, it } from "vitest";
import { splitModelSize } from "@/lib/exports/iris";
import { applyEditPatch, type EditPatch } from "@/lib/imports/editOverrides";
import type { ParsedPdfReport } from "@/lib/imports/pdfParser";

function report(overrides: Partial<ParsedPdfReport> = {}): ParsedPdfReport {
  return {
    filename: "", tagOrUnit: "", assetId: "", customer: "", siteTitle: "", repairDate: "",
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

// Mirrors the "Valve size" column's onEdit: set the edited half, snapshot the sibling.
function editValveSize(result: ParsedPdfReport, patch: EditPatch, v: string): EditPatch {
  return {
    ...patch,
    _valveSize: v,
    _valveModel: patch._valveModel ?? splitModelSize(result.valveModelSize).model,
  };
}

describe("applyEditPatch — split-cell stability (crash regression)", () => {
  it("backspacing the size cell never grows the combined field", () => {
    // The old keystroke-rejoin path roughly DOUBLED valveModelSize per
    // backspace once the no-size fallback kicked in, piling up text until
    // the page crashed. The override path must shrink monotonically.
    const result = report({ valveModelSize: "EZ 2" });
    let patch: EditPatch = {};
    let displayed = splitModelSize(result.valveModelSize).size; // "2"
    let prevLen = result.valveModelSize.length;

    for (let i = 0; i < 10; i++) {
      displayed = displayed.slice(0, -1); // backspace
      patch = editValveSize(result, patch, displayed);
      const combined = applyEditPatch(result, patch).valveModelSize;
      expect(combined.length).toBeLessThanOrEqual(prevLen);
      prevLen = combined.length;
      // The deletion must stick: the cell displays the override verbatim
      expect(patch._valveSize).toBe(displayed);
      if (displayed === "") break;
    }

    expect(applyEditPatch(result, patch).valveModelSize).toBe("EZ");
    expect(patch._valveSize).toBe("");
  });

  it("no-size fallback values (DVC6200) stay stable while editing", () => {
    const result = report({ valveModelSize: "DVC6200" });
    let patch: EditPatch = {};
    patch = editValveSize(result, patch, "2");
    expect(applyEditPatch(result, patch).valveModelSize).toBe("DVC6200 2");
    // clearing the size returns to just the model — no duplication
    patch = editValveSize(result, patch, "");
    expect(applyEditPatch(result, patch).valveModelSize).toBe("DVC6200");
  });

  it("clearing both halves empties the combined field", () => {
    const result = report({ valveModelSize: "EZ 2" });
    const merged = applyEditPatch(result, { _valveModel: "", _valveSize: "" });
    expect(merged.valveModelSize).toBe("");
  });

  it("bench set halves reassemble with a dash and tolerate clearing", () => {
    const result = report({ benchSetAsLeft: "3-15" });
    expect(applyEditPatch(result, { _benchLow: "5", _benchHigh: "25" }).benchSetAsLeft).toBe("5-25");
    expect(applyEditPatch(result, { _benchHigh: "" }).benchSetAsLeft).toBe("3");
    expect(applyEditPatch(result, { _benchLow: "", _benchHigh: "" }).benchSetAsLeft).toBe("");
  });

  it("named fields overlay directly and synthetic keys never leak", () => {
    const result = report({ tagOrUnit: "PV-1" });
    const merged = applyEditPatch(result, { tagOrUnit: "PV-2", _valveModel: "EZ" });
    expect(merged.tagOrUnit).toBe("PV-2");
    expect("_valveModel" in merged).toBe(false);
    expect(merged.valveModelSize).toBe("EZ");
  });

  it("actuator model/size overrides rebuild actuatorModelSize", () => {
    const result = report({ actuatorModelSize: "667 45" });
    const merged = applyEditPatch(result, { _actuatorModel: "657" });
    expect(merged.actuatorModelSize).toBe("657 45");
  });
});
