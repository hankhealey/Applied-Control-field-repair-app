import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { getIp } from "@/lib/ip";
import { kvStore } from "@/lib/kv";
import { getResend, EMAIL_FROM, ADMIN_EMAIL, APP_URL } from "@/lib/email";

const requestAttempts = new Map<string, { count: number; resetAt: number }>();
const REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const REQUEST_MAX = 2;

function checkRateLimit(req: NextRequest): Response | null {
  const ip = getIp(req);
  const now = Date.now();
  const entry = requestAttempts.get(ip);
  if (entry && now > entry.resetAt) requestAttempts.delete(ip);
  const current = requestAttempts.get(ip);
  if (current && current.count >= REQUEST_MAX) {
    return Response.json(
      { error: "Too many requests — try again tomorrow" },
      { status: 429 },
    );
  }
  requestAttempts.set(ip, {
    count: (current?.count ?? 0) + 1,
    resetAt: current?.resetAt ?? now + REQUEST_WINDOW_MS,
  });
  return null;
}

export async function POST(req: NextRequest) {
  const rateLimitHit = checkRateLimit(req);
  if (rateLimitHit) return rateLimitHit;

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: "Email service not configured" }, { status: 503 });
  }

  let body: { name?: string; email?: string; company?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, company, reason } = body;

  if (!name?.trim()) return Response.json({ error: "Name is required" }, { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!reason?.trim()) return Response.json({ error: "Reason is required" }, { status: 400 });
  if (reason.length > 500) {
    return Response.json({ error: "Reason too long (max 500 chars)" }, { status: 413 });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

  try {
    await kvStore.setRequest(token, { name, email, company: company ?? "", reason, expiresAt }, 3600);
  } catch (err) {
    return Response.json(
      { error: `Storage error: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  const approveUrl = `${APP_URL}/api/auth/approve?token=${token}&action=approve`;
  const denyUrl = `${APP_URL}/api/auth/approve?token=${token}&action=deny`;

  const text = [
    `Access request from ${name} (${email})${company ? ` — ${company}` : ""}`,
    "",
    `Reason: ${reason}`,
    "",
    `✅ Approve: ${approveUrl}`,
    `❌ Deny:    ${denyUrl}`,
    "",
    "These links expire in 1 hour.",
  ].join("\n");

  try {
    await getResend().emails.send({
      from: EMAIL_FROM,
      to: ADMIN_EMAIL,
      subject: `Access Request: ${name} (${email})`,
      text,
    });
  } catch (err) {
    // Clean up KV entry if email fails
    await kvStore.delRequest(token).catch(() => null);
    return Response.json(
      { error: `Failed to send request: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
