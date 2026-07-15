import { describe, expect, it } from "vitest";
import {
  blankFieldsForRule,
  blankFieldsForRules,
  enforceBlankFields,
} from "@/lib/imports/ruleActions";
import type { ParsedPdfReport } from "@/lib/imports/pdfParser";

describe("blankFieldsForRule", () => {
  it("parses the user's exact rule text into the three fields", () => {
    const fields = blankFieldsForRule(
      "Leave Service description and P & ID no, and Datasheet no, blank",
    );
    expect(new Set(fields)).toEqual(new Set(["scopeOfWork", "emrReference", "crmodReference"]));
  });

  it("understands don't-fill phrasing", () => {
    expect(blankFieldsForRule("Don't fill Datasheet no.")).toEqual(["crmodReference"]);
    expect(blankFieldsForRule("never populate the Tag column")).toEqual(["tagOrUnit"]);
  });

  it("keep ... empty works too", () => {
    expect(blankFieldsForRule("Keep Valve serial number empty")).toEqual(["valveSerialNumber"]);
  });

  it("ignores negated directives", () => {
    expect(blankFieldsForRule("Never leave bench set blank")).toEqual([]);
  });

  it("ignores rules that aren't blank directives", () => {
    expect(blankFieldsForRule("Bench set must be formatted like 3-15")).toEqual([]);
    expect(blankFieldsForRule("Never include the manufacturer name in the valve model field")).toEqual([]);
  });

  it("split-cell headers map to their combined field", () => {
    expect(blankFieldsForRule("Leave Valve size blank")).toEqual(["valveModelSize"]);
    expect(blankFieldsForRule("Leave Actuator upper bench set blank")).toEqual(["benchSetAsLeft"]);
  });
});

describe("blankFieldsForRules + enforceBlankFields", () => {
  it("clears exactly the demanded fields", () => {
    const result = {
      scopeOfWork: "Repair per WO",
      emrReference: "EMR-1",
      crmodReference: "CR-2",
      tagOrUnit: "PV-4176B",
    } as ParsedPdfReport;
    const fields = blankFieldsForRules([
      "Leave Service description and P & ID no, and Datasheet no, blank",
      "Bench set must be formatted like 3-15",
    ]);
    const out = enforceBlankFields(result, fields);
    expect(out.scopeOfWork).toBe("");
    expect(out.emrReference).toBe("");
    expect(out.crmodReference).toBe("");
    expect(out.tagOrUnit).toBe("PV-4176B");
    // original untouched
    expect(result.scopeOfWork).toBe("Repair per WO");
  });

  it("no blank rules → result returned unchanged", () => {
    const result = { tagOrUnit: "PV-1" } as ParsedPdfReport;
    expect(enforceBlankFields(result, blankFieldsForRules(["format bench set as 3-15"]))).toBe(result);
  });
});
