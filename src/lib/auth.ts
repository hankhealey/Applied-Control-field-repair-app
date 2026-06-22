export const SESSION_COOKIE = "__rr_session";

/** Derives a session token from the password + secret using HMAC-SHA-256.
 *  Works in both Edge (middleware) and Node.js (API routes) runtimes. */
export async function computeSessionToken(
  password: string,
  secret: string
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(password));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
