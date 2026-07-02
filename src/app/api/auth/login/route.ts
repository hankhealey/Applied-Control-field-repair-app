import { type NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { computeSessionToken, SESSION_COOKIE } from "@/lib/auth";
import { getIp } from "@/lib/ip";
import { kvStore } from "@/lib/kv";

// In-memory rate limiter: 5 attempts per IP per 15 minutes.
// Resets on process restart — effective on persistent Node.js servers but not
// serverless environments where each cold start gets a fresh Map.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  const ip = getIp(req);
  const now = Date.now();

  // Clean up expired entries
  const entry = attempts.get(ip);
  if (entry && now > entry.resetAt) {
    attempts.delete(ip);
  }

  const current = attempts.get(ip);
  if (current && current.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((current.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many attempts — try again later" },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      },
    );
  }

  const body = (await req.json()) as { password?: string; email?: string };
  const { password, email } = body;

  const appPassword = process.env.APP_PASSWORD;
  const authSecret = process.env.AUTH_SECRET;

  if (!appPassword || !authSecret) {
    return NextResponse.json(
      { error: "Auth not configured on server" },
      { status: 500 },
    );
  }

  // ── Per-user login (email + password) ─────────────────────────────────────
  if (email) {
    const user = await kvStore.getUser(email).catch(() => null);
    const valid =
      user != null && (await bcrypt.compare(password ?? "", user.passwordHash).catch(() => false));
    if (!valid) {
      attempts.set(ip, {
        count: (current?.count ?? 0) + 1,
        resetAt: current?.resetAt ?? now + WINDOW_MS,
      });
      return NextResponse.json({ error: "Incorrect credentials" }, { status: 401 });
    }
    attempts.delete(ip);
    const sessionId = crypto.randomUUID();
    await kvStore.setSession(
      sessionId,
      { email: email.toLowerCase(), name: user.name, expiresAt: now + 30 * 24 * 60 * 60 * 1000 },
      30 * 24 * 3600,
    );
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
    return res;
  }

  // ── Admin login (password only) ────────────────────────────────────────────
  if (!password || password !== appPassword) {
    attempts.set(ip, {
      count: (current?.count ?? 0) + 1,
      resetAt: current?.resetAt ?? now + WINDOW_MS,
    });
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  // Success — clear any recorded failures for this IP
  attempts.delete(ip);

  const token = await computeSessionToken(appPassword, authSecret);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return res;
}
