import { describe, expect, it } from "vitest";
import { constructionMissWarning } from "@/lib/imports/pdfParser";

// The layout-miss guard (added in the eng review of the accuracy work). The
// AS-LEFT column is picked by geometry (right half of the page), verified on
// three templates. A fourth template could read the wrong column with no error.
// A wrong-COLUMN read can't be auto-detected, but a TOTAL miss can: construction
// labels present, zero makes out. This pins that the warning fires then and
// stays quiet on healthy extractions.

describe("constructionMissWarning", () => {
  it("warns when construction labels are present but no make extracted", () => {
    const w = constructionMissWarning("Make Brand Model / Size S/N", {
      valveMake: "",
      actuatorMake: "",
      positionerMake: "",
    });
    expect(w).toContain("layout wasn't recognised");
  });

  it("stays quiet when at least one make extracted (healthy)", () => {
    expect(
      constructionMissWarning("Make Model / Size", { valveMake: "FISHER" }),
    ).toBeNull();
    // even a lone actuator or positioner make counts as 'the layout matched'
    expect(constructionMissWarning("Brand", { actuatorMake: "BETTIS" })).toBeNull();
    expect(constructionMissWarning("Brand", { positionerMake: "FISHER" })).toBeNull();
  });

  it("stays quiet when the report has no construction labels at all", () => {
    // No make/brand/model labels → not a construction report → nothing to warn about.
    expect(constructionMissWarning("NOTES: valve was fine", {})).toBeNull();
  });

  it("recognises the newer template's 'Brand' label", () => {
    expect(
      constructionMissWarning("Construction (as left) Brand S/N", {
        valveMake: "",
        actuatorMake: "",
        positionerMake: "",
      }),
    ).not.toBeNull();
  });

  it("treats whitespace-only makes as empty", () => {
    expect(
      constructionMissWarning("Make", { valveMake: "  ", actuatorMake: "\t" }),
    ).not.toBeNull();
  });

  it("handles empty/missing rawText without throwing", () => {
    expect(constructionMissWarning("", {})).toBeNull();
  });
});
