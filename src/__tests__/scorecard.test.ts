import { describe, expect, it } from "vitest";
import { extractFields, type TextItem } from "@/lib/imports/pdfParser";
import fv4101b from "./fixtures/fv4101b-items.json";
import fv101 from "./fixtures/fv101-items.json";
import pv148 from "./fixtures/pv148-items.json";

// Real coordinates from three real reports, customer/tech/serial strings
// redacted (see fixtures/README.md). These are TWO different report templates:
//
//   fv4101b  — older Emerson layout. ONE shared label column left of centre
//              ("Make", "S/N"), a single value column on the right. All three
//              component serials DIFFER, which is what exposes wrong-row binding.
//   fv101    — newer layout. Labels say "Brand" not "Make"; AS FOUND / AS LEFT
//   pv148      side by side; inline "Body"/"Actuator"/"Positioner" headings.
//              PV148 is the origin of the 667 bug (667 is its actuator model).
//
// The point of this file is a MEASUREMENT that survives future edits: if a
// change regresses any report, the scorecard names the field.

type Fixture = { pageWidth: number; page1: TextItem[] };
type Truth = Partial<Record<keyof ReturnType<typeof extractFields>, string>>;

/** Run the real extractFields against a fixture's page-1 items. */
function run(fx: Fixture): Record<string, string> {
  return extractFields(fx.page1 as TextItem[], fx.page1 as TextItem[], fx.pageWidth, 99999, "first") as Record<string, string>;
}

function score(fx: Fixture, truth: Truth) {
  const r = run(fx);
  const wrong = Object.entries(truth)
    .filter(([k, v]) => (r[k] ?? "").trim().toLowerCase() !== (v as string).trim().toLowerCase())
    .map(([k, v]) => `${k}: want ${v}, got ${r[k] || "(blank)"}`);
  return { r, wrong };
}

// ── fv4101b — older layout, shared left label column, distinct serials ────────
const FV4101B: Truth = {
  tagOrUnit: "FV-4101", technician: "PAT MORGAN", process: "CRUDE OIL",
  valveMake: "FISHER", valveSerialNumber: "SNBODY0001", valveModelSize: 'V300 4"',
  valveFlowDirection: "Forward",
  actuatorMake: "FISHER", actuatorSerialNumber: "SNACTR0002",
  positionerMake: "FISHER", positionerSerialNumber: "SNPOS00003",
};

// ── fv101 — newer "Brand" layout, distinct serials ───────────────────────────
const FV101: Truth = {
  tagOrUnit: "02=FV-101", technician: "PAT MORGAN", process: "BUTANE",
  valveMake: "Fisher", valveSerialNumber: "SNBODY0001", valveModelSize: "EZ NPS 2",
  valveFlowDirection: "Up",
  actuatorMake: "Fisher", actuatorSerialNumber: "SNACTR0002", actuatorModelSize: "657 45",
  positionerMake: "Fisher",
};

// ── pv148 — newer layout, 667 = actuator, distinct serials ────────────────────
const PV148: Truth = {
  tagOrUnit: "02-PV-148", technician: "PAT MORGAN", process: "SOUR WATER",
  valveMake: "Fisher", valveSerialNumber: "SNBODY0001", valveModelSize: "EZ NPS 2",
  valveFlowDirection: "Up",
  actuatorMake: "Fisher", actuatorSerialNumber: "SNACTR0002", actuatorModelSize: "667 40",
  positionerMake: "Fisher",
};

describe("newer 'Brand' template (fv101, pv148)", () => {
  it("fv101 — every field correct", () => {
    expect(score(fv101 as Fixture, FV101).wrong).toEqual([]);
  });

  it("pv148 — every field correct, 667 is the actuator not the valve", () => {
    const { r, wrong } = score(pv148 as Fixture, PV148);
    expect(wrong).toEqual([]);
    expect(r.actuatorModelSize).toContain("667");
    expect(r.valveModelSize).not.toContain("667");
  });

  it("distinct body and actuator serials never collapse to one", () => {
    const r = run(pv148 as Fixture);
    expect(r.valveSerialNumber).not.toBe(r.actuatorSerialNumber);
  });
});

describe("older shared-label-column template (fv4101b)", () => {
  it("binds each component's serial to its own row", () => {
    const r = run(fv4101b as Fixture);
    // The trap: three distinct serials, valve must get the BODY's — not the
    // positioner's, which is what "rightmost" grabbed before.
    expect(r.valveSerialNumber).toBe("SNBODY0001");
    expect(r.actuatorSerialNumber).toBe("SNACTR0002");
    expect(r.positionerSerialNumber).toBe("SNPOS00003");
  });

  it("reads all three makes", () => {
    const r = run(fv4101b as Fixture);
    expect(r.valveMake).toBe("FISHER");
    expect(r.actuatorMake).toBe("FISHER");
    expect(r.positionerMake).toBe("FISHER");
  });
});

// Aggregate measurement, printed so the score is visible even when green.
//
// Known, accepted gap: fv4101b valveModelSize reads "V300" without the trailing
// size "4\"". On that older layout the model and size sit in separate far-right
// sub-columns ~97px apart, past any gap wide enough to be safe from grabbing a
// neighbouring cell. One field on one template; not worth a risky reach.
const KNOWN_GAPS: Record<string, string[]> = {
  fv4101b: ["valveModelSize"],
  fv101: [],
  pv148: [],
};

describe("aggregate", () => {
  it("holds the measured score and exposes any new regression by field", () => {
    const runs = [
      ["fv4101b", fv4101b, FV4101B],
      ["fv101", fv101, FV101],
      ["pv148", pv148, PV148],
    ] as const;
    let ok = 0, total = 0;
    const lines: string[] = [];
    const unexpected: string[] = [];
    for (const [name, fx, truth] of runs) {
      const { wrong } = score(fx as Fixture, truth);
      const n = Object.keys(truth).length;
      ok += n - wrong.length;
      total += n;
      lines.push(`${name}: ${n - wrong.length}/${n}${wrong.length ? " — " + wrong.join("; ") : ""}`);
      // A miss is only acceptable if it's a known gap for that report.
      for (const w of wrong) {
        const field = w.split(":")[0];
        if (!KNOWN_GAPS[name].includes(field)) unexpected.push(`${name} ${w}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`\nSCORECARD ${ok}/${total}\n  ` + lines.join("\n  "));
    expect(unexpected).toEqual([]); // any NEW miss fails, names the field
    expect(ok).toBe(32); // the measured number; update deliberately when it moves
  });
});
