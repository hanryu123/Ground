"use client";

import { useState } from "react";

export function LoginGate() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      setErr(j?.error ?? `error ${res.status}`);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white antialiased flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="text-[11px] tracking-[0.4em] text-neutral-500 mb-3">
            GROUND
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Control Tower
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            관리자만 접근 가능합니다.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-white/10 bg-neutral-900/70 p-6 backdrop-blur"
        >
          <label className="block text-xs uppercase tracking-widest text-neutral-400 mb-2">
            Password
          </label>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-base outline-none focus:border-white/30 transition"
          />
          {err && (
            <div className="mt-3 text-xs text-red-400">
              {err === "invalid credentials" ? "비밀번호가 틀렸습니다." : err}
            </div>
          )}
          <button
            type="submit"
            disabled={!pw || busy}
            className="mt-5 w-full rounded-xl bg-white text-black font-medium py-3 text-sm transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-200"
          >
            {busy ? "확인 중…" : "Enter"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-neutral-600">
          Cookie 기반 12시간 세션 · httpOnly · sameSite=strict
        </p>
      </div>
    </main>
  );
}
