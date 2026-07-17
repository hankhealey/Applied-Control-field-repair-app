import { describe, expect, it } from "vitest";
import {
  estimateRequestTokens,
  TokenBudget,
} from "@/lib/imports/tokenBudget";

const T0 = 1_000_000_000_000; // fixed clock so tests never depend on real time

describe("TokenBudget — rolling 60s window", () => {
  it("lets the first request through immediately", () => {
    const b = new TokenBudget(6000);
    expect(b.waitFor(4338, T0)).toBe(0);
  });

  it("makes the second request wait — the exact failure the user hit", () => {
    const b = new TokenBudget(6000);
    b.record(4338, T0);
    // 4338 + 4338 = 8676 > 6000, so file 2 cannot go yet
    const wait = b.waitFor(4338, T0 + 1000);
    expect(wait).toBeGreaterThan(0);
    // It only needs to wait out the first spend's 60s window
    expect(wait).toBe(59_000);
  });

  it("releases the budget once the window rolls past", () => {
    const b = new TokenBudget(6000);
    b.record(4338, T0);
    expect(b.waitFor(4338, T0 + 60_001)).toBe(0);
  });

  it("only waits for as much as it needs to free, not the whole window", () => {
    const b = new TokenBudget(6000);
    b.record(1000, T0); // ages out first
    b.record(1000, T0 + 10_000);
    // used=2000; a 4500 request needs 500 freed -> the T0 spend suffices
    expect(b.waitFor(4500, T0 + 20_000)).toBe(40_000); // T0+60000 - (T0+20000)
  });

  it("packs several small requests into one window without waiting", () => {
    const b = new TokenBudget(6000);
    b.record(1000, T0);
    b.record(1000, T0);
    b.record(1000, T0);
    expect(b.waitFor(1000, T0 + 500)).toBe(0);
    expect(b.used(T0 + 500)).toBe(3000);
  });

  it("reports -1 for a request that can never fit, instead of waiting forever", () => {
    const b = new TokenBudget(6000);
    // A single 7000-token request exceeds the entire per-minute budget
    expect(b.waitFor(7000, T0)).toBe(-1);
  });

  it("drops spends that have aged out of the window", () => {
    const b = new TokenBudget(6000);
    b.record(4000, T0);
    expect(b.used(T0 + 61_000)).toBe(0);
  });

  it("a paid-tier limit removes the wait entirely", () => {
    const b = new TokenBudget(250_000); // Developer tier
    for (let i = 0; i < 20; i++) b.record(4338, T0);
    expect(b.waitFor(4338, T0)).toBe(0);
  });
});

describe("estimateRequestTokens", () => {
  it("estimates a merged request under the 6000 cap but over half of it", () => {
    const est = estimateRequestTokens({
      rawTextChars: 6000,
      exampleChars: 1400,
      ruleChars: 300,
      withObservations: true,
    });
    // Must fit a single request...
    expect(est).toBeLessThan(6000);
    // ...but be big enough that two cannot share a minute, which is the
    // whole reason the throttle exists.
    expect(est * 2).toBeGreaterThan(6000);
  });

  it("costs less without observations", () => {
    const withObs = estimateRequestTokens({ rawTextChars: 6000, exampleChars: 0, ruleChars: 0, withObservations: true });
    const noObs = estimateRequestTokens({ rawTextChars: 6000, exampleChars: 0, ruleChars: 0, withObservations: false });
    expect(noObs).toBeLessThan(withObs);
  });

  it("does not under-count when the document is huge (server truncates at 6000 chars)", () => {
    const huge = estimateRequestTokens({ rawTextChars: 500_000, exampleChars: 0, ruleChars: 0, withObservations: true });
    const normal = estimateRequestTokens({ rawTextChars: 6000, exampleChars: 0, ruleChars: 0, withObservations: true });
    expect(huge).toBe(normal);
  });
});
