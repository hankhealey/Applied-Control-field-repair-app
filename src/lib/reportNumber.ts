import db from "./db";
import type { RepairReport } from "./types";

export async function generateReportNumber(): Promise<string> {
  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
  const countToday = await db.reports
    .filter((r) => r.reportNumber.startsWith(`RR-${datePart}-`))
    .count();
  const seq = String(countToday + 1).padStart(4, "0");
  return `RR-${datePart}-${seq}`;
}

export function emptyReport(id: string, reportNumber: string) {
  const now = new Date().toISOString();
  return {
    id,
    reportNumber,
    status: "Draft" as const,
    createdAt: now,
    updatedAt: now,

    tagOrUnit: "",
    customer: "",
    technician: "",
    process: "",
    emrReference: "",
    crmodReference: "",
    siteId: "",
    siteTitle: "",
    repairDate: now.slice(0, 10),
    scopeOfWork: "",
    recommendations: "",
    futureRecommendations: "",
    notes: "",
    repairScopeCompleted: false,

    valveMake: "",
    valveSerialNumber: "",
    valveModelSize: "",
    valveClassConnection: "",
    valvePackingConfiguration: "",
    valveTrimCharPort: "",
    valveFlowDirection: "",
    bodyBonnetBolting: "",

    actuatorMake: "",
    actuatorSerialNumber: "",
    actuatorModelSize: "",
    actuatorActionHandwheel: "",
    actuatorMounting: "",
    actuatorPosition: "",

    positionerMake: "",
    positionerSerialNumber: "",
    positionerModelAction: "",
    constructionChanged: false,

    ratedTravel: "",
    benchSetAsFound: "",
    benchSetAsLeft: "",
    openSignalAsFound: "",
    openSignalAsLeft: "",
    closedSignalAsFound: "",
    closedSignalAsLeft: "",
    supplyPressureAsFound: "",
    supplyPressureAsLeft: "",
    failActionAsFound: "" as const,
    failActionAsLeft: "" as const,
    actuatorAirAction: "" as const,
    calibrationTechnician: "",

    testWitness: "",
    testTechnician: "",
    testDate: "",
    gasTestPressure: "",
    gasTestResult: "",
    diagnosticsCompletedAsFound: false,
    diagnosticsCompletedAsLeft: false,
    seatLeakClass: "",
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

export function normalizeReport(
  raw: Partial<RepairReport> & { id: string },
): RepairReport {
  return { ...emptyReport(raw.id, raw.reportNumber ?? ""), ...raw };
}
