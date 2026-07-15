import db from "../db";
import type { ParsedPdfReport } from "../imports/pdfParser";
import type { RepairReport } from "../types";

export type IrisAssetType =
  | "Control Valve" | "Isolation Valve" | "Motor Operated Valve"
  | "Relief Valve" | "Manual Valve" | "Regulator" | "Steam Trap"
  | "General" | "Machinery" | "Measurement" | "Tank";

// Indices of "status" columns — IRIS expects these unquoted (e.g. No, Yes)
const STATUS_COLS_CV  = new Set([11, 42, 63, 78, 103, 128]); // CV/IV: Valve, Actuator, Accessory, Device 1-3
const STATUS_COLS_RV  = new Set([11, 42]);                    // RV: Valve, Pilot
const STATUS_COLS_MV   = new Set([11, 42]);  // Manual Valve: Valve, Accessory
const STATUS_COLS_REG  = new Set([11, 22]);  // Regulator: Regulator, Pilot
const STATUS_COLS_ST   = new Set([11]);      // Steam Trap
const STATUS_COLS_GEN  = new Set([15]);      // General: General status at col 15
const STATUS_COLS_MACH = new Set<number>([]); // Machinery: no status columns
const STATUS_COLS_MEAS = new Set([11, 19]);  // Measurement: Measurement, Element
const STATUS_COLS_TANK = new Set([11]);      // Tank

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
]; // 153 columns — Control Valve

// Relief Valve template: 49 columns (valve + pilot, no actuator/accessories/devices)
const RELIEF_VALVE_HEADERS = [
  "\tTag", "\tType", "\tArea", "\tApplication", "\tCriticality",
  "\tService description", "\tLocation", "\tGPS coordinates",
  "\tP & ID no.", "\tDatasheet no.", "\tKeywords",
  // Valve section [11-41]
  "\tValve status", "\tValve manufacturer", "\tValve model",
  "\tValve serial number", "\tValve vendor asset Id", "\tValve size",
  "\tValve pressure class", "\tValve rated travel", "\tValve seat material",
  "\tValve leak class", "\tValve port size", "\tValve body material",
  "\tValve trim style/number", "\tValve plug/disc/gate/ball material",
  "\tValve stem/shaft material", "\tValve stem diameter", "\tValve cage material",
  "\tValve packing type/material", "\tValve process fluid",
  "\tCapacity", "\tCapacity units", "\tSet pressure", "\tSet pressure units",
  "\tInlet size", "\tInlet size units", "\tInlet rating/type",
  "\tOutlet size", "\tOutlet size units", "\tOutlet rating/type",
  "\tOrifice size/letter", "\tValve flow direction",
  // Pilot section [42-48]
  "\tPilot status", "\tPilot manufacturer", "\tPilot model",
  "\tPilot serial number", "\tPilot vendor asset Id",
  "\tPilot size", "\tPilot spring range",
]; // 49 columns — Relief Valve

// Split "3-15" bench set string into [lower, upper]
export function splitBenchSet(value: string): [string, string] {
  if (!value) return ["", ""];
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
export function reportToRow(r: RepairReport): string[] {
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

// Isolation Valve uses the same 153-column layout as Control Valve — only Type differs
export function reportToIsolationValveRow(r: RepairReport): string[] {
  const row = reportToRow(r);
  row[1] = "Isolation Valve";
  return row;
}

// Returns exactly 49 values for the Relief Valve template
export function reportToReliefValveRow(r: RepairReport): string[] {
  const { model: valveModel, size: valveSize } = splitModelSize(r.valveModelSize || "");
  return [
    // [0-10] Basic
    r.tagOrUnit, "Relief Valve", "", "", "",
    r.scopeOfWork, "", "",
    r.emrReference, r.crmodReference, "",
    // [11-41] Valve
    "No",               // [11] Valve status — unquoted
    r.valveMake,        // [12]
    valveModel,         // [13]
    r.valveSerialNumber,// [14]
    "",                 // [15] vendor asset id
    valveSize,          // [16]
    r.valveClassConnection, // [17] pressure class
    r.ratedTravel,      // [18]
    "",                 // [19] seat material
    r.seatLeakClass,    // [20]
    r.valveTrimCharPort,// [21] port size
    "",                 // [22] body material
    r.valveTrimCharPort,// [23] trim style
    "", "", "", "",     // [24-27] plug, stem, stem dia, cage
    r.valvePackingConfiguration, // [28]
    r.process,          // [29] process fluid
    "", "", "", "",     // [30-33] capacity + set pressure
    "", "", "",         // [34-36] inlet
    "", "", "",         // [37-39] outlet
    "",                 // [40] orifice
    r.valveFlowDirection, // [41]
    // [42-48] Pilot
    "No", "", "", "", "", "", "", // [42-48] Pilot status + 6 fields
  ];
}

// Manual Valve: 57 columns — valve section + accessories, no actuator/devices
const MANUAL_VALVE_HEADERS = [
  "\tTag", "\tType", "\tArea", "\tApplication", "\tCriticality", "\tService description",
  "\tLocation", "\tGPS coordinates", "\tP & ID no.", "\tDatasheet no.", "\tKeywords",
  // Valve [11-41]
  "\tValve status", "\tValve manufacturer", "\tValve model", "\tValve serial number",
  "\tValve vendor asset Id", "\tValve size", "\tValve pressure class", "\tValve rated travel",
  "\tValve seat material", "\tValve leak class", "\tValve port size", "\tValve body material",
  "\tValve trim style/number", "\tValve plug/disc/gate/ball material", "\tValve stem/shaft material",
  "\tValve stem diameter", "\tValve cage material", "\tValve packing type/material", "\tValve process fluid",
  "\tCapacity", "\tCapacity units", "\tSet pressure", "\tSet pressure units",
  "\tInlet size", "\tInlet size units", "\tInlet rating/type",
  "\tOutlet size", "\tOutlet size units", "\tOutlet rating/type",
  "\tOrifice size/letter", "\tValve flow direction",
  // Accessories [42-56]
  "\tAccessory status", "\tAccessories Manufacturer", "\tAccessories Model",
  "\tAccessories Serial number", "\tAccessories Vendor asset Id", "\tAccessories Gearbox",
  "\tAccessories Volume booster", "\tAccessories Quick release", "\tAccessories Solenoid valve",
  "\tAccessories Instrument regulator", "\tAccessories Pressure switch",
  "\tAccessories Position transmitter", "\tAccessories Limit switch",
  "\tAccessories Trip valve", "\tAccessories Handwheel",
]; // 57 columns

export function reportToManualValveRow(r: RepairReport): string[] {
  const { model: valveModel, size: valveSize } = splitModelSize(r.valveModelSize || "");
  return [
    r.tagOrUnit, "Manual Valve", "", "", "", r.scopeOfWork, "", "",
    r.emrReference, r.crmodReference, "",
    "No", r.valveMake, valveModel, r.valveSerialNumber, "", valveSize,
    r.valveClassConnection, r.ratedTravel, "", r.seatLeakClass, r.valveTrimCharPort, "",
    r.valveTrimCharPort, "", "", "", "", r.valvePackingConfiguration, r.process,
    "", "", "", "", "", "", "", "", "", "", "", r.valveFlowDirection,
    "No", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
  ];
}

// Regulator: 29 columns — regulator section + pilot section
const REGULATOR_HEADERS = [
  "\tTag", "\tType", "\tArea", "\tApplication", "\tCriticality", "\tService description",
  "\tLocation", "\tGPS coordinates", "\tP & ID no.", "\tDatasheet no.", "\tKeywords",
  // Regulator [11-21]
  "\tRegulator status", "\tRegulator manufacturer", "\tRegulator model number",
  "\tRegulator serial number", "\tRegulator vendor asset Id", "\tRegulator size",
  "\tRegulator rating", "\tRegulator orifice size", "\tRegulator spring range",
  "\tRegulator setpoint", "\tRegulator setpoint units",
  // Pilot [22-28]
  "\tPilot status", "\tPilot manufacturer", "\tPilot model",
  "\tPilot serial number", "\tPilot vendor asset Id", "\tPilot size", "\tPilot spring range",
]; // 29 columns

export function reportToRegulatorRow(r: RepairReport): string[] {
  const { model: valveModel, size: valveSize } = splitModelSize(r.valveModelSize || "");
  return [
    r.tagOrUnit, "Regulator", "", "", "", r.scopeOfWork, "", "",
    r.emrReference, r.crmodReference, "",
    "No", r.valveMake, valveModel, r.valveSerialNumber, "", valveSize,
    r.valveClassConnection, "", "", "", "",
    "No", "", "", "", "", "", "",
  ];
}

// Steam Trap: 33 columns — steam trap section only
const STEAM_TRAP_HEADERS = [
  "\tTag", "\tType", "\tArea", "\tApplication", "\tCriticality", "\tService description",
  "\tLocation", "\tGPS coordinates", "\tP & ID no.", "\tDatasheet no.", "\tKeywords",
  // Steam Trap [11-32]
  "\tSteam Trap status", "\tSteam Trap manufacturer", "\tSteam Trap model",
  "\tSteam Trap serial number", "\tSteam Trap vendor asset Id", "\tSteam Trap size",
  "\tSteam Trap type", "\tSteam Trap connection", "\tSteam Trap orifice size",
  "\tSteam Trap install orientation", "\tSteam Trap application type",
  "\tSteam Trap inlet pressure", "\tSteam Trap outlet pressure",
  "\tSteam Trap inlet temperature", "\tSteam Trap outlet temperature",
  "\tSteam Trap ultrasonic reading", "\tSteam Trap ultrasonic dB flow",
  "\tSteam Trap inlet isolation valve", "\tSteam Trap outlet isolation valve",
  "\tSteam Trap inlet strainer", "\tSteam Trap outlet check valve",
  "\tSteam Trap condensate recovered",
]; // 33 columns

export function reportToSteamTrapRow(r: RepairReport): string[] {
  const { model: valveModel, size: valveSize } = splitModelSize(r.valveModelSize || "");
  return [
    r.tagOrUnit, "Steam Trap", "", "", "", r.scopeOfWork, "", "",
    r.emrReference, r.crmodReference, "",
    "No", r.valveMake, valveModel, r.valveSerialNumber, "", valveSize,
    "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
  ];
}

// Motor Operated Valve: same 153-col layout as Control Valve, different Type
export function reportToMotorOperatedValveRow(r: RepairReport): string[] {
  const row = reportToRow(r);
  row[1] = "Motor Operated Valve";
  return row;
}

// General: 24 columns
const GENERAL_HEADERS = [
  "\tTag", "\tType", "\tArea", "\tApplication", "\tCriticality", "\tService description",
  "\tLocation", "\tGPS coordinates", "\tP & ID no.", "\tDatasheet no.", "\tKeywords",
  "\tGeneral Subtype", "\tEquipment Type Description", "\tEquipment Type", "\tSub Type Description",
  "\tGeneral status", "\tGeneral manufacturer", "\tGeneral model", "\tGeneral serial number",
  "\tGeneral vendor asset Id", "\tGeneral size", "\tGeneral custom 1", "\tGeneral custom 2", "\tGeneral custom 3",
]; // 24 columns

export function reportToGeneralRow(r: RepairReport): string[] {
  return [
    r.tagOrUnit, "General", "", "", "", r.scopeOfWork, "", "",
    r.emrReference, r.crmodReference, "",
    "", "", "", "",  // [11-14] Subtype fields
    "No",            // [15] General status
    "", "", "", "", "", "", "", "",  // [16-23]
  ];
}

// Machinery: 11 columns (basic section only)
const MACHINERY_HEADERS = [
  "\tTag", "\tType", "\tArea", "\tApplication", "\tCriticality", "\tService description",
  "\tLocation", "\tGPS coordinates", "\tP & ID no.", "\tDatasheet no.", "\tKeywords",
]; // 11 columns

export function reportToMachineryRow(r: RepairReport): string[] {
  return [
    r.tagOrUnit, "Machinery", "", "", "", r.scopeOfWork, "", "",
    r.emrReference, r.crmodReference, "",
  ];
}

// Measurement: 28 columns
const MEASUREMENT_HEADERS = [
  "\tTag", "\tType", "\tArea", "\tApplication", "\tCriticality", "\tService description",
  "\tLocation", "\tGPS coordinates", "\tP & ID no.", "\tDatasheet no.", "\tKeywords",
  "\tMeasurement status", "\tMeasurement type", "\tMeasurement technology",
  "\tTransmitter manufacturer", "\tTransmitter model", "\tTransmitter serial number",
  "\tTransmitter vendor asset Id", "\tEmission Vent ID",
  "\tElement status", "\tElement manufacturer", "\tElement model", "\tElement serial number",
  "\tElement vendor asset Id", "\tElement size", "\tElement pressure class",
  "\tElement K-factor", "\tElement cal number",
]; // 28 columns

export function reportToMeasurementRow(r: RepairReport): string[] {
  return [
    r.tagOrUnit, "Measurement", "", "", "", r.scopeOfWork, "", "",
    r.emrReference, r.crmodReference, "",
    "No", "", "", "", "", "", "", "",  // [11-18] Measurement status + transmitter fields
    "No", "", "", "", "", "", "", "", "",  // [19-27] Element section
  ];
}

// Tank: 36 columns
const TANK_HEADERS = [
  "\tTag", "\tType", "\tArea", "\tApplication", "\tCriticality", "\tService description",
  "\tLocation", "\tGPS coordinates", "\tP & ID no.", "\tDatasheet no.", "\tKeywords",
  "\tTank status", "\tTank Manufacturer", "\tTank Model", "\tTank Serial Number",
  "\tTank vendor asset Id", "\tTank Product", "\tTank API Standard", "\tTank Annex",
  "\tTank Edition", "\tTank Nominal Diameter", "\tTank Maximum Capacity",
  "\tTank Design Specific Gravity", "\tTank Design Pressure", "\tTank Pressure Combination Factor",
  "\tTank Fabricated By", "\tTank Erected By", "\tTank Year Completed",
  "\tTank Nominal Height", "\tTank Design Liquid Level", "\tTank Design Metal Temperature",
  "\tTank Maximum Design Temperature", "\tTank Stress Relief", "\tTank Purchaser's Tank Number",
  "\tTank Shell Course", "\tTank Material",
]; // 36 columns

export function reportToTankRow(r: RepairReport): string[] {
  return [
    r.tagOrUnit, "Tank", "", "", "", r.scopeOfWork, "", "",
    r.emrReference, r.crmodReference, "",
    "No", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "",
  ];
}

function assetTypeSuffix(t: IrisAssetType): string {
  const map: Record<IrisAssetType, string> = {
    "Control Valve": "", "Isolation Valve": "-iv", "Motor Operated Valve": "-mov",
    "Relief Valve": "-rv", "Manual Valve": "-mv", "Regulator": "-reg", "Steam Trap": "-st",
    "General": "-gen", "Machinery": "-mach", "Measurement": "-meas", "Tank": "-tank",
  };
  return map[t] ?? "";
}

// Per-asset-type CSV config: full column template, status (unquoted) columns,
// and the row builder. Shared by buildCsv and the preview/column helpers.
const ASSET_CFG: Record<IrisAssetType, { headers: string[]; statusCols: Set<number>; toRow: (r: RepairReport) => string[] }> = {
  "Control Valve":       { headers: HEADERS,              statusCols: STATUS_COLS_CV,   toRow: reportToRow },
  "Isolation Valve":     { headers: HEADERS,              statusCols: STATUS_COLS_CV,   toRow: reportToIsolationValveRow },
  "Motor Operated Valve":{ headers: HEADERS,              statusCols: STATUS_COLS_CV,   toRow: reportToMotorOperatedValveRow },
  "Relief Valve":        { headers: RELIEF_VALVE_HEADERS, statusCols: STATUS_COLS_RV,   toRow: reportToReliefValveRow },
  "Manual Valve":        { headers: MANUAL_VALVE_HEADERS, statusCols: STATUS_COLS_MV,   toRow: reportToManualValveRow },
  "Regulator":           { headers: REGULATOR_HEADERS,    statusCols: STATUS_COLS_REG,  toRow: reportToRegulatorRow },
  "Steam Trap":          { headers: STEAM_TRAP_HEADERS,   statusCols: STATUS_COLS_ST,   toRow: reportToSteamTrapRow },
  "General":             { headers: GENERAL_HEADERS,      statusCols: STATUS_COLS_GEN,  toRow: reportToGeneralRow },
  "Machinery":           { headers: MACHINERY_HEADERS,    statusCols: STATUS_COLS_MACH, toRow: reportToMachineryRow },
  "Measurement":         { headers: MEASUREMENT_HEADERS,  statusCols: STATUS_COLS_MEAS, toRow: reportToMeasurementRow },
  "Tank":                { headers: TANK_HEADERS,         statusCols: STATUS_COLS_TANK, toRow: reportToTankRow },
};

/** Strip the leading tab IRIS prepends to every header for display/lookup. */
const cleanHeader = (h: string): string => h.replace(/^\t/, "");

/** Ordered, display-clean column labels for an asset type's IRIS template. */
export function irisColumnsFor(assetType: IrisAssetType = "Control Valve"): string[] {
  return ASSET_CFG[assetType].headers.map(cleanHeader);
}

/**
 * The full CSV row a parsed report would export as, zipped with clean headers.
 * Lets the import page show every column (mapped + blank) with its live value.
 */
export function irisPreviewRow(
  parsed: ParsedPdfReport,
  assetType: IrisAssetType = "Control Valve",
): Array<{ header: string; value: string }> {
  const { headers, toRow } = ASSET_CFG[assetType];
  const cells = toRow(parsedToReport(parsed));
  return headers.map((h, i) => ({ header: cleanHeader(h), value: String(cells[i] ?? "") }));
}

function buildCsv(
  reports: RepairReport[],
  assetType: IrisAssetType = "Control Valve",
  extras?: Array<Record<string, string> | undefined>,
): string {
  const { headers, statusCols, toRow } = ASSET_CFG[assetType];
  const labelToIndex = new Map(headers.map((h, i) => [cleanHeader(h), i]));

  const headerLine = headers.map((h) => `"${h}"`).join(",");
  const dataLines = reports.map((r, rIdx) => {
    const cells = toRow(r);
    // Overlay hand-entered "extra column" values by header label. Presence of
    // a key (even "") wins, so the user can fill blanks or clear a cell.
    const ex = extras?.[rIdx];
    if (ex) {
      for (const [label, val] of Object.entries(ex)) {
        const idx = labelToIndex.get(label);
        if (idx !== undefined) cells[idx] = val;
      }
    }
    return cells
      .map((value, colIdx) => {
        const s = String(value ?? "");
        if (s === "") return "";
        if (statusCols.has(colIdx)) return s;
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
export function exportIrisCsvFromParsed(
  parsed: ParsedPdfReport[],
  assetType: IrisAssetType = "Control Valve",
  extras?: Array<Record<string, string> | undefined>,
): void {
  if (!parsed.length) throw new Error("No parsed reports");
  const reports = parsed.map(parsedToReport);
  const suffix = assetTypeSuffix(assetType);
  const filename =
    parsed.length === 1
      ? `${parsed[0].tagOrUnit || "import"}${suffix}-iris.csv`
      : `pdf-iris-export${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
  triggerDownload(filename, buildCsv(reports, assetType, extras));
}

/** Export multiple reports as an IRIS-compatible CSV (one row per report) */
export async function exportIrisCsvMulti(
  reportIds: string[],
  assetType: IrisAssetType = "Control Valve",
): Promise<void> {
  const reports = await Promise.all(reportIds.map((id) => db.reports.get(id)));
  const valid = reports.filter((r): r is RepairReport => Boolean(r));
  if (valid.length === 0) throw new Error("No reports found");
  const suffix = assetTypeSuffix(assetType);
  const filename =
    valid.length === 1
      ? `${valid[0].reportNumber}${suffix}-iris.csv`
      : `applied-control-iris-export${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
  triggerDownload(filename, buildCsv(valid, assetType));
}

// Normalize any common date string to YYYY-MM-DD; returns original if unrecognized.
function toIsoDate(s: string): string {
  if (!s) return "";
  const t = s.trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  // MM/DD/YYYY or M/D/YYYY
  const mdy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  // MM-DD-YYYY (not ISO, American with dashes)
  const mdyDash = t.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (mdyDash) return `${mdyDash[3]}-${mdyDash[1]}-${mdyDash[2]}`;
  // "January 15, 2024" or "Jan 15, 2024"
  const longMonth: Record<string, string> = {
    january:"01",february:"02",march:"03",april:"04",may:"05",june:"06",
    july:"07",august:"08",september:"09",october:"10",november:"11",december:"12",
    jan:"01",feb:"02",mar:"03",apr:"04",jun:"06",jul:"07",aug:"08",
    sep:"09",oct:"10",nov:"11",dec:"12",
  };
  const named = t.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named) {
    const m = longMonth[named[1].toLowerCase()];
    if (m) return `${named[3]}-${m}-${named[2].padStart(2, "0")}`;
  }
  // "15-Jan-2024"
  const dmy = t.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (dmy) {
    const m = longMonth[dmy[2].toLowerCase()];
    if (m) return `${dmy[3]}-${m}-${dmy[1].padStart(2, "0")}`;
  }
  // Last resort: browser Date.parse (timezone-agnostic for date-only strings)
  const parsed = Date.parse(t);
  if (!isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return t;
}

// ── Records CSV (79-column template) ─────────────────────────────────────────
// Universal across all asset types — Control Valve, Relief Valve, Isolation Valve,
// Motor Operated Valve, Manual Valve, Regulator, Steam Trap, General, Machinery,
// Measurement, and Tank all write to the same record template. Asset type only
// determines which Assets CSV template is used, never which Records CSV.

const RECORD_HEADERS = [
  "\tId", "\tType", "\tDescription", "\tDetails", "\tRef. WO/MOC", "\tStatus",
  "\tDate closed", "\tFollow-up", "\tTest criteria", "\tTest results",
  "\tTest condition", "\tTest performance", "\tObservations", "\tOccurrence date",
  "\tRecords event", "\tCustomer contact",
  "\tValve health Condition (as left) score",
  "\tValve health Performance (as left) score",
  "\tValve health Condition (as found) score",
  "\tValve health Performance (as found) score",
  "\tVibration health",
  "\tAs-Found Performance Set point tracking",
  "\tAs-Found Performance Overshoot",
  "\tAs-Found Performance Offset",
  "\tAs-Found Performance Cycling",
  "\tAs-Found Performance Speed",
  "\tAs-Found Condition Valve friction",
  "\tAs-Found Condition Rated travel",
  "\tAs-Found Condition Seating profile",
  "\tAs-Found Condition Dynamic error band",
  "\tAs-Found Condition Drive signal",
  "\tAs-Left Performance Set point tracking",
  "\tAs-Left Performance Overshoot",
  "\tAs-Left Performance Offset",
  "\tAs-Left Performance Cycling",
  "\tAs-Left Performance Speed",
  "\tAs-Left Condition Valve friction",
  "\tAs-Left Condition Rated travel",
  "\tAs-Left Condition Seating profile",
  "\tAs-Left Condition Dynamic error band",
  "\tAs-Left Condition Drive signal",
  "\tVibration analysis balance",
  "\tVibration analysis alignment coupling",
  "\tVibration analysis bearings",
  "\tVibration analysis gears",
  "\tVibration analysis resonance",
  "\tVibration analysis looseness",
  "\tVibration analysis electrical",
  "\tVibration analysis process",
  "\tVibration analysis structure piping",
  "\tAs-Found Visual integrity Environmental (V/I)",
  "\tAs-Found Visual integrity Health and safety",
  "\tAs-Found Visual integrity Installation",
  "\tAs-Found Visual integrity Mechanical integrity",
  "\tAs-Found Visual integrity Obsolescence",
  "\tAs-Found Visual integrity Tagging signage",
  "\tAs-Left Visual integrity Environmental (V/I)",
  "\tAs-Left Visual integrity Health and safety",
  "\tAs-Left Visual integrity Installation",
  "\tAs-Left Visual integrity Mechanical integrity",
  "\tAs-Left Visual integrity Obsolescence",
  "\tAs-Left Visual integrity Tagging signage",
  "\tAssets", "\tKeywords",
  "\tRecommendation 1 Title", "\tRecommendation 1 Status", "\tRecommendation 1 Content",
  "\tRecommendation 2 Title", "\tRecommendation 2 Status", "\tRecommendation 2 Content",
  "\tRecommendation 3 Title", "\tRecommendation 3 Status", "\tRecommendation 3 Content",
  "\tRecommendation 4 Title", "\tRecommendation 4 Status", "\tRecommendation 4 Content",
  "\tRecommendation 5 Title", "\tRecommendation 5 Status", "\tRecommendation 5 Content",
]; // 79 columns

// IRIS Observations field renders HTML. Build the HTML content for that field.
// Section headers use <strong>, each line is a <p>, blank spacers are <p><br></p>.
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildObservationsHtml(p: ParsedPdfReport): string {
  // AI-generated HTML takes priority — it contains full per-component findings
  if (p.observationsHtml?.trim()) return p.observationsHtml;

  // Fallback: build structured HTML from available fields
  const chunks: string[] = [];

  // ── Observations & Findings ─────────────────────────────────────────────────
  const findingLines: string[] = [];
  if (p.scopeOfWork) findingLines.push(`Scope of Work: ${p.scopeOfWork}`);
  const actuatorDesc = [p.actuatorMake, p.actuatorModelSize].filter(Boolean).join(" ");
  if (actuatorDesc) findingLines.push(`Actuator: ${actuatorDesc}`);
  const positionerDesc = [p.positionerMake, p.positionerModelAction].filter(Boolean).join(" ");
  if (positionerDesc) findingLines.push(`Positioner: ${positionerDesc}`);

  if (findingLines.length > 0) {
    chunks.push(`<p><strong>Observations &amp; Findings</strong></p>`);
    findingLines.forEach((l) => chunks.push(`<p>${esc(l)}</p>`));
  }

  // ── Work Performed Summary ─────────────────────────────────────────────────
  const workLines: string[] = [];
  const calParts: string[] = [];
  if (p.benchSetAsLeft) calParts.push(`Bench Set (As Left): ${p.benchSetAsLeft}`);
  if (p.supplyPressureAsLeft) calParts.push(`Supply Pressure (As Left): ${p.supplyPressureAsLeft} psi`);
  if (p.failActionAsLeft) calParts.push(`Fail Action: ${p.failActionAsLeft}`);
  if (calParts.length > 0) workLines.push(`Actuator – ${calParts.join(" | ")}`);
  if (p.seatLeakClass) workLines.push(`Valve – Seat Leak Class: ${p.seatLeakClass}`);

  if (workLines.length > 0) {
    chunks.push(`<p><br></p>`);
    chunks.push(`<p><strong>Work Performed Summary</strong></p>`);
    workLines.forEach((l) => chunks.push(`<p>${esc(l)}</p>`));
  }

  return chunks.join("");
}

/** @deprecated Use buildObservationsHtml — kept for backwards compatibility */
export function buildObservationsText(p: ParsedPdfReport): string {
  return buildObservationsHtml(p);
}

function parsedToRecordRow(p: ParsedPdfReport): (string | number)[] {
  const obs = buildObservationsHtml(p);
  const woRef = p.emrReference || p.crmodReference || "";
  const e = ""; // empty cell shorthand

  return [
    // [0] Id — unquoted number (not tab-quoted)
    0,
    // [1-15] Core fields
    "Preventative",      // Type
    p.scopeOfWork,       // Description
    e,                   // Details
    woRef,               // Ref. WO/MOC
    "Identified",        // Status
    e, e, e, e, e, e,   // Date closed → Test performance (6 empty)
    obs,                 // Observations [12]
    toIsoDate(p.repairDate), // Occurrence date [13]
    e,                   // Records event [14]
    p.technician,        // Customer contact [15]
    // [16-20] Valve/vibration health scores (5 empty)
    e, e, e, e, e,
    // [21-30] As-Found Performance (5) + Condition (5) = 10 empty
    e, e, e, e, e, e, e, e, e, e,
    // [31-40] As-Left Performance (5) + Condition (5) = 10 empty
    e, e, e, e, e, e, e, e, e, e,
    // [41-49] Vibration analysis (9 empty)
    e, e, e, e, e, e, e, e, e,
    // [50-61] Visual integrity As-Found (6) + As-Left (6) = 12 empty
    e, e, e, e, e, e, e, e, e, e, e, e,
    // [62] Assets — tag links to the asset in Iris
    p.tagOrUnit,
    // [63] Keywords
    e,
    // [64-78] Recommendations 1-5 (all empty — no recommendations in ParsedPdfReport)
    e, e, e, e, e, e, e, e, e, e, e, e, e, e, e,
  ];
}

function buildRecordCsv(parsed: ParsedPdfReport[]): string {
  const headerLine = RECORD_HEADERS.map((h) => `"${h}"`).join(",");

  const dataLines = parsed.map((p) => {
    const cells = parsedToRecordRow(p);
    return cells
      .map((value, colIdx) => {
        // Col 0 (Id) is always an unquoted number
        if (colIdx === 0) return String(value);
        const s = String(value ?? "");
        if (s === "") return "";
        return `"\t${s.replace(/"/g, '""')}"`;
      })
      .join(",");
  });

  return [headerLine, ...dataLines].join("\r\n");
}

/** Export parsed PDF reports as an Iris record CSV (79 cols) */
export function exportRecordsCsvFromParsed(parsed: ParsedPdfReport[]): void {
  if (!parsed.length) throw new Error("No parsed reports");
  const date = new Date().toISOString().slice(0, 10);
  const filename =
    parsed.length === 1
      ? `${parsed[0].tagOrUnit || "import"}-iris-record.csv`
      : `pdf-iris-records-${date}.csv`;
  triggerDownload(filename, buildRecordCsv(parsed));
}
