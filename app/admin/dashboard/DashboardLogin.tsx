"use client";

import { useActionState } from "react";
import { loginDashboard, type DashboardLoginState } from "./loginAction";

export default function DashboardLogin({ adminKey, configured }: { adminKey: string; configured: boolean }) {
  const [state, action, pending] = useActionState<DashboardLoginState, FormData>(loginDashboard, { error: null });

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-950 px-6 text-slate-100">
      <form action={action} className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/60 p-6">
        <p className="text-[11px] uppercase tracking-[0.34em] text-slate-400">GROUND ADMIN</p>
        <h1 className="mt-2 text-xl font-bold tracking-tight">비밀번호</h1>
        {configured ? null : (
          <p className="mt-2 text-xs text-amber-300">서버에 ADMIN_DASHBOARD_PASSWORD 가 설정되지 않았어요.</p>
        )}
        <input type="hidden" name="key" value={adminKey} />
        {/* type="password" 는 맥·아이폰에서 한글 입력이 막혀(영문 자판으로 입력됨) 한글 비밀번호가 늘 틀렸다 → 글자만 가린 text 입력 */}
        <input
          type="text"
          name="password"
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="mt-4 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none [-webkit-text-security:disc] focus:border-white/30"
        />
        {state.error ? <p className="mt-2 text-xs text-red-300">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-4 w-full rounded-xl bg-white py-3 text-sm font-semibold text-black disabled:opacity-50"
        >
          {pending ? "확인 중…" : "들어가기"}
        </button>
      </form>
    </main>
  );
}
