// Client-side token governor for the Groq tokens-per-minute (TPM) ceiling.
//
// Groq bills a request against the per-minute budget as prompt + max_tokens,
// and enforces it as a ROLLING window. On the free on_demand tier the cap is
// 6000 TPM while one report costs ~4300, so a second file in the same minute
// always fails. This spaces requests so they fit instead of failing.
//
// Turn it off (or raise DEFAULT_TPM_LIMIT) on a paid tier — the Developer tier
// allows 250k TPM, where the wait is always zero and this is a no-op.

/** Free on_demand tier ceiling. Developer tier is 250_000. */
export const DEFAULT_TPM_LIMIT = 6000;

/** Rough token estimate. Llama averages ~4 chars per token for English. */
export const estimateTokens = (chars: number): number => Math.ceil(chars / 4);

/**
 * Mirrors the server's prompt sizing closely enough to pace requests. It does
 * not need to be exact — the server owns the real budget — but it must not
 * UNDER-estimate, or we'd pace too loosely and still hit the ceiling.
 */
export function estimateRequestTokens(input: {
  rawTextChars: number;
  exampleChars: number;
  ruleChars: number;
  withObservations: boolean;
}): number {
  const FIELD_LIST_CHARS = 1900; // 31 fields + descriptions
  const OBS_STRUCTURE_CHARS = 1550;
  const SCAFFOLD_CHARS = 600;
  const MAX_OUT = input.withObservations ? 1400 : 900;

  const promptChars =
    FIELD_LIST_CHARS +
    SCAFFOLD_CHARS +
    Math.min(input.rawTextChars, 6000) +
    input.exampleChars +
    input.ruleChars +
    (input.withObservations ? OBS_STRUCTURE_CHARS : 0);

  return estimateTokens(promptChars) + MAX_OUT;
}

interface Spend {
  at: number;
  tokens: number;
}

/**
 * Rolling 60s token-budget governor. Ask `waitFor(tokens)` how long until a
 * request fits, wait that long, then `record(tokens)` once it's sent.
 */
export class TokenBudget {
  private spends: Spend[] = [];

  constructor(private limitPerMin: number = DEFAULT_TPM_LIMIT) {}

  private prune(now: number): void {
    const cutoff = now - 60_000;
    this.spends = this.spends.filter((s) => s.at > cutoff);
  }

  /** Tokens spent inside the trailing 60s window. */
  used(now: number = Date.now()): number {
    this.prune(now);
    return this.spends.reduce((sum, s) => sum + s.tokens, 0);
  }

  /**
   * Milliseconds until `tokens` would fit. 0 means send it now.
   *
   * Never returns a negative. It used to return -1 for a request larger than
   * the whole per-minute budget, and the caller read that as "send immediately".
   * That was right for the FIRST file — the server trims an oversized prompt to
   * fit, so it lands — and wrong for every file after it, which then fired into
   * an already-full minute and 429'd. An oversized request can still succeed;
   * it just has to go into a CLEAR window, so wait for one.
   */
  waitFor(tokens: number, now: number = Date.now()): number {
    const used = this.used(now);
    if (used + tokens <= this.limitPerMin) return 0;

    // Wait for just enough of the oldest spends to age out of the window.
    const need = used + tokens - this.limitPerMin;
    let freed = 0;
    for (const s of this.spends) {
      freed += s.tokens;
      if (freed >= need) return Math.max(0, s.at + 60_000 - now);
    }

    // Bigger than the budget even with nothing else in flight: wait out the
    // newest spend so the request meets an empty window.
    const last = this.spends[this.spends.length - 1];
    return last ? Math.max(0, last.at + 60_000 - now) : 0;
  }

  record(tokens: number, now: number = Date.now()): void {
    this.spends.push({ at: now, tokens });
  }

  /**
   * Hand back a reservation whose request never reached the provider (network
   * error, timeout, abort). Without this a failed send keeps its tokens booked
   * for a full minute, so every file behind it waits for capacity that nothing
   * consumed — the throttle punishing you for its own failure.
   *
   * Deliberately NOT called on a 429: the provider saw that request and counted
   * it, so the reservation is real and waiting it out is correct.
   */
  release(tokens: number, at: number): void {
    const i = this.spends.findIndex((s) => s.at === at && s.tokens === tokens);
    if (i >= 0) this.spends.splice(i, 1);
  }

  reset(): void {
    this.spends = [];
  }
}

/** Shared across the import page so every file paces against one budget. */
export const groqBudget = new TokenBudget(DEFAULT_TPM_LIMIT);
