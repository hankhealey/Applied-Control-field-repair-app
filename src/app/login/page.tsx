"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

type Mode = "login" | "request";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");

  // ── Login state ────────────────────────────────────────────────────────────
  const [loginEmail, setLoginEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // ── Request access state ───────────────────────────────────────────────────
  const [reqName, setReqName] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqCompany, setReqCompany] = useState("");
  const [reqReason, setReqReason] = useState("");
  const [reqError, setReqError] = useState("");
  const [reqLoading, setReqLoading] = useState(false);
  const [reqSent, setReqSent] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const body = loginEmail.trim()
        ? { email: loginEmail.trim(), password }
        : { password };
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const rawFrom = params.get("from") ?? "/";
        const from = rawFrom.startsWith("/") && !rawFrom.startsWith("//") ? rawFrom : "/";
        router.push(from);
        router.refresh();
      } else {
        const data = await res.json();
        setLoginError(data.error ?? "Incorrect credentials");
      }
    } catch {
      setLoginError("Network error — please try again");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setReqError("");
    setReqLoading(true);
    try {
      const res = await fetch("/api/auth/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: reqName,
          email: reqEmail,
          company: reqCompany,
          reason: reqReason,
        }),
      });
      if (res.ok) {
        setReqSent(true);
      } else {
        const data = await res.json();
        setReqError(data.error ?? "Failed to submit request");
      }
    } catch {
      setReqError("Network error — please try again");
    } finally {
      setReqLoading(false);
    }
  }

  // ── Request Access success screen ──────────────────────────────────────────
  if (reqSent) {
    return (
      <div className="rounded-2xl border p-8 text-center shadow-sm" style={{ background: "var(--bg-card)", borderColor: "var(--border-solid)" }}>
        <p className="text-2xl">✅</p>
        <h1 className="mb-2 mt-3 text-base font-bold" style={{ color: "var(--text-primary)" }}>
          Request submitted
        </h1>
        <p className="mb-5 text-sm" style={{ color: "var(--text-secondary)" }}>
          You&apos;ll receive an email once your access is approved.
        </p>
        <button
          type="button"
          onClick={() => { setReqSent(false); setMode("login"); }}
          className="text-sm underline"
          style={{ color: "var(--text-secondary)" }}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  // ── Request Access form ────────────────────────────────────────────────────
  if (mode === "request") {
    return (
      <div className="rounded-2xl border p-8 shadow-sm" style={{ background: "var(--bg-card)", borderColor: "var(--border-solid)" }}>
        <h1 className="mb-1 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          Request Access
        </h1>
        <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
          Fill this out and you&apos;ll be emailed login credentials once approved.
        </p>

        <form onSubmit={handleRequest} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Full name
            </label>
            <input
              type="text"
              value={reqName}
              onChange={(e) => setReqName(e.target.value)}
              required
              className="input w-full"
              placeholder="Jane Smith"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Email
            </label>
            <input
              type="email"
              value={reqEmail}
              onChange={(e) => setReqEmail(e.target.value)}
              required
              className="input w-full"
              placeholder="jane@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Company <span style={{ color: "var(--text-label)" }}>(optional)</span>
            </label>
            <input
              type="text"
              value={reqCompany}
              onChange={(e) => setReqCompany(e.target.value)}
              className="input w-full"
              placeholder="Acme Inc."
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Why do you need access?
            </label>
            <textarea
              value={reqReason}
              onChange={(e) => setReqReason(e.target.value)}
              required
              rows={3}
              maxLength={500}
              className="input w-full resize-none"
              placeholder="Briefly describe your role and why you need access."
            />
          </div>

          {reqError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {reqError}
            </p>
          )}

          <button
            type="submit"
            disabled={reqLoading}
            className="rounded-xl bg-[#154A8A] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0F3A6E] disabled:opacity-50"
          >
            {reqLoading ? "Submitting…" : "Request Access"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setMode("login")}
          className="mt-4 w-full text-center text-sm underline"
          style={{ color: "var(--text-secondary)" }}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  // ── Login form ─────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border p-8 shadow-sm" style={{ background: "var(--bg-card)", borderColor: "var(--border-solid)" }}>
      <h1 className="mb-1 text-lg font-bold" style={{ color: "var(--text-primary)" }}>Sign in</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--text-secondary)" }}>
        Enter your credentials to access the app.
      </p>

      <form onSubmit={handleLogin} className="flex flex-col gap-4">
        <div>
          <label htmlFor="login-email" className="mb-1 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Email <span style={{ color: "var(--text-label)" }}>(or leave blank for shared login)</span>
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            className="input w-full"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input w-full"
            placeholder="••••••••"
            required
            // biome-ignore lint/a11y/noAutofocus: login page intentionally focuses password field
            autoFocus
          />
        </div>

        {loginError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {loginError}
          </p>
        )}

        <button
          type="submit"
          disabled={loginLoading}
          className="rounded-xl bg-[#154A8A] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0F3A6E] disabled:opacity-50"
        >
          {loginLoading ? "Signing in…" : "Sign In"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setMode("request")}
        className="mt-4 w-full text-center text-sm underline"
        style={{ color: "var(--text-secondary)" }}
      >
        Request access
      </button>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4" style={{ background: "var(--bg-main)" }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <Image
            src="/applied-control-logo.png"
            alt="Applied Control"
            width={200}
            height={62}
            className="h-10 w-auto"
            priority
          />
          <p className="text-xs font-semibold tracking-widest" style={{ color: "var(--text-label)" }}>
            FIELD REPAIR REPORTS
          </p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        {/* Footer */}
        <p className="mt-6 text-center text-xs" style={{ color: "var(--text-label)" }}>
          Applied Control ·{" "}
          <Link href="/privacy" className="underline hover:opacity-80">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
