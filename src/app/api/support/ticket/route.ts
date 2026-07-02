import type { NextRequest } from "next/server";
import { getIp } from "@/lib/ip";
import { getResend, EMAIL_FROM, ADMIN_EMAIL } from "@/lib/email";

const ticketAttempts = new Map<string, { count: number; resetAt: number }>();
const TICKET_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const TICKET_MAX = 5;

function checkRateLimit(req: NextRequest): Response | null {
  const ip = getIp(req);
  const now = Date.now();
  const entry = ticketAttempts.get(ip);
  if (entry && now > entry.resetAt) ticketAttempts.delete(ip);
  const current = ticketAttempts.get(ip);
  if (current && current.count >= TICKET_MAX) {
    return Response.json(
      { error: "Too many tickets submitted — try again later" },
      { status: 429 },
    );
  }
  ticketAttempts.set(ip, {
    count: (current?.count ?? 0) + 1,
    resetAt: current?.resetAt ?? now + TICKET_WINDOW_MS,
  });
  return null;
}

export async function POST(req: NextRequest) {
  const rateLimitHit = checkRateLimit(req);
  if (rateLimitHit) return rateLimitHit;

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: "Email service not configured" }, { status: 503 });
  }

  let body: { name?: string; email?: string; subject?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, subject, description } = body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!subject?.trim()) {
    return Response.json({ error: "Subject is required" }, { status: 400 });
  }
  if (!description?.trim()) {
    return Response.json({ error: "Description is required" }, { status: 400 });
  }
  if (description.length > 2000) {
    return Response.json({ error: "Description too long (max 2000 chars)" }, { status: 413 });
  }

  const submittedAt = new Date().toLocaleString("en-US", { timeZone: "America/Denver" });
  const text = [
    `From: ${name ? `${name} <${email}>` : email}`,
    `Submitted: ${submittedAt} MT`,
    "",
    description,
  ].join("\n");

  try {
    await getResend().emails.send({
      from: EMAIL_FROM,
      to: ADMIN_EMAIL,
      replyTo: email,
      subject: `[Ticket] ${subject}`,
      text,
    });
  } catch (err) {
    return Response.json(
      { error: `Failed to send ticket: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
