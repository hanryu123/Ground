"use client";

import { useState, useTransition } from "react";
import { forceCron } from "./actions";

const CRONS = [
  { key: "preview" as const, label: "프리뷰 생성 + 푸시", emoji: "⚾" },
  { key: "postgame" as const, label: "경기 결과 리포트", emoji: "📊" },
  { key: "game-start" as const, label: "경기 시작 알림", emoji: "🚨" },
  { key: "check-score" as const, label: "스코어 체크", emoji: "🏆" },
  { key: "live-events" as const, label: "라이브 이벤트", emoji: "⚡" },
];

export default function CronTrigger() {
  const [results, setResults] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const trigger = (key: "preview" | "postgame" | "game-start" | "check-score" | "live-events") => {
    setResults((r) => ({ ...r, [key]: "실행 중…" }));
    startTransition(async () => {
      const res = await forceCron(key);
      setResults((r) => ({
        ...r,
        [key]: res.ok
          ? `✓ ${JSON.stringify(res.result)}`
          : `✗ ${res.error ?? "오류"}`,
      }));
    });
  };

  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <h2 className="text-lg font-semibold tracking-tight text-white">크론 강제 실행</h2>
      <p className="mt-1 text-xs text-slate-400">시간 윈도우 무시하고 즉시 실행합니다.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {CRONS.map(({ key, label, emoji }) => (
          <div key={key} className="flex flex-col gap-1">
            <button
              onClick={() => trigger(key)}
              disabled={results[key] === "실행 중…"}
              className="rounded-lg border border-white/15 bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:opacity-40"
            >
              {emoji} {label}
            </button>
            {results[key] && (
              <p className={`max-w-xs truncate text-[11px] ${results[key].startsWith("✓") ? "text-emerald-400" : results[key] === "실행 중…" ? "text-slate-400" : "text-red-400"}`}>
                {results[key]}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
