// AI extraction rules — shared across all users via /api/ai-rules (Upstash
// Redis), with a localStorage fallback when shared storage isn't configured
// (e.g. local dev without KV env vars).
//
// Each rule is a plain-language correction the user typed into the chat log
// on the import page (e.g. "Never put the manufacturer name in the valve
// model field"). Rules are injected into every Groq extraction prompt.

import type { IrisAssetType } from "@/lib/exports/iris";

/** Scope a rule applies to: one asset type, or "All" for every extraction. */
export type RuleScope = "All" | IrisAssetType;

// Literal kept in sync with IrisAssetType by the type annotation — a drifted
// entry is a compile error. Defined here (not imported from iris.ts) so the
// server route can import it without pulling iris.ts's client-side deps.
export const RULE_SCOPES: RuleScope[] = [
  "All", "Control Valve", "Relief Valve", "Isolation Valve",
  "Motor Operated Valve", "Manual Valve", "Regulator", "Steam Trap",
  "General", "Machinery", "Measurement", "Tank",
];

export interface AIRule {
  id: string;
  text: string;
  createdAt: string;
  /** Asset type this rule applies to; legacy rules normalize to "All". */
  assetType: RuleScope;
}

const STORAGE_KEY = "ai-extraction-rules";

/** Max characters of a single rule injected into the prompt. */
export const RULE_MAX_CHARS = 300;

/** Minimum characters for a rule to be saved (prevents junk entries). */
export const RULE_MIN_CHARS = 10;

// ── localStorage fallback ────────────────────────────────────────────────────

function normalizeRule(r: AIRule): AIRule {
  return { ...r, assetType: r.assetType ?? "All" };
}

function getLocalRules(): AIRule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AIRule[]).map(normalizeRule) : [];
  } catch {
    return [];
  }
}

function setLocalRules(rules: AIRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // QuotaExceededError or SecurityError — ignore
  }
}

// ── Shared API with fallback ─────────────────────────────────────────────────

/**
 * Load rules. Prefers the shared store; falls back to localStorage.
 * On first contact with the shared store, migrates any browser-local rules
 * up so nothing is lost (idempotent — server dedups by exact text).
 */
export async function fetchAIRules(): Promise<{ rules: AIRule[]; shared: boolean }> {
  try {
    const res = await fetch("/api/ai-rules", { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = (await res.json()) as { shared: boolean; rules: AIRule[] };
      if (data.shared) {
        let rules = data.rules.map(normalizeRule);
        const local = getLocalRules();
        if (local.length > 0) {
          let allOk = true;
          for (const r of local) {
            if (rules.some((sr) => sr.text === r.text && sr.assetType === r.assetType)) continue;
            try {
              const pres = await fetch("/api/ai-rules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: r.text, assetType: r.assetType }),
              });
              if (pres.ok) {
                const pd = (await pres.json()) as { rule: AIRule; duplicate?: boolean };
                if (pd.rule && !pd.duplicate) rules = [...rules, normalizeRule(pd.rule)];
              } else {
                allOk = false;
              }
            } catch {
              allOk = false;
            }
          }
          // Only clear the local copy once everything made it up
          if (allOk) setLocalRules([]);
        }
        return { rules, shared: true };
      }
    }
  } catch {
    // network error / timeout — fall back to local
  }
  return { rules: getLocalRules(), shared: false };
}

/**
 * Add a rule. Tries the shared store first; falls back to localStorage when
 * shared storage is unavailable. Returns an error message for validation
 * failures (too short, limit reached).
 */
export async function addAIRule(
  text: string,
  assetType: RuleScope = "All",
): Promise<{ rule: AIRule; shared: boolean } | { error: string }> {
  const trimmed = text.trim();
  if (trimmed.length < RULE_MIN_CHARS) {
    return { error: `Rule too short — describe the correction in at least ${RULE_MIN_CHARS} characters` };
  }
  try {
    const res = await fetch("/api/ai-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: trimmed, assetType }),
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as { rule: AIRule };
      return { rule: normalizeRule(data.rule), shared: true };
    }
    if (res.status !== 503) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { error: err.error ?? `Failed to save rule (${res.status})` };
    }
    // 503 = shared storage not configured — fall through to local
  } catch {
    // network error — fall through to local
  }
  const rule: AIRule = {
    id: crypto.randomUUID(),
    text: trimmed,
    createdAt: new Date().toISOString(),
    assetType,
  };
  setLocalRules([...getLocalRules(), rule]);
  return { rule, shared: false };
}

/** Delete a rule from the shared store or localStorage, matching where it lives. */
export async function removeAIRule(id: string, shared: boolean): Promise<boolean> {
  if (shared) {
    try {
      const res = await fetch(`/api/ai-rules?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
  setLocalRules(getLocalRules().filter((r) => r.id !== id));
  return true;
}

/** Rules that apply to an extraction of the given asset type. */
export function rulesForType(rules: AIRule[], assetType: IrisAssetType): AIRule[] {
  return rules.filter((r) => r.assetType === "All" || r.assetType === assetType);
}

/** Rule texts in creation order, truncated for prompt injection. */
export function ruleTextsForPrompt(rules: AIRule[]): string[] {
  return rules.map((r) => r.text.slice(0, RULE_MAX_CHARS));
}
