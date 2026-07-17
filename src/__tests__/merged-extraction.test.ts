import { afterEach, describe, expect, it, vi } from "vitest";
import { enhanceWithAi } from "@/lib/imports/ollamaParser";
import type { ParsedPdfReport } from "@/lib/imports/pdfParser";

function report(overrides: Partial<ParsedPdfReport> = {}): ParsedPdfReport {
  return {
    filename: "", tagOrUnit: "", customer: "", siteTitle: "", repairDate: "",
    technician: "", process: "", emrReference: "", crmodReference: "",
    scopeOfWork: "", valveMake: "", valveSerialNumber: "", valveModelSize: "",
    valveClassConnection: "", valvePackingConfiguration: "", valveTrimCharPort: "",
    valveFlowDirection: "", actuatorMake: "", actuatorSerialNumber: "",
    actuatorModelSize: "", actuatorActionHandwheel: "", positionerMake: "",
    positionerSerialNumber: "", positionerModelAction: "", ratedTravel: "",
    benchSetAsLeft: "", openSignalAsLeft: "", closedSignalAsLeft: "",
    supplyPressureAsLeft: "", failActionAsLeft: "", actuatorAirAction: "",
    seatLeakClass: "",
    _rawText: "REPAIR REPORT — Valve Make: FISHER",
    ...overrides,
  };
}

function mockFetch(response: Record<string, unknown>, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => response,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("enhanceWithAi — merged fields + observations", () => {
  it("reads the document ONCE: a single request, not a second prose call", async () => {
    const fetchMock = mockFetch({ valveMake: "FISHER", observationsHtml: "<p>Body: reseated</p>" });
    await enhanceWithAi(report());
    // The old pipeline fired a second request to the 70b prose model here,
    // re-sending the same document and blowing its ~6k tok/min ceiling.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks for observations in the extraction call", async () => {
    const fetchMock = mockFetch({ valveMake: "FISHER", observationsHtml: "<p>Body: ok</p>" });
    await enhanceWithAi(report());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.withObservations).toBe(true);
    expect(body.rawText).toContain("FISHER");
  });

  it("applies both the fields and the returned prose", async () => {
    mockFetch({ valveMake: "FISHER", observationsHtml: "<p>Body: reseated</p>" });
    const out = await enhanceWithAi(report());
    expect(out.valveMake).toBe("FISHER");
    expect(out.observationsHtml).toBe("<p>Body: reseated</p>");
  });

  it("never mistakes observationsHtml for an extracted field", async () => {
    mockFetch({ observationsHtml: "<p>Body: ok</p>" });
    const out = await enhanceWithAi(report());
    // It is not in PDF_FIELDS, so it must not land in a data column
    expect(out.scopeOfWork).toBe("");
    expect(out.valveMake).toBe("");
    expect(out.observationsHtml).toBe("<p>Body: ok</p>");
  });

  it("tolerates a response with no prose (fields still apply)", async () => {
    mockFetch({ valveMake: "FISHER" });
    const out = await enhanceWithAi(report());
    expect(out.valveMake).toBe("FISHER");
    expect(out.observationsHtml).toBeUndefined();
    expect(out._aiError).toBeUndefined();
  });

  it("surfaces a rate limit instead of silently returning regex-only", async () => {
    mockFetch({ error: "rate_limit_exceeded" }, false, 429);
    const out = await enhanceWithAi(report({ valveMake: "REGEX-VALUE" }));
    expect(out._aiError).toMatch(/rate limit/i);
    // The regex result survives, but the failure is no longer invisible
    expect(out.valveMake).toBe("REGEX-VALUE");
  });
});
