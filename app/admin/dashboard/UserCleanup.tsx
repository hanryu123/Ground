"use client";

import { useState, useTransition } from "react";
import { previewInactiveUsers, cleanInactiveUsers } from "./actions";

export default function UserCleanup() {
  const [preview, setPreview] = useState<number | null>(null);
  const [result, setResult] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);
  const [, startTransition] = useTransition();

  const handlePreview = () => {
    setResult("");
    setConfirmed(false);
    startTransition(async () => {
      const res = await previewInactiveUsers();
      if (res.ok) {
        setPreview(res.count ?? 0);
      } else {
        setResult(`✗ ${res.error}`);
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const res = await cleanInactiveUsers();
      if (res.ok) {
        setResult(`✓ ${res.deleted}명 삭제 완료`);
        setPreview(null);
        setConfirmed(false);
      } else {
        setResult(`✗ ${res.error}`);
      }
    });
  };

  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <h2 className="text-lg font-semibold tracking-tight text-white">허수 유저 정리</h2>
      <p className="mt-1 text-xs text-slate-400">
        활성 구독(enabled=true)이 없고 이메일 미등록 유저를 삭제합니다. 관련 알림 기록도 함께 삭제됩니다.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handlePreview}
          className="rounded-lg border border-white/15 bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600"
        >
          🔍 허수 몇 명인지 확인
        </button>

        {preview !== null && !confirmed && (
          <button
            onClick={() => setConfirmed(true)}
            className="rounded-lg border border-red-500/40 bg-red-900/40 px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-800/50"
          >
            🗑️ {preview}명 삭제하기
          </button>
        )}

        {confirmed && (
          <button
            onClick={handleDelete}
            className="animate-pulse rounded-lg border border-red-400 bg-red-700/60 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600/70"
          >
            ⚠️ 진짜 삭제 (되돌릴 수 없음)
          </button>
        )}
      </div>

      {preview !== null && !result && (
        <p className="mt-3 text-sm text-slate-300">
          허수 유저 <span className="font-bold text-white">{preview}명</span> 발견.{" "}
          {preview === 0 ? "정리할 허수가 없어요." : "삭제 버튼을 눌러주세요."}
        </p>
      )}

      {result && (
        <p className={`mt-3 text-sm font-semibold ${result.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>
          {result}
        </p>
      )}
    </div>
  );
}
