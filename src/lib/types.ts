export type ReportStatus = "Draft" | "In Progress" | "Complete";
export type YesNoBlank = "Open" | "Close" | "";

export type Site = {
  id: string;
  title: string;
  customer: string;
  location: string;
  notes: string;
};

export type RepairReport = {
  id: string;
  reportNumber: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;

  // Job info
  tagOrUnit: string;
  customer: string;
  technician: string;
  process: string;
  emrReference: string;
  crmodReference: string;
  siteId: string;
  siteTitle: string;
  repairDate: string;
  scopeOfWork: string;
  recommendations: string;
  futureRecommendations: string;
  notes: string;
  repairScopeCompleted: boolean;

  // Valve / Body
  valveMake: string;
  valveSerialNumber: string;
  valveModelSize: string;
  valveClassConnection: string;
  valvePackingConfiguration: string;
  valveTrimCharPort: string;
  valveFlowDirection: string;
  bodyBonnetBolting: string;

  // Actuator
  actuatorMake: string;
  actuatorSerialNumber: string;
  actuatorModelSize: string;
  actuatorActionHandwheel: string;
  actuatorMounting: string;
  actuatorPosition: string;

  // Positioner
  positionerMake: string;
  positionerSerialNumber: string;
  positionerModelAction: string;
  constructionChanged: boolean;

  // Calibration
  ratedTravel: string;
  benchSetAsFound: string;
  benchSetAsLeft: string;
  openSignalAsFound: string;
  openSignalAsLeft: string;
  closedSignalAsFound: string;
  closedSignalAsLeft: string;
  supplyPressureAsFound: string;
  supplyPressureAsLeft: string;
  failActionAsFound: YesNoBlank;
  failActionAsLeft: YesNoBlank;
  actuatorAirAction: YesNoBlank; // derived
  calibrationTechnician: string;

  // Post-repair test data
  testWitness: string;
  testTechnician: string;
  testDate: string;
  gasTestPressure: string;
  gasTestResult: string;
  diagnosticsCompletedAsFound: boolean;
  diagnosticsCompletedAsLeft: boolean;
  seatLeakClass: string;
  seatLeakTestPressure: string;
  strokedFromControlRoom: boolean;
  allowableLeakage: string;
  actualLeakage: string;
  bodyBonnetTorque: string;
  packingTorque: string;
  hydroTestPressure: string;
  hydroTestDuration: string;
};

export type FindingCategory =
  | "Body/Bonnet"
  | "Trim"
  | "Actuator"
  | "Positioner"
  | "Other";

export type RepairFinding = {
  id: string;
  repairReportId: string;
  componentCategory: FindingCategory;
  componentName: string;
  conditionFound: string;
  recommendedAction: string;
  asLeftAction: string;
  comments: string;
};

export type PhotoCategory =
  | "As Found Assembly"
  | "As Found Trim"
  | "As Left Trim"
  | "As Left Assembly"
  | "Nameplate / Tag"
  | "Damage Detail"
  | "Other";

export type RepairPhoto = {
  id: string;
  repairReportId: string;
  photo: string; // base64 data URL
  photoCategory: PhotoCategory;
  caption: string;
  sequenceNumber: number;
};

export const FINDING_COMPONENTS: Record<FindingCategory, string[]> = {
  "Body/Bonnet": [
    "Body",
    "Gasket Surface",
    "Seat Area",
    "Bonnet",
    "Packing Box",
    "Body/Bonnet Bolting",
  ],
  Trim: [
    "Plug/Ball/Disk",
    "Cage Guide",
    "Seat",
    "Stem/Shaft",
    "Bushings",
    "Plug Seals",
  ],
  Actuator: [
    "Actuator",
    "Casing/Yoke",
    "Stem/Rod",
    "Connection/Coupling",
    "Bushing",
    "Spring",
    "Bolting",
    "Diaphragm and Soft Parts",
    "Handwheel",
  ],
  Positioner: ["Positioner", "Relay", "I/P", "Feedback", "Gauges"],
  Other: ["Tubing/Fittings", "Airset", "Accessory", "Other"],
};

export const PHOTO_CATEGORIES: PhotoCategory[] = [
  "As Found Assembly",
  "As Found Trim",
  "As Left Trim",
  "As Left Assembly",
  "Nameplate / Tag",
  "Damage Detail",
  "Other",
];

export function deriveActuatorAirAction(
  failActionAsLeft: YesNoBlank,
): YesNoBlank {
  if (failActionAsLeft === "Close") return "Open";
  if (failActionAsLeft === "Open") return "Close";
  return "";
}

export function hasAsFoundData(r: RepairReport): boolean {
  return Boolean(
    r.valveMake ||
      r.valveSerialNumber ||
      r.actuatorMake ||
      r.positionerMake ||
      r.benchSetAsFound ||
      r.openSignalAsFound ||
      r.closedSignalAsFound ||
      r.supplyPressureAsFound ||
      r.failActionAsFound,
  );
}

export function hasAsLeftData(r: RepairReport): boolean {
  return Boolean(
    r.benchSetAsLeft ||
      r.openSignalAsLeft ||
      r.closedSignalAsLeft ||
      r.supplyPressureAsLeft ||
      r.failActionAsLeft ||
      r.testWitness ||
      r.testTechnician,
  );
}
