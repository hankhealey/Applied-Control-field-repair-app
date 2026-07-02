import { randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { kvStore } from "@/lib/kv";
import { resend, EMAIL_FROM, APP_URL } from "@/lib/email";

function htmlPage(title: string, body: string): Response {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} — Applied Control</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           background: #f5f5f7; color: #1d1d1f; margin: 0;
           display: flex; align-items: center; justify-content: center;
           min-height: 100vh; padding: 1rem; }
    .card { background: #fff; border-radius: 18px; padding: 2.5rem 2rem;
            max-width: 420px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,.08);
            text-align: center; }
    h1 { font-size: 1.25rem; font-weight: 700; margin: 0 0 .75rem; }
    p  { font-size: .95rem; color: #555; line-height: 1.6; margin: 0; }
    a  { color: #154A8A; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get("token");
  const action = searchParams.get("action");

  if (!token || (action !== "approve" && action !== "deny")) {
    return htmlPage("Invalid Link", "This link is missing required parameters.");
  }

  let pending: Awaited<ReturnType<typeof kvStore.getRequest>>;
  try {
    pending = await kvStore.getRequest(token);
  } catch {
    return htmlPage("Service Unavailable", "Could not reach the storage service. Please try again.");
  }

  if (!pending) {
    return htmlPage("Link Expired or Already Used", "This link has already been used or has expired.");
  }

  if (Date.now() > pending.expiresAt) {
    await kvStore.delRequest(token).catch(() => null);
    return htmlPage("Link Expired", "This approval link expired. Ask the requester to submit a new request.");
  }

  await kvStore.delRequest(token).catch(() => null);

  if (action === "deny") {
    if (process.env.RESEND_API_KEY) {
      await resend.emails
        .send({
          from: EMAIL_FROM,
          to: pending.email,
          subject: "Applied Control — Access Request Not Approved",
          text: `Hi ${pending.name},\n\nYour request for access to the Applied Control field reports app was not approved at this time.\n\nIf you believe this is an error, please reach out directly.\n\nApplied Control`,
        })
        .catch(() => null);
    }
    return htmlPage("Request Denied", `${pending.name}'s access request has been removed.`);
  }

  // ── Approve ───────────────────────────────────────────────────────────────
  const tempPassword = randomBytes(9).toString("base64"); // 12 printable chars
  let passwordHash: string;
  try {
    passwordHash = await bcrypt.hash(tempPassword, 12);
  } catch (err) {
    return htmlPage(
      "Error",
      `Could not generate credentials: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    await kvStore.setUser(pending.email, {
      name: pending.name,
      company: pending.company,
      passwordHash,
      createdAt: Date.now(),
    });
  } catch (err) {
    return htmlPage(
      "Storage Error",
      `Could not save user account: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (process.env.RESEND_API_KEY) {
    await resend.emails
      .send({
        from: EMAIL_FROM,
        to: pending.email,
        subject: "Your Applied Control access is ready",
        text: [
          `Hi ${pending.name},`,
          "",
          "Your access to the Applied Control field reports app has been approved.",
          "",
          `Login at: ${APP_URL}/login`,
          `Email:    ${pending.email}`,
          `Password: ${tempPassword}`,
          "",
          "Keep this password safe. Contact your admin if you need a reset.",
          "",
          "Applied Control",
        ].join("\n"),
      })
      .catch(() => null);
  }

  return htmlPage(
    "✅ Access Approved",
    `${pending.name} has been emailed their login credentials at <strong>${pending.email}</strong>.`,
  );
}
