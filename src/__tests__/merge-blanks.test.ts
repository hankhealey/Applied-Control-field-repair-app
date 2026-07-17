import { describe, expect, it } from "vitest";
import { mergeBlanks } from "@/lib/imports/pdfParser";

// mergeBlanks is the guard that lets the parser widen its search past page 1
// without corrupting what the narrow, reliable page-1 pass already found.

describe("mergeBlanks — fill-only merge", () => {
  it("fills a field the narrow pass left empty (the missing serial case)", () => {
    const page1 = { valveSerialNumber: "", valveMake: "FISHER" };
    const laterPages = { valveSerialNumber: "SN-12345", valveMake: "" };
    expect(mergeBlanks(page1, laterPages)).toEqual({
      valveSerialNumber: "SN-12345",
      valveMake: "FISHER",
    });
  });

  it("NEVER overwrites a value the narrow pass found", () => {
    const page1 = { valveSerialNumber: "CORRECT-SN" };
    const laterPages = { valveSerialNumber: "WRONG-SN-FROM-PROSE" };
    expect(mergeBlanks(page1, laterPages).valveSerialNumber).toBe("CORRECT-SN");
  });

  it("treats whitespace-only as empty and fills it", () => {
    expect(mergeBlanks({ a: "   " }, { a: "real" }).a).toBe("real");
  });

  it("does not fill from a whitespace-only wider value", () => {
    expect(mergeBlanks({ a: "" }, { a: "   " }).a).toBe("");
  });

  it("never merges internal/meta fields", () => {
    const base = { _rawText: "page1 text", _aiError: "", valveMake: "" };
    const wider = { _rawText: "later text", _aiError: "boom", valveMake: "FISHER" };
    const out = mergeBlanks(base, wider);
    expect(out._rawText).toBe("page1 text"); // untouched
    expect(out._aiError).toBe(""); // untouched
    expect(out.valveMake).toBe("FISHER"); // real field still filled
  });

  it("ignores non-string values", () => {
    const out = mergeBlanks(
      { a: "", n: 1 } as Record<string, unknown>,
      { a: "", n: 99 } as Record<string, unknown>,
    );
    expect(out.n).toBe(1);
  });

  it("does not mutate its inputs", () => {
    const base = { a: "" };
    const wider = { a: "filled" };
    mergeBlanks(base, wider);
    expect(base.a).toBe("");
  });

  it("chains: each rung only fills what is still blank", () => {
    const page1Narrow = { sn: "", model: "EZ", tag: "" };
    const page1Full = { sn: "SN-1", model: "WRONG", tag: "" };
    const later = { sn: "SN-2", model: "ALSO-WRONG", tag: "PV-101" };
    let out = mergeBlanks(page1Narrow, page1Full);
    out = mergeBlanks(out, later);
    expect(out).toEqual({ sn: "SN-1", model: "EZ", tag: "PV-101" });
  });
});

describe("mergeBlanks onlyKeys — later pages may only fill validated fields", () => {
  const EQUIP = new Set(["valveSerialNumber", "actuatorModelSize"]);

  it("fills an allowed equipment field from later pages", () => {
    const out = mergeBlanks({ valveSerialNumber: "" }, { valveSerialNumber: "SN-9" }, EQUIP);
    expect(out.valveSerialNumber).toBe("SN-9");
  });

  it("REFUSES to fabricate calibration data from findings prose", () => {
    // benchSetAsLeft has no repair-word/number validation, so a value scraped
    // from a narrative repair note must never reach the IRIS export.
    const out = mergeBlanks({ benchSetAsLeft: "", technician: "" }, { benchSetAsLeft: "3-15", technician: "polish" }, EQUIP);
    expect(out.benchSetAsLeft).toBe("");
    expect(out.technician).toBe("");
  });

  it("without onlyKeys, every field is still eligible", () => {
    expect(mergeBlanks({ benchSetAsLeft: "" }, { benchSetAsLeft: "3-15" }).benchSetAsLeft).toBe("3-15");
  });
});
