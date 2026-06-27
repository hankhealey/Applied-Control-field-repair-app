import { type NextRequest, NextResponse } from "next/server";
import { computeSessionToken, SESSION_COOKIE } from "@/lib/auth";

// In-memory rate limiter: 5 attempts per IP per 15 minutes
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function getIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

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

  const { password } = (await req.json()) as { password?: string };

  const appPassword = process.env.APP_PASSWORD;
  const authSecret = process.env.AUTH_SECRET;

  if (!appPassword || !authSecret) {
    return NextResponse.json(
      { error: "Auth not configured on server" },
      { status: 500 },
    );
  }

  // Count failed attempts only (don't penalise successful logins)
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
