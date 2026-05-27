"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // Full reload so middleware re-evaluates with the new cookie.
        window.location.href = "/";
      } else {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Login failed");
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#faf7ff] via-white to-[#f3e8ff] px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-8">
          <div className="flex flex-col items-center mb-6">
            <Logo variant="wordmark" height={30} priority />
            <div className="mt-2 text-[11px] text-slate-500 uppercase tracking-[0.18em]">
              HR Bot · People Ops
            </div>
          </div>

          <h1 className="text-lg font-semibold text-slate-900 text-center mb-1">
            Sign in to continue
          </h1>
          <p className="text-xs text-slate-500 text-center mb-6">
            This dashboard contains internal performance data. Enter the team password.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="pw" className="block text-xs font-medium text-slate-600 mb-1.5">
                Password
              </label>
              <input
                id="pw"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#AE00D0]/30 focus:border-[#AE00D0]"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-[#AE00D0] to-[#7B5AFF] text-white text-sm font-medium disabled:opacity-50 transition-opacity"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
        <p className="text-center text-[11px] text-slate-400 mt-4">
          Rapid Innovation · ruh.ai — internal use only
        </p>
      </div>
    </main>
  );
}
