import { describe, expect, it } from "vitest";
import { TokenBudget } from "@/lib/imports/tokenBudget";

// The reported symptom: "it will process the first one, then say Rate limit hit"
// for every file after it. These pin the two budget behaviours that produce
// that shape — the oversized-request escape hatch, and reservations that were
// never handed back after a failed send.

const LIMIT = 6000;
const T0 = 1_000_000; // fixed clock; every test passes `now` explicitly

describe("waitFor never tells a caller to send into a full window", () => {
  it("sends immediately when the window is empty", () => {
    const b = new TokenBudget(LIMIT);
    expect(b.waitFor(4600, T0)).toBe(0);
  });

  it("makes the second file wait out the first", () => {
    const b = new TokenBudget(LIMIT);
    b.record(4600, T0);
    // 4600 + 4600 is over 6000, so file 2 waits for file 1 to age out
    expect(b.waitFor(4600, T0 + 1000)).toBe(59_000);
  });

  it("REGRESSION: an oversized request waits instead of firing immediately", () => {
    // Previously waitFor returned -1 here and the caller read that as "send
    // now". File 1 landed (the server trims to fit) and every file after it
    // slammed into a full minute. An oversized request must still wait for a
    // clear window.
    const b = new TokenBudget(LIMIT);
    b.record(6500, T0); // file 1: oversized, already sent
    const wait = b.waitFor(6500, T0 + 1000);
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBe(59_000);
  });

  it("lets the FIRST oversized request through — the server trims it to fit", () => {
    const b = new TokenBudget(LIMIT);
    expect(b.waitFor(6500, T0)).toBe(0);
  });

  it("never returns a negative, whatever the size", () => {
    const b = new TokenBudget(LIMIT);
    b.record(5000, T0);
    b.record(5000, T0 + 100);
    for (const size of [100, 4600, 6000, 6500, 50_000]) {
      expect(b.waitFor(size, T0 + 200)).toBeGreaterThanOrEqual(0);
    }
  });

  it("clears the wait once the window has rolled", () => {
    const b = new TokenBudget(LIMIT);
    b.record(4600, T0);
    expect(b.waitFor(4600, T0 + 60_001)).toBe(0);
  });
});

describe("release — a failed send must not hold capacity", () => {
  it("frees the window so the next file goes straight through", () => {
    const b = new TokenBudget(LIMIT);
    b.record(4600, T0);
    expect(b.waitFor(4600, T0 + 1000)).toBeGreaterThan(0);

    b.release(4600, T0); // the request never reached Groq
    expect(b.used(T0 + 1000)).toBe(0);
    expect(b.waitFor(4600, T0 + 1000)).toBe(0);
  });

  it("removes only the matching reservation, not every one that size", () => {
    const b = new TokenBudget(LIMIT);
    b.record(2000, T0);
    b.record(2000, T0 + 500);
    b.release(2000, T0);
    expect(b.used(T0 + 600)).toBe(2000);
  });

  it("is a no-op when nothing matches", () => {
    const b = new TokenBudget(LIMIT);
    b.record(2000, T0);
    b.release(999, T0);
    b.release(2000, T0 + 99_999);
    expect(b.used(T0 + 100)).toBe(2000);
  });
});

describe("the batch shape that was failing", () => {
  it("paces five files instead of letting four fail", () => {
    // 4 rules + one training example puts a file near 4600 tokens.
    const b = new TokenBudget(LIMIT);
    const EST = 4600;
    let clock = T0;
    const sentAt: number[] = [];

    for (let i = 0; i < 5; i++) {
      const wait = b.waitFor(EST, clock);
      expect(wait).toBeGreaterThanOrEqual(0);
      const goAt = clock + wait;
      b.record(EST, goAt);
      sentAt.push(goAt);
      clock = goAt + 8000; // parse + round trip for the next file
    }

    // No two sends inside the same 60s window — which is the whole point.
    for (let i = 1; i < sentAt.length; i++) {
      expect(sentAt[i] - sentAt[i - 1]).toBeGreaterThanOrEqual(60_000 - EST);
    }
    // And nothing was told to send instantly on top of a full window.
    expect(new Set(sentAt).size).toBe(5);
  });
});
