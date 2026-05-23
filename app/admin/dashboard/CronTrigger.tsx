"use client";

import { useState, useTransition } from "react";
import { forceCron, testClaude } from "./actions";
import { TEAMS } from "@/lib/teams";

const CRONS = [
  { key: "preview" as const, label: "프리뷰 생성 + 푸시", emoji: "⚾" },
  { key: "postgame" as const, label: "경기 결과 리포트", emoji: "📊" },
  { key: "game-start" as const, label: "경기 시작 알림", emoji: "🚨" },
  { key: "check-score" as const, label: "스코어 체크", emoji: "🏆" },
  { key: "live-events" as const, label: "라이브 이벤트", emoji: "⚡" },
  { key: "check-highlight" as const, label: "하이라이트 감지", emoji: "🎬" },
];

export default function CronTrigger() {
  const [results, setResults] = useState<Record<string, string>>({});
  const [claudeResult, setClaudeResult] = useState<string>("");
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [, startTransition] = useTransition();

  const trigger = (key: typeof CRONS[number]["key"]) => {
    const teamId = selectedTeamId || undefined;
    const runKey = teamId ? `${key}:${teamId}` : key;
    setResults((r) => ({ ...r, [runKey]: "실행 중…" }));
    startTransition(async () => {
      const res = await forceCron(key, teamId);
      setResults((r) => ({
        ...r,
        [runKey]: res.ok
          ? `✓ ${JSON.stringify(res.result)}`
          : `✗ ${res.error ?? "오류"}`,
      }));
    });
  };

  const handleTestClaude = () => {
    setClaudeResult("테스트 중…");
    startTransition(async () => {
      const res = await testClaude();
      if (res.ok) {
        const r = res.result as { ok: boolean; text?: string; status?: number; error?: string; keyPrefix?: string };
        if (r.text) {
          setClaudeResult(`✓ 연결 OK | ${r.keyPrefix} | "${r.text}"`);
        } else {
          setClaudeResult(`✗ 응답 이상: ${r.error ?? JSON.stringify(r)}`);
        }
      } else {
        setClaudeResult(`✗ ${res.error ?? "오류"}`);
      }
    });
  };

  const teamLabel = selectedTeamId
    ? (TEAMS.find((t) => t.id === selectedTeamId)?.short ?? selectedTeamId.toUpperCase())
    : "전체";

  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <h2 className="text-lg font-semibold tracking-tight text-white">크론 강제 실행</h2>
      <p className="mt-1 text-xs text-slate-400">시간 윈도우 무시하고 즉시 실행합니다.</p>

      {/* 팀 선택 */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400 shrink-0">발송 대상:</span>
        <button
          onClick={() => setSelectedTeamId("")}
          className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
            selectedTeamId === ""
              ? "bg-white text-slate-900"
              : "border border-white/20 text-slate-300 hover:bg-slate-700"
          }`}
        >
          전체
        </button>
        {TEAMS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedTeamId(t.id)}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
              selectedTeamId === t.id
                ? "bg-white text-slate-900"
                : "border border-white/20 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {t.short}
          </button>
        ))}
      </div>

      {selectedTeamId && (
        <p className="mt-2 text-[11px] text-amber-400">
          ⚠ {teamLabel} 팀에만 발송됩니다.
          {selectedTeamId && " (하이라이트는 이미 보낸 경기도 재발송)"}
        </p>
      )}

      {/* 크론 버튼 */}
      <div className="mt-4 flex flex-wrap gap-3">
        {CRONS.map(({ key, label, emoji }) => {
          const runKey = selectedTeamId ? `${key}:${selectedTeamId}` : key;
          const resultText = results[runKey];
          return (
            <div key={key} className="flex flex-col gap-1">
              <button
                onClick={() => trigger(key)}
                disabled={resultText === "실행 중…"}
                className="rounded-lg border border-white/15 bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:opacity-40"
              >
                {emoji} {label}
                {selectedTeamId && (
                  <span className="ml-1.5 rounded bg-white/20 px-1.5 py-0.5 text-[10px]">{teamLabel}</span>
                )}
              </button>
              {resultText && (
                <p className={`max-w-xs truncate text-[11px] ${resultText.startsWith("✓") ? "text-emerald-400" : resultText === "실행 중…" ? "text-slate-400" : "text-red-400"}`}>
                  {resultText}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="flex flex-col gap-1">
          <button
            onClick={handleTestClaude}
            disabled={claudeResult === "테스트 중…"}
            className="w-fit rounded-lg border border-violet-500/40 bg-violet-900/50 px-4 py-2 text-sm font-semibold text-violet-200 transition hover:bg-violet-800/60 disabled:opacity-40"
          >
            🤖 Claude 연결 테스트
          </button>
          {claudeResult && (
            <p className={`max-w-xl text-[11px] break-all ${claudeResult.startsWith("✓") ? "text-emerald-400" : claudeResult === "테스트 중…" ? "text-slate-400" : "text-red-400"}`}>
              {claudeResult}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
