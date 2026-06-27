import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db import so reportToRow can be imported without Dexie/IndexedDB
vi.mock("@/lib/db", () => ({ default: {} }));

import {
  splitBenchSet,
  splitModelSize,
  reportToRow,
} from "@/lib/exports/iris";
import type { RepairReport } from "@/lib/types";

// ── splitBenchSet ─────────────────────────────────────────────────────────────

describe("splitBenchSet", () => {
  it("splits standard dash-separated bench set", () => {
    expect(splitBenchSet("3-15")).toEqual(["3", "15"]);
  });

  it("splits with spaces around dash", () => {
    expect(splitBenchSet("3 - 15")).toEqual(["3", "15"]);
  });

  it("splits decimal values", () => {
    expect(splitBenchSet("3.5-15.5")).toEqual(["3.5", "15.5"]);
  });

  it("returns [value, ''] for no match", () => {
    expect(splitBenchSet("15 psi")).toEqual(["15 psi", ""]);
  });

  it("returns ['', ''] for empty string", () => {
    expect(splitBenchSet("")).toEqual(["", ""]);
  });
});

// ── splitModelSize ────────────────────────────────────────────────────────────

describe("splitModelSize", () => {
  it("splits model from trailing inch size", () => {
    const r = splitModelSize('EZ 1-1/2"');
    expect(r.model).toBe("EZ");
    expect(r.size).toBe('1-1/2"');
  });

  it("splits model from trailing 'in' size", () => {
    const r = splitModelSize("DVC6200 3/4 in");
    expect(r.model).toBe("DVC6200");
    expect(r.size).toBe("3/4 in");
  });

  it("returns same value in both when no size found", () => {
    const r = splitModelSize("DVC6200");
    expect(r.model).toBe("DVC6200");
    expect(r.size).toBe("DVC6200");
  });

  it("handles multi-word model", () => {
    const r = splitModelSize('Fisher EZ 2"');
    expect(r.model).toBe("Fisher EZ");
    expect(r.size).toBe('2"');
  });

  it("returns empty strings for empty input", () => {
    const r = splitModelSize("");
    expect(r.model).toBe("");
    expect(r.size).toBe("");
  });
});

// ── reportToRow ───────────────────────────────────────────────────────────────

function makeReport(overrides: Partial<RepairReport> = {}): RepairReport {
  return {
    id: "test-id",
    reportNumber: "R001",
    status: "Complete",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    tagOrUnit: "PV-4176B",
    customer: "Acme Corp",
    technician: "J. Smith",
    repairDate: "2024-01-15",
    process: "Steam",
    siteTitle: "Site A",
    scopeOfWork: "Overhaul",
    emrReference: "EMR-001",
    crmodReference: "CRMOD-001",
    valveMake: "Fisher",
    valveModelSize: "EZ 2\"",
    valveSerialNumber: "SN123",
    valveClassConnection: "Class 150",
    valvePackingConfiguration: "PTFE",
    valveTrimCharPort: "Equal%",
    valveFlowDirection: "Flow to close",
    bodyBonnetBolting: "",
    actuatorMake: "Fisher",
    actuatorModelSize: "667 SR 60",
    actuatorSerialNumber: "ACSN456",
    actuatorActionHandwheel: "DA",
    actuatorMounting: "Direct",
    actuatorPosition: "",
    positionerMake: "Fisher",
    positionerModelAction: "DVC6200",
    positionerSerialNumber: "POSN789",
    benchSetAsFound: "3-15",
    benchSetAsLeft: "3-15",
    openSignalAsFound: "3",
    openSignalAsLeft: "3",
    closedSignalAsFound: "15",
    closedSignalAsLeft: "15",
    supplyPressureAsFound: "35",
    supplyPressureAsLeft: "35",
    failActionAsFound: "Open",
    failActionAsLeft: "Open",
    actuatorAirAction: "Open",
    seatLeakClass: "Class IV",
    allowableLeakage: "0.01%",
    actualLeakage: "0%",
    gasTestPressure: "",
    gasTestResult: "",
    testWitness: "",
    testTechnician: "",
    ratedTravel: '1-1/2"',
    diagnosticsCompletedAsFound: false,
    diagnosticsCompletedAsLeft: false,
    strokedFromControlRoom: false,
    constructionChanged: false,
    repairScopeCompleted: true,
    notes: "No issues found",
    recommendations: "",
    futureRecommendations: "",
    calibrationTechnician: "",
    testDate: "",
    seatLeakTestPressure: "",
    bodyBonnetTorque: "",
    packingTorque: "",
    hydroTestPressure: "",
    hydroTestDuration: "",
    siteId: "",
    irisSyncedAt: null,
    ...overrides,
  };
}

describe("reportToRow", () => {
  it("returns exactly 153 columns", () => {
    const row = reportToRow(makeReport());
    expect(row).toHaveLength(153);
  });

  it("always outputs empty string for Area (index 2)", () => {
    const row = reportToRow(makeReport({ siteTitle: "Should not appear" }));
    expect(row[2]).toBe("");
  });

  it("always outputs empty string for Application (index 3)", () => {
    const row = reportToRow(makeReport({ process: "Should not appear" }));
    expect(row[3]).toBe("");
  });

  it("always outputs empty string for Location (index 6)", () => {
    const row = reportToRow(makeReport());
    expect(row[6]).toBe("");
  });

  it("puts 'No' at Valve status (index 11)", () => {
    expect(reportToRow(makeReport())[11]).toBe("No");
  });

  it("puts 'No' at Actuator status (index 42)", () => {
    expect(reportToRow(makeReport())[42]).toBe("No");
  });

  it("puts tag at index 0", () => {
    const row = reportToRow(makeReport({ tagOrUnit: "TV-123" }));
    expect(row[0]).toBe("TV-123");
  });

  it("splits valve model/size into separate columns", () => {
    const row = reportToRow(makeReport({ valveModelSize: 'EZ 2"' }));
    expect(row[13]).toBe("EZ");   // valve model
    expect(row[16]).toBe('2"');   // valve size
  });

  it("splits bench set into lower/upper columns", () => {
    const row = reportToRow(makeReport({ benchSetAsLeft: "3-15" }));
    expect(row[48]).toBe("3");   // lower bench set
    expect(row[49]).toBe("15");  // upper bench set
  });
});
