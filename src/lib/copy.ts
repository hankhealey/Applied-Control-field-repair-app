import { RepairReport } from "./types";

export const CALIBRATION_PAIRS: Array<{
  asFoundKey: keyof RepairReport;
  asLeftKey: keyof RepairReport;
  label: string;
}> = [
  { asFoundKey: "benchSetAsFound", asLeftKey: "benchSetAsLeft", label: "Bench Set" },
  {
    asFoundKey: "openSignalAsFound",
    asLeftKey: "openSignalAsLeft",
    label: "Signal Open",
  },
  {
    asFoundKey: "closedSignalAsFound",
    asLeftKey: "closedSignalAsLeft",
    label: "Signal Closed",
  },
  {
    asFoundKey: "supplyPressureAsFound",
    asLeftKey: "supplyPressureAsLeft",
    label: "Supply",
  },
  {
    asFoundKey: "failActionAsFound",
    asLeftKey: "failActionAsLeft",
    label: "Fail Action",
  },
];
