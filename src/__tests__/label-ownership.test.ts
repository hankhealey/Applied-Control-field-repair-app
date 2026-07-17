import { describe, expect, it } from "vitest";
import {
  ACTUATOR_OWNERS,
  isOwnedByOther,
  POSITIONER_OWNERS,
  VALVE_OWNERS,
} from "@/lib/imports/pdfParser";

// These reports label construction rows generically ("Model Number",
// "Model / Size") under a per-component heading. findValue matches by
// substring, so without an ownership guard a valve lookup for "Model Number"
// matches the cell "Actuator Model Number" — which is how a Fisher 667
// ACTUATOR ended up in the Valve model column.

const NOT_VALVE = [...ACTUATOR_OWNERS, ...POSITIONER_OWNERS];

describe("isOwnedByOther — valve lookups must not steal other rows", () => {
  it("rejects the actuator row for a generic valve label (the 667 bug)", () => {
    expect(isOwnedByOther("Actuator Model Number", "Model Number", NOT_VALVE)).toBe(true);
    expect(isOwnedByOther("Act. Model / Size", "Model / Size", NOT_VALVE)).toBe(true);
  });

  it("rejects the positioner row for a generic valve label", () => {
    expect(isOwnedByOther("Positioner Model Number", "Model Number", NOT_VALVE)).toBe(true);
    expect(isOwnedByOther("Device Model / Size", "Model / Size", NOT_VALVE)).toBe(true);
    expect(isOwnedByOther("DVC Model Number", "Model Number", NOT_VALVE)).toBe(true);
  });

  it("ACCEPTS a bare generic label — nobody owns it", () => {
    expect(isOwnedByOther("Model Number", "Model Number", NOT_VALVE)).toBe(false);
    expect(isOwnedByOther("Model / Size", "Model / Size", NOT_VALVE)).toBe(false);
  });

  it("ACCEPTS the valve's own row", () => {
    expect(isOwnedByOther("Valve Model Number", "Model Number", NOT_VALVE)).toBe(false);
    expect(isOwnedByOther("Body Model / Size", "Model / Size", NOT_VALVE)).toBe(false);
  });
});

describe("isOwnedByOther — positioner lookups must not steal valve/actuator", () => {
  const NOT_POSITIONER = [...VALVE_OWNERS, ...ACTUATOR_OWNERS];

  it("rejects valve and actuator rows for a generic positioner label", () => {
    expect(isOwnedByOther("Valve Model / Action", "Model / Action", NOT_POSITIONER)).toBe(true);
    expect(isOwnedByOther("Actuator Model / Action", "Model / Action", NOT_POSITIONER)).toBe(true);
  });

  it("accepts the bare label and the positioner's own row", () => {
    expect(isOwnedByOther("Model / Action", "Model / Action", NOT_POSITIONER)).toBe(false);
    expect(isOwnedByOther("Positioner Model / Action", "Model / Action", NOT_POSITIONER)).toBe(false);
  });
});

describe("isOwnedByOther — guard is inert when unused", () => {
  it("no owners means nothing is ever excluded", () => {
    expect(isOwnedByOther("Actuator Model Number", "Model Number", [])).toBe(false);
  });

  it("is case and whitespace insensitive", () => {
    expect(isOwnedByOther("ACTUATOR  MODEL NUMBER", "Model Number", NOT_VALVE)).toBe(true);
  });
});

describe("generic Make and S/N lookups must be guarded too (code-review finding)", () => {
  it("rejects another component's S/N row for the bare 'S/N' label", () => {
    // valveSerialNumber falls back to findValue(safe, ["S/N"]) when the
    // valve-specific labels miss. Unguarded, it inherited the actuator's serial.
    expect(isOwnedByOther("Actuator S/N", "S/N", NOT_VALVE)).toBe(true);
    expect(isOwnedByOther("Positioner S/N", "S/N", NOT_VALVE)).toBe(true);
    expect(isOwnedByOther("DVC S/N", "S/N", NOT_VALVE)).toBe(true);
  });

  it("rejects another component's Make row for the bare 'Make' label", () => {
    expect(isOwnedByOther("Actuator Make", "Make", NOT_VALVE)).toBe(true);
    expect(isOwnedByOther("Positioner Make", "Make", NOT_VALVE)).toBe(true);
  });

  it("still accepts the bare labels and the valve's own rows", () => {
    expect(isOwnedByOther("S/N", "S/N", NOT_VALVE)).toBe(false);
    expect(isOwnedByOther("Make", "Make", NOT_VALVE)).toBe(false);
    expect(isOwnedByOther("Valve S/N", "S/N", NOT_VALVE)).toBe(false);
    expect(isOwnedByOther("Body Make", "Make", NOT_VALVE)).toBe(false);
  });
});
