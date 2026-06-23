import { type NextRequest, NextResponse } from "next/server";
import { computeSessionToken, SESSION_COOKIE } from "@/lib/auth";

const PUBLIC = ["/login", "/privacy", "/api/auth"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const password = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  // Auth is opt-in — if env vars are not set, allow everything through
  if (!password || !secret) return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie) {
    const expected = await computeSessionToken(password, secret);
    if (cookie === expected) return NextResponse.next();
  }

  // API calls get 401; page requests get redirected to login
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("from", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.png$|.*\\.ico$|.*\\.mjs$|.*\\.css$|.*\\.map$).*)",
  ],
};
