import db from "./db";
import type { RepairFinding, RepairReport, Site } from "./types";

let seeded = false;

const SITE_ID = "site-slc";

const sites: Site[] = [
  {
    id: SITE_ID,
    title: "Applied Control - Salt Lake City",
    customer: "Big West",
    location: "Salt Lake City, UT",
    notes: "",
  },
  {
    id: "site-denver",
    title: "Applied Control - Denver",
    customer: "",
    location: "Denver, CO",
    notes: "",
  },
  {
    id: "site-midland",
    title: "Applied Control - Midland",
    customer: "",
    location: "Midland, TX",
    notes: "",
  },
];

const REPORT_ID = "report-pv4176b";

const report: RepairReport = {
  id: REPORT_ID,
  reportNumber: "RR-20240214-0001",
  status: "In Progress",
  createdAt: "2024-02-14T00:00:00.000Z",
  updatedAt: "2024-02-14T00:00:00.000Z",

  tagOrUnit: "PV-4176B",
  customer: "Big West",
  technician: "Shawn O'Donnal",
  process: "Gas mixture",
  emrReference: "6901",
  crmodReference: "21694",
  siteId: SITE_ID,
  siteTitle: "Applied Control - Salt Lake City",
  repairDate: "2024-02-14",
  scopeOfWork: "Open and inspect.",
  recommendations: "",
  futureRecommendations: "Customer specified.",
  notes:
    "Valve was rebuilt with preordered parts. Torque wrench MTE-011 B-7 bolting.",
  repairScopeCompleted: true,
  irisSyncedAt: null,

  valveMake: "FISHER",
  valveSerialNumber: "F002363859",
  valveModelSize: 'EZ 1-1/2"',
  valveClassConnection: "300 RF Flg",
  valvePackingConfiguration: "Enviro Duplex",
  valveTrimCharPort: 'Equal % 1-1/2"',
  valveFlowDirection: "Up",
  bodyBonnetBolting: "B7",

  actuatorMake: "FISHER",
  actuatorSerialNumber: "F002363859",
  actuatorModelSize: "657 34",
  actuatorActionHandwheel: "PDTC None",
  actuatorMounting: "N/A",
  actuatorPosition: "N/A",

  positionerMake: "FISHER",
  positionerSerialNumber: "F002363859",
  positionerModelAction: "DVC6200 Direct",
  constructionChanged: false,

  ratedTravel: "3/4 in",
  benchSetAsFound: "5.37 - 20.98 psi",
  benchSetAsLeft: "5.85 - 21.57 psi",
  openSignalAsFound: "4 mA",
  openSignalAsLeft: "4 mA",
  closedSignalAsFound: "20 mA",
  closedSignalAsLeft: "20 mA",
  supplyPressureAsFound: "36.81 psi",
  supplyPressureAsLeft: "38.16 psi",
  failActionAsFound: "Open",
  failActionAsLeft: "Open",
  actuatorAirAction: "Close",
  calibrationTechnician: "SHAWN O",

  testWitness: "JACOB B",
  testTechnician: "Shawn O'Donnal",
  testDate: "2024-02-14",
  gasTestPressure: "80 psi",
  gasTestResult: "PASS",
  diagnosticsCompletedAsFound: true,
  diagnosticsCompletedAsLeft: true,
  seatLeakClass: "IV",
  seatLeakTestPressure: "50 psi",
  strokedFromControlRoom: false,
  allowableLeakage: "6.6 scfh",
  actualLeakage: "0 scfh",
  bodyBonnetTorque: "71 ft-lbs",
  packingTorque: "",
  hydroTestPressure: "N/A",
  hydroTestDuration: "N/A",
};

const findings: RepairFinding[] = [
  {
    id: "f1",
    repairReportId: REPORT_ID,
    componentCategory: "Body/Bonnet",
    componentName: "Body",
    conditionFound: "Good",
    recommendedAction: "Clean",
    asLeftAction: "Reused",
    comments:
      "As Found: Body and bonnet found in good condition, recommend clean/polish and reuse. As Left: Body and bonnet were clean/polished and reused.",
  },
  {
    id: "f2",
    repairReportId: REPORT_ID,
    componentCategory: "Body/Bonnet",
    componentName: "Gasket Surface",
    conditionFound: "Good",
    recommendedAction: "Clean",
    asLeftAction: "Reused",
    comments: "",
  },
  {
    id: "f3",
    repairReportId: REPORT_ID,
    componentCategory: "Body/Bonnet",
    componentName: "Seat Area",
    conditionFound: "Good",
    recommendedAction: "Clean",
    asLeftAction: "Reused",
    comments: "",
  },
  {
    id: "f4",
    repairReportId: REPORT_ID,
    componentCategory: "Body/Bonnet",
    componentName: "Bonnet",
    conditionFound: "Good",
    recommendedAction: "Reuse",
    asLeftAction: "Reused",
    comments: "",
  },
  {
    id: "f5",
    repairReportId: REPORT_ID,
    componentCategory: "Body/Bonnet",
    componentName: "Packing Box",
    conditionFound: "Good",
    recommendedAction: "Polish",
    asLeftAction: "Polished",
    comments: "",
  },
  {
    id: "f6",
    repairReportId: REPORT_ID,
    componentCategory: "Trim",
    componentName: "Plug/Ball/Disk",
    conditionFound: "Good",
    recommendedAction: "Polish",
    asLeftAction: "Polished",
    comments:
      "As Found: Plug, stem and seat found to be in good condition, recommend polish and reuse. As Left: Plug, stem and seat were polished and reused.",
  },
  {
    id: "f7",
    repairReportId: REPORT_ID,
    componentCategory: "Trim",
    componentName: "Cage Guide",
    conditionFound: "Good",
    recommendedAction: "Polish",
    asLeftAction: "Polished",
    comments: "",
  },
  {
    id: "f8",
    repairReportId: REPORT_ID,
    componentCategory: "Trim",
    componentName: "Seat",
    conditionFound: "Good",
    recommendedAction: "Polish",
    asLeftAction: "Polished",
    comments: "",
  },
  {
    id: "f9",
    repairReportId: REPORT_ID,
    componentCategory: "Trim",
    componentName: "Stem/Shaft",
    conditionFound: "Good",
    recommendedAction: "Polish",
    asLeftAction: "Polished",
    comments: "",
  },
  {
    id: "f10",
    repairReportId: REPORT_ID,
    componentCategory: "Trim",
    componentName: "Bushings",
    conditionFound: "Good",
    recommendedAction: "Reuse",
    asLeftAction: "Reused",
    comments: "",
  },
  {
    id: "f11",
    repairReportId: REPORT_ID,
    componentCategory: "Trim",
    componentName: "Plug Seals",
    conditionFound: "N/A",
    recommendedAction: "N/A",
    asLeftAction: "",
    comments: "",
  },
  {
    id: "f12",
    repairReportId: REPORT_ID,
    componentCategory: "Actuator",
    componentName: "Actuator",
    conditionFound: "Good",
    recommendedAction: "Clean",
    asLeftAction: "Reused",
    comments:
      "As Found: Actuator found to be in good condition, recommend clean and reuse. Diaphragm found to be worn recommend replacement. As Left: Actuator was cleaned and reused. Diaphragm was replaced with new.",
  },
  {
    id: "f13",
    repairReportId: REPORT_ID,
    componentCategory: "Actuator",
    componentName: "Casing/Yoke",
    conditionFound: "Good",
    recommendedAction: "Clean",
    asLeftAction: "Reused",
    comments: "",
  },
  {
    id: "f14",
    repairReportId: REPORT_ID,
    componentCategory: "Actuator",
    componentName: "Spring",
    conditionFound: "Good",
    recommendedAction: "Reuse",
    asLeftAction: "Reused",
    comments: "",
  },
  {
    id: "f15",
    repairReportId: REPORT_ID,
    componentCategory: "Actuator",
    componentName: "Diaphragm and Soft Parts",
    conditionFound: "Worn",
    recommendedAction: "Replace",
    asLeftAction: "Replaced with new",
    comments: "",
  },
  {
    id: "f16",
    repairReportId: REPORT_ID,
    componentCategory: "Positioner",
    componentName: "Positioner",
    conditionFound: "Good",
    recommendedAction: "Calibrate",
    asLeftAction: "Calibrated",
    comments:
      "As Found: Positioner found in good condition, recommend calibrate and reuse. As Left: Positioner was calibrated and reused.",
  },
  {
    id: "f17",
    repairReportId: REPORT_ID,
    componentCategory: "Positioner",
    componentName: "Relay",
    conditionFound: "Good",
    recommendedAction: "Reuse",
    asLeftAction: "Reused",
    comments: "",
  },
  {
    id: "f18",
    repairReportId: REPORT_ID,
    componentCategory: "Positioner",
    componentName: "I/P",
    conditionFound: "Good",
    recommendedAction: "Reuse",
    asLeftAction: "Reused",
    comments: "",
  },
  {
    id: "f19",
    repairReportId: REPORT_ID,
    componentCategory: "Positioner",
    componentName: "Gauges",
    conditionFound: "Good",
    recommendedAction: "Reuse",
    asLeftAction: "Reused",
    comments: "",
  },
  {
    id: "f20",
    repairReportId: REPORT_ID,
    componentCategory: "Other",
    componentName: "Tubing/Fittings",
    conditionFound: "Good",
    recommendedAction: "Reuse",
    asLeftAction: "Reused",
    comments:
      "As Found: Tubing and airset found to be in good condition, recommend reuse. As Left: Tubing and airset were reused.",
  },
  {
    id: "f21",
    repairReportId: REPORT_ID,
    componentCategory: "Other",
    componentName: "Airset",
    conditionFound: "Good",
    recommendedAction: "Reuse",
    asLeftAction: "Reused",
    comments: "",
  },
];

// Share ONE in-flight seed across concurrent callers. ensureSeeded is invoked
// from more than one place, and React's dev double-invoke fires it twice at
// once — both calls saw an empty table, both inserted the same keys, and the
// second threw "Key already exists" from bulkAdd. Assigning the promise before
// any await means the second caller awaits the first run instead of racing it.
let seedPromise: Promise<void> | null = null;

async function doSeed(): Promise<void> {
  const [siteCount, reportCount] = await Promise.all([
    db.sites.count(),
    db.reports.count(),
  ]);
  // bulkPut/put (upsert) rather than bulkAdd/add: idempotent, so even a stray
  // concurrent run can't collide. Guarded by the count so user edits to an
  // already-seeded table are never overwritten.
  if (siteCount === 0) {
    await db.sites.bulkPut(sites);
  }
  if (reportCount === 0) {
    await db.reports.put(report);
    await db.findings.bulkPut(findings);
  }
  seeded = true;
}

export function ensureSeeded(): Promise<void> {
  if (seeded) return Promise.resolve();
  if (!seedPromise) {
    seedPromise = doSeed().catch((err) => {
      seedPromise = null; // let a later call retry rather than cache the failure
      throw err;
    });
  }
  return seedPromise;
}
