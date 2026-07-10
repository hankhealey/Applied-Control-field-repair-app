// Shared AI extraction rules — stored in Upstash Redis so every user sees
// and contributes to the same rule set. Auth is enforced by src/proxy.ts.
// When KV is not configured (local dev), GET returns { shared: false } and
// the client falls back to localStorage.

import type { NextRequest } from "next/server";
import { kvStore, type SharedAIRule } from "@/lib/kv";

const RULE_MIN_CHARS = 10;
const RULE_MAX_CHARS = 1000;
const MAX_RULES = 200;

function kvAvailable(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

export async function GET() {
  if (!kvAvailable()) {
    return Response.json({ shared: false, rules: [] });
  }
  try {
    const rules = (await kvStore.getAIRules()) ?? [];
    return Response.json({ shared: true, rules });
  } catch {
    return Response.json({ shared: false, rules: [] });
  }
}

export async function POST(req: NextRequest) {
  if (!kvAvailable()) {
    return Response.json({ error: "Shared storage not configured" }, { status: 503 });
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.text?.trim() ?? "";
  if (text.length < RULE_MIN_CHARS) {
    return Response.json({ error: `Rule must be at least ${RULE_MIN_CHARS} characters` }, { status: 400 });
  }
  if (text.length > RULE_MAX_CHARS) {
    return Response.json({ error: `Rule must be under ${RULE_MAX_CHARS} characters` }, { status: 400 });
  }

  try {
    const rules = (await kvStore.getAIRules()) ?? [];
    if (rules.length >= MAX_RULES) {
      return Response.json({ error: "Rule limit reached — delete old rules first" }, { status: 400 });
    }
    // Skip exact duplicates so two users adding the same correction don't double it
    const existing = rules.find((r) => r.text === text);
    if (existing) {
      return Response.json({ rule: existing, duplicate: true });
    }
    const rule: SharedAIRule = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toISOString(),
    };
    await kvStore.setAIRules([...rules, rule]);
    return Response.json({ rule });
  } catch (err) {
    return Response.json(
      { error: `Failed to save rule: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!kvAvailable()) {
    return Response.json({ error: "Shared storage not configured" }, { status: 503 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const rules = (await kvStore.getAIRules()) ?? [];
    await kvStore.setAIRules(rules.filter((r) => r.id !== id));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: `Failed to delete rule: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
