import { describe, expect, it } from "vitest";
import { isRateLimit } from "@/lib/imports/pdfParser";

describe("isRateLimit", () => {
  it("classifies the rate-limit message the AI pass produces", () => {
    expect(
      isRateLimit("Rate limit hit — AI skipped, so your rules did NOT apply. Wait ~60s and re-extract."),
    ).toBe(true);
  });

  it("matches raw provider phrasings", () => {
    expect(isRateLimit("Groq 429: Too Many Requests")).toBe(true);
    expect(isRateLimit("AI error: rate_limit_exceeded")).toBe(true);
    expect(isRateLimit("429")).toBe(true);
  });

  it("does not misclassify real faults as rate limits", () => {
    expect(isRateLimit("AI error: 500")).toBe(false);
    expect(isRateLimit("AI: The operation was aborted due to timeout")).toBe(false);
  });

  it("no error means no rate limit", () => {
    expect(isRateLimit(undefined)).toBe(false);
    expect(isRateLimit("")).toBe(false);
  });
});
