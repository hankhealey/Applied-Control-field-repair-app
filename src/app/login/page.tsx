"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        const from = params.get("from") ?? "/";
        router.push(from);
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error ?? "Incorrect password");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
      <h1 className="mb-1 text-lg font-bold text-zinc-900">Sign in</h1>
      <p className="mb-6 text-sm text-zinc-500">
        Enter your team password to access the app.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Password
          </label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input w-full"
            placeholder="••••••••"
            required
            autoFocus
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-[#154A8A] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0F3A6E] disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
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
          <p className="text-xs font-semibold tracking-widest text-zinc-400">
            FIELD REPAIR REPORTS
          </p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-zinc-400">
          Applied Control ·{" "}
          <Link href="/privacy" className="underline hover:text-zinc-600">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
