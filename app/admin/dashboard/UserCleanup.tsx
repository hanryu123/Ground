"use client";

import { useState, useTransition } from "react";
import { previewInactiveUsers, cleanInactiveUsers } from "./actions";

type PreviewResult = { noSub: number; stale: number };

export default function UserCleanup() {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [confirmMode, setConfirmMode] = useState<"none" | "basic" | "stale">("none");
  const [result, setResult] = useState<string>("");
  const [, startTransition] = useTransition();

  const handlePreview = () => {
    setResult("");
    setConfirmMode("none");
    startTransition(async () => {
      const res = await previewInactiveUsers();
      if (res.ok) {
        setPreview({ noSub: res.noSub ?? 0, stale: res.stale ?? 0 });
      } else {
        setResult(`✗ ${res.error}`);
      }
    });
  };

  const handleDelete = (includeStale: boolean) => {
    startTransition(async () => {
      const res = await cleanInactiveUsers(includeStale);
      if (res.ok) {
        setResult(`✓ ${res.deleted}명 삭제 완료`);
        setPreview(null);
        setConfirmMode("none");
      } else {
        setResult(`✗ ${res.error}`);
      }
    });
  };

  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <h2 className="text-lg font-semibold tracking-tight text-white">허수 유저 정리</h2>
      <p className="mt-1 text-xs text-slate-400">
        구독 없는 유저 또는 30일 이상 미활동(앱 삭제 추정) 유저를 정리합니다.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handlePreview}
          className="rounded-lg border border-white/15 bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
        >
          🔍 허수 현황 확인
        </button>
      </div>

      {preview && !result && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-white/8 bg-slate-800/60 p-4 text-sm text-slate-200">
            <p>📭 구독 없는 유저: <span className="font-bold text-white">{preview.noSub}명</span></p>
            <p className="mt-1">👻 30일 이상 미활동 (앱 삭제 추정): <span className="font-bold text-white">{preview.stale}명</span></p>
            <p className="mt-1 text-xs text-slate-400">합계: {preview.noSub + preview.stale}명 삭제 가능</p>
          </div>

          {confirmMode === "none" && (
            <div className="flex flex-wrap gap-2">
              {preview.noSub > 0 && (
                <button
                  onClick={() => setConfirmMode("basic")}
                  className="rounded-lg border border-orange-500/40 bg-orange-900/30 px-3 py-1.5 text-xs font-semibold text-orange-300 transition hover:bg-orange-800/40"
                >
                  🗑️ 구독 없는 {preview.noSub}명만 삭제
                </button>
              )}
              {preview.stale > 0 && (
                <button
                  onClick={() => setConfirmMode("stale")}
                  className="rounded-lg border border-red-500/40 bg-red-900/30 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-800/40"
                >
                  🗑️ 미활동 포함 전체 {preview.noSub + preview.stale}명 삭제
                </button>
              )}
            </div>
          )}

          {confirmMode === "basic" && (
            <button
              onClick={() => handleDelete(false)}
              className="animate-pulse rounded-lg border border-orange-400 bg-orange-700/50 px-4 py-2 text-sm font-bold text-white"
            >
              ⚠️ 구독 없는 {preview.noSub}명 진짜 삭제 (되돌릴 수 없음)
            </button>
          )}

          {confirmMode === "stale" && (
            <button
              onClick={() => handleDelete(true)}
              className="animate-pulse rounded-lg border border-red-400 bg-red-700/50 px-4 py-2 text-sm font-bold text-white"
            >
              ⚠️ {preview.noSub + preview.stale}명 진짜 삭제 (되돌릴 수 없음)
            </button>
          )}
        </div>
      )}

      {result && (
        <p className={`mt-3 text-sm font-semibold ${result.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>
          {result}
        </p>
      )}
    </div>
  );
}
