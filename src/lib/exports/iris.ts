import db from "../db";
import type { ParsedPdfReport } from "../imports/pdfParser";
import type { RepairReport } from "../types";

// Indices of "status" columns — IRIS expects these unquoted (e.g. No, Yes)
// Valve status=11, Actuator status=42, Accessory status=63,
// Device 1 status=78, Device 2 status=103, Device 3 status=128
const STATUS_COLS = new Set([11, 42, 63, 78, 103, 128]);

// Headers exactly as IRIS expects: tab-prefixed, quoted, 153 columns total
const HEADERS = [
  "\tTag",
  "\tType",
  "\tArea",
  "\tApplication",
  "\tCriticality",
  "\tService description",
  "\tLocation",
  "\tGPS coordinates",
  "\tP & ID no.",
  "\tDatasheet no.",
  "\tKeywords",
  "\tValve status",
  "\tValve manufacturer",
  "\tValve model",
  "\tValve serial number",
  "\tValve vendor asset Id",
  "\tValve size",
  "\tValve pressure class",
  "\tValve rated travel",
  "\tValve seat material",
  "\tValve leak class",
  "\tValve port size",
  "\tValve body material",
  "\tValve trim style/number",
  "\tValve plug/disc/gate/ball material",
  "\tValve stem/shaft material",
  "\tValve stem diameter",
  "\tValve cage material",
  "\tValve packing type/material",
  "\tValve process fluid",
  "\tCapacity",
  "\tCapacity units",
  "\tSet pressure",
  "\tSet pressure units",
  "\tInlet size",
  "\tInlet size units",
  "\tInlet rating/type",
  "\tOutlet size",
  "\tOutlet size units",
  "\tOutlet rating/type",
  "\tOrifice size/letter",
  "\tValve flow direction",
  "\tActuator status",
  "\tActuator manufacturer",
  "\tActuator model",
  "\tActuator size",
  "\tActuator serial number",
  "\tActuator vendor asset Id",
  "\tActuator lower bench set",
  "\tActuator upper bench set",
  "\tActuator nominal supply pressure",
  "\tActuator stroke time",
  "\tActuator fail action",
  "\tActuator voltage",
  "\tActuator phase",
  "\tActuator torque",
  "\tActuator Order/PO",
  "\tActuator Speed rating",
  "\tActuator Power supply",
  "\tActuator Temperature range",
  "\tActuator Motor Current",
  "\tActuator Duty Cycle",
  "\tActuator air",
  "\tAccessory status",
  "\tAccessories Manufacturer",
  "\tAccessories Model",
  "\tAccessories Serial number",
  "\tAccessories Vendor asset Id",
  "\tAccessories Gearbox",
  "\tAccessories Volume booster",
  "\tAccessories Quick release",
  "\tAccessories Solenoid valve",
  "\tAccessories Instrument regulator",
  "\tAccessories Pressure switch",
  "\tAccessories Position transmitter",
  "\tAccessories Limit switch",
  "\tAccessories Trip valve",
  "\tAccessories Handwheel",
  "\tDevice 1 status",
  "\tDevice 1 Type",
  "\tDevice 1 Type (Other)",
  "\tDevice 1 Manufacturer",
  "\tDevice 1 Model number",
  "\tDevice 1 Model number (other)",
  "\tDevice 1 Serial number",
  "\tDevice 1 Vendor asset Id",
  "\tDevice 1 Diagnostic tier",
  "\tDevice 1 Supply pressure setpoint",
  "\tDevice 1 Bleed rate",
  "\tDevice 1 Relay type",
  "\tDevice 1 Bleed type",
  "\tDevice 1 Supply fluid",
  "\tDevice 1 Other supply fluid",
  "\tDevice 1 Output pressure",
  "\tDevice 1 Instrument action",
  "\tDevice 1 Bourdon tube range",
  "\tDevice 1 Prop band/fulcrum setting",
  "\tDevice 1 Instrument actuation frequency",
  "\tDevice 1 Level controller interface",
  "\tDevice 1 Other level controller interface",
  "\tDevice 1 Level controller action",
  "\tDevice 1 Level controller vessel connection",
  "\tDevice 1 Vent id",
  "\tDevice 2 status",
  "\tDevice 2 Type",
  "\tDevice 2 Type (Other)",
  "\tDevice 2 Manufacturer",
  "\tDevice 2 Model number",
  "\tDevice 2 Model number (other)",
  "\tDevice 2 Serial number",
  "\tDevice 2 Vendor asset Id",
  "\tDevice 2 Diagnostic tier",
  "\tDevice 2 Supply pressure setpoint",
  "\tDevice 2 Bleed rate",
  "\tDevice 2 Relay type",
  "\tDevice 2 Bleed type",
  "\tDevice 2 Supply fluid",
  "\tDevice 2 Other supply fluid",
  "\tDevice 2 Output pressure",
  "\tDevice 2 Instrument action",
  "\tDevice 2 Bourdon tube range",
  "\tDevice 2 Prop band/fulcrum setting",
  "\tDevice 2 Instrument actuation frequency",
  "\tDevice 2 Level controller interface",
  "\tDevice 2 Other level controller interface",
  "\tDevice 2 Level controller action",
  "\tDevice 2 Level controller vessel connection",
  "\tDevice 2 Vent id",
  "\tDevice 3 status",
  "\tDevice 3 Type",
  "\tDevice 3 Type (Other)",
  "\tDevice 3 Manufacturer",
  "\tDevice 3 Model number",
  "\tDevice 3 Model number (other)",
  "\tDevice 3 Serial number",
  "\tDevice 3 Vendor asset Id",
  "\tDevice 3 Diagnostic tier",
  "\tDevice 3 Supply pressure setpoint",
  "\tDevice 3 Bleed rate",
  "\tDevice 3 Relay type",
  "\tDevice 3 Bleed type",
  "\tDevice 3 Supply fluid",
  "\tDevice 3 Other supply fluid",
  "\tDevice 3 Output pressure",
  "\tDevice 3 Instrument action",
  "\tDevice 3 Bourdon tube range",
  "\tDevice 3 Prop band/fulcrum setting",
  "\tDevice 3 Instrument actuation frequency",
  "\tDevice 3 Level controller interface",
  "\tDevice 3 Other level controller interface",
  "\tDevice 3 Level controller action",
  "\tDevice 3 Level controller vessel connection",
  "\tDevice 3 Vent id",
]; // 153 columns

// Split "3-15" bench set string into [lower, upper]
export function splitBenchSet(value: string): [string, string] {
  const m = value.match(/^([0-9.]+)\s*[-–]\s*([0-9.]+)/);
  if (m) return [m[1], m[2]];
  return [value, ""];
}

/**
 * Split a combined "model size" string into separate model and size parts.
 * "EZ 1-1/2""  → { model: "EZ", size: '1-1/2"' }
 * "DVC6200"    → { model: "DVC6200", size: "DVC6200" }   (no size found — use same for both)
 *
 * Size pattern: a dimension at the end of the string that starts with a digit,
 * optionally containing fractions (1-1/2) and ending with " or "in".
 */
export function splitModelSize(combined: string): { model: string; size: string } {
  if (!combined) return { model: "", size: "" };
  const s = combined.trim();
  // Match a trailing dimension: e.g. "1-1/2"", "3/4 in", "2""
  const m = s.match(/\s+(\d[\d/-]*\s*(?:"|in\.?|inch)?)\s*$/i);
  if (m) {
    return {
      model: s.slice(0, s.length - m[0].length).trim(),
      size: m[1].trim(),
    };
  }
  // No size component — put the same value in both columns (e.g. DVC6200)
  return { model: s, size: s };
}

// Returns exactly 153 values in column order
function reportToRow(r: RepairReport): string[] {
  const [benchLow, benchHigh] = splitBenchSet(
    r.benchSetAsLeft || r.benchSetAsFound || "",
  );
  const supplyPressure = r.supplyPressureAsLeft || r.supplyPressureAsFound;
  const failAction = r.failActionAsLeft || r.failActionAsFound;
  const { model: valveModel, size: valveSize } = splitModelSize(
    r.valveModelSize || "",
  );
  const { model: actuatorModel, size: actuatorSize } = splitModelSize(
    r.actuatorModelSize || "",
  );

  return [
    // ── 0-10  Basic ──────────────────────────────────────────────────────────
    r.tagOrUnit,
    "Control Valve",
    "", // [2] Area — intentionally left blank
    "", // [3] Application — intentionally left blank
    "",
    r.scopeOfWork,
    "", // [6] Location — intentionally left blank
    "",
    r.emrReference,
    r.crmodReference,
    "",

    // ── 11-41  Valve (status + 30 fields) ────────────────────────────────────
    "No", // [11] Valve status  ← unquoted by STATUS_COLS
    r.valveMake, // [12]
    valveModel, // [13] model (e.g. "EZ")
    r.valveSerialNumber, // [14]
    "", // [15] vendor asset id
    valveSize, // [16] size (e.g. '1-1/2"')
    r.valveClassConnection, // [17] pressure class
    r.ratedTravel, // [18]
    "", // [19] seat material
    r.seatLeakClass, // [20]
    r.valveTrimCharPort, // [21] port size
    "", // [22] body material
    r.valveTrimCharPort, // [23] trim style
    "", // [24] plug material
    "", // [25] stem material
    "", // [26] stem diameter
    "", // [27] cage material
    r.valvePackingConfiguration, // [28]
    r.process, // [29] process fluid
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "", // [30-40] capacity, set pressure, inlet/outlet, orifice
    r.valveFlowDirection, // [41]

    // ── 42-62  Actuator (status + 20 fields) ─────────────────────────────────
    "No", // [42] Actuator status  ← unquoted
    r.actuatorMake, // [43]
    actuatorModel, // [44] model
    actuatorSize, // [45] size
    r.actuatorSerialNumber, // [46]
    "", // [47] vendor asset id
    benchLow, // [48] lower bench set
    benchHigh, // [49] upper bench set
    supplyPressure, // [50] nominal supply pressure
    "", // [51] stroke time
    failAction, // [52] fail action
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "", // [53-61] voltage, phase, torque, order, speed, power, temp, current, duty
    r.actuatorAirAction, // [62]

    // ── 63-77  Accessory (status + 14 fields) ────────────────────────────────
    "No", // [63] Accessory status  ← unquoted
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "", // [64-77]

    // ── 78-102  Device 1 / Positioner (status + 24 fields) ───────────────────
    "No", // [78] Device 1 status  ← unquoted
    r.positionerMake ? "Positioner" : "", // [79] Type
    "", // [80] Type (Other)
    r.positionerMake, // [81] Manufacturer
    r.positionerModelAction, // [82] Model number
    "", // [83] Model number (other)
    r.positionerSerialNumber, // [84] Serial number
    "", // [85] Vendor asset Id
    "", // [86] Diagnostic tier
    supplyPressure, // [87] Supply pressure setpoint
    "", // [88] Bleed rate
    "", // [89] Relay type
    "", // [90] Bleed type
    "", // [91] Supply fluid
    "", // [92] Other supply fluid
    "", // [93] Output pressure
    r.positionerModelAction, // [94] Instrument action
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "", // [95-102]

    // ── 103-127  Device 2 (status + 24 empty) ────────────────────────────────
    "No", // [103] Device 2 status  ← unquoted
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "", // [104-127]

    // ── 128-152  Device 3 (status + 24 empty) ────────────────────────────────
    "No", // [128] Device 3 status  ← unquoted
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "", // [129-152]
  ];
}

function buildCsv(reports: RepairReport[]): string {
  // Header row: every header is quoted (tab prefix already embedded in value)
  const headerLine = HEADERS.map((h) => `"${h}"`).join(",");

  const dataLines = reports.map((r) => {
    const cells = reportToRow(r);
    return cells
      .map((value, colIdx) => {
        const s = String(value ?? "");
        if (s === "") return "";
        // Status columns are unquoted plain values (No / Yes)
        if (STATUS_COLS.has(colIdx)) return s;
        // All other text: wrap in quotes with tab prefix, escape inner quotes
        return `"\t${s.replace(/"/g, '""')}"`;
      })
      .join(",");
  });

  return [headerLine, ...dataLines].join("\r\n");
}

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Export a single report as an IRIS-compatible CSV */
export async function exportIrisCsv(reportId: string): Promise<void> {
  const report = await db.reports.get(reportId);
  if (!report) throw new Error("Report not found");
  triggerDownload(`${report.reportNumber}-iris.csv`, buildCsv([report]));
}

/** Map a parsed PDF report to a RepairReport-compatible shape for CSV building */
function parsedToReport(p: ParsedPdfReport): RepairReport {
  return {
    id: crypto.randomUUID(),
    reportNumber: "",
    status: "Complete",
    createdAt: "",
    updatedAt: "",
    tagOrUnit: p.tagOrUnit,
    customer: p.customer,
    technician: p.technician,
    process: p.process,
    emrReference: p.emrReference,
    crmodReference: p.crmodReference,
    siteId: "",
    siteTitle: p.siteTitle,
    repairDate: p.repairDate,
    scopeOfWork: p.scopeOfWork,
    recommendations: "",
    futureRecommendations: "",
    notes: "",
    repairScopeCompleted: false,
    irisSyncedAt: null,
    valveMake: p.valveMake,
    valveSerialNumber: p.valveSerialNumber,
    valveModelSize: p.valveModelSize,
    valveClassConnection: p.valveClassConnection,
    valvePackingConfiguration: p.valvePackingConfiguration,
    valveTrimCharPort: p.valveTrimCharPort,
    valveFlowDirection: p.valveFlowDirection,
    bodyBonnetBolting: "",
    actuatorMake: p.actuatorMake,
    actuatorSerialNumber: p.actuatorSerialNumber,
    actuatorModelSize: p.actuatorModelSize,
    actuatorActionHandwheel: p.actuatorActionHandwheel,
    actuatorMounting: "",
    actuatorPosition: "",
    positionerMake: p.positionerMake,
    positionerSerialNumber: p.positionerSerialNumber,
    positionerModelAction: p.positionerModelAction,
    constructionChanged: false,
    ratedTravel: p.ratedTravel,
    benchSetAsFound: "",
    benchSetAsLeft: p.benchSetAsLeft,
    openSignalAsFound: "",
    openSignalAsLeft: p.openSignalAsLeft,
    closedSignalAsFound: "",
    closedSignalAsLeft: p.closedSignalAsLeft,
    supplyPressureAsFound: "",
    supplyPressureAsLeft: p.supplyPressureAsLeft,
    failActionAsFound: "",
    failActionAsLeft:
      (p.failActionAsLeft as RepairReport["failActionAsLeft"]) || "",
    actuatorAirAction:
      (p.actuatorAirAction as RepairReport["actuatorAirAction"]) || "",
    calibrationTechnician: p.technician,
    testWitness: "",
    testTechnician: "",
    testDate: "",
    gasTestPressure: "",
    gasTestResult: "",
    diagnosticsCompletedAsFound: false,
    diagnosticsCompletedAsLeft: false,
    seatLeakClass: p.seatLeakClass,
    seatLeakTestPressure: "",
    strokedFromControlRoom: false,
    allowableLeakage: "",
    actualLeakage: "",
    bodyBonnetTorque: "",
    packingTorque: "",
    hydroTestPressure: "",
    hydroTestDuration: "",
  };
}

/** Export parsed PDF reports as an IRIS-compatible CSV */
export function exportIrisCsvFromParsed(parsed: ParsedPdfReport[]): void {
  if (!parsed.length) throw new Error("No parsed reports");
  const reports = parsed.map(parsedToReport);
  const filename =
    parsed.length === 1
      ? `${parsed[0].tagOrUnit || "import"}-iris.csv`
      : `pdf-iris-export-${new Date().toISOString().slice(0, 10)}.csv`;
  triggerDownload(filename, buildCsv(reports));
}

/** Export multiple reports as an IRIS-compatible CSV (one row per report) */
export async function exportIrisCsvMulti(reportIds: string[]): Promise<void> {
  const reports = await Promise.all(reportIds.map((id) => db.reports.get(id)));
  const valid = reports.filter((r): r is RepairReport => Boolean(r));
  if (valid.length === 0) throw new Error("No reports found");
  const filename =
    valid.length === 1
      ? `${valid[0].reportNumber}-iris.csv`
      : `applied-control-iris-export-${new Date().toISOString().slice(0, 10)}.csv`;
  triggerDownload(filename, buildCsv(valid));
}
