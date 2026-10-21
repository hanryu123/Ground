"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { findTeam } from "@/lib/teams";
import TeamLogoChip from "@/components/TeamLogoChip";
import type { BracketSeries, BracketTeam, PostseasonBracket as Bracket } from "@/lib/standings";

const ease = [0.22, 1, 0.36, 1] as const;
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-10-25" + "14:00" → "10/25(일) 14:00" */
function formatGameDate(date: string, time?: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const wd = WEEKDAY[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()];
  return `${m}/${d}(${wd})${time ? ` ${time}` : ""}`;
}

function seriesNote(s: BracketSeries): string {
  if (s.status === "DONE" && s.winnerId) {
    const w = findTeam(s.winnerId).short;
    return s.round === "KS" ? `${w} 우승` : `${w} 진출`;
  }
  if (s.status === "LIVE") return "경기 중";
  if (s.status === "WAITING") return "상대 기다리는 중";
  if (s.nextGame) {
    const when = formatGameDate(s.nextGame.date, s.nextGame.time);
    return s.status === "UPCOMING" ? `${when} 시작` : `다음 경기 ${when}`;
  }
  return "";
}

/** 접힌 상태 한 줄 요약 */
function summary(bracket: Bracket): string {
  if (bracket.championId) return `${findTeam(bracket.championId).short} 한국시리즈 우승`;
  const cur = bracket.series.find((s) => s.round === bracket.currentRound);
  if (!cur) return "";
  const pair =
    cur.higher && cur.lower
      ? `${findTeam(cur.higher.teamId).short} vs ${findTeam(cur.lower.teamId).short}`
      : "";
  return [cur.label, pair, seriesNote(cur)].filter(Boolean).join(" · ");
}

/**
 * PostseasonBracket — 순위표 위 접이식 대진표.
 *  와일드카드 → 준PO → PO → KS 순서로 한 라운드 한 줄. 왼쪽이 상위 시드.
 */
export default function PostseasonBracket({ bracket }: { bracket: Bracket }) {
  // 포스트시즌 진행 중이면 펼친 채로, 끝났으면 접어서 시작
  const [open, setOpen] = useState(!bracket.championId);

  return (
    <section aria-label="포스트시즌 대진표" className="mx-4 rounded-2xl border border-white/10 bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:opacity-70"
      >
        <span className="min-w-0">
          <span className="block text-[13px] text-white" style={{ fontWeight: 700 }}>
            포스트시즌 대진표
          </span>
          {!open && (
            <span className="mt-0.5 block truncate text-[11.5px] text-white/50">{summary(bracket)}</span>
          )}
        </span>
        <svg
          aria-hidden
          width="14"
          height="14"
          viewBox="0 0 14 14"
          className="shrink-0 text-white/50 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        >
          <path d="M3 5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease }}
            className="overflow-hidden px-4"
          >
            {bracket.series.map((s, i) => (
              <SeriesItem key={s.round} series={s} last={i === bracket.series.length - 1} />
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </section>
  );
}

function SeriesItem({ series, last }: { series: BracketSeries; last: boolean }) {
  const active = series.status === "LIVE" || series.status === "ONGOING" || series.status === "UPCOMING";
  const showScore = series.status !== "WAITING" && series.status !== "UPCOMING";
  return (
    <li className={`py-2.5 ${last ? "" : "border-b border-white/[0.06]"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-white/55" style={{ fontWeight: 700 }}>
          {series.label}
        </span>
        <span
          className="truncate text-[11px]"
          style={{ color: active ? "#34D27B" : "rgba(255,255,255,0.45)", fontWeight: 600 }}
        >
          {seriesNote(series)}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <TeamSide team={series.higher} series={series} align="left" />
        <span
          className="shrink-0 text-center text-[16px] tabular-nums text-white"
          style={{ fontWeight: 800, minWidth: 44 }}
        >
          {showScore ? (
            <>
              <Score team={series.higher} series={series} />
              <span className="px-1 text-white/30">:</span>
              <Score team={series.lower} series={series} />
            </>
          ) : (
            <span className="text-[11px] text-white/35" style={{ fontWeight: 600 }}>
              vs
            </span>
          )}
        </span>
        <TeamSide team={series.lower} placeholder={series.lowerPlaceholder} series={series} align="right" />
      </div>
      {series.round === "WC" && series.hasWildcardAdvantage && (
        <p className="mt-1 text-[10.5px] text-white/35">4위 팀이 1승을 안고 시작해요</p>
      )}
    </li>
  );
}

function Score({ team, series }: { team: BracketTeam | null; series: BracketSeries }) {
  const lost = series.winnerId != null && team != null && series.winnerId !== team.teamId;
  return <span style={{ opacity: lost ? 0.42 : 1 }}>{team?.wins ?? 0}</span>;
}

function TeamSide({
  team,
  placeholder,
  series,
  align,
}: {
  team: BracketTeam | null;
  placeholder?: string | null;
  series: BracketSeries;
  align: "left" | "right";
}) {
  const dir = align === "right" ? "flex-row-reverse text-right" : "";
  if (!team) {
    return (
      <span className={`flex min-w-0 flex-1 items-center gap-2 ${dir}`}>
        <span className="h-[22px] w-[22px] shrink-0 rounded-full border border-dashed border-white/25" />
        <span className="truncate text-[12.5px] text-white/40">{placeholder ?? "미정"}</span>
      </span>
    );
  }
  const t = findTeam(team.teamId);
  const lost = series.winnerId != null && series.winnerId !== team.teamId;
  const won = series.winnerId === team.teamId;
  return (
    <span className={`flex min-w-0 flex-1 items-center gap-2 ${dir}`} style={{ opacity: lost ? 0.42 : 1 }}>
      <TeamLogoChip teamId={team.teamId} />
      <span className="truncate text-[13.5px] text-white" style={{ fontWeight: won ? 800 : 600 }}>
        {t.short}
      </span>
      {team.seed != null && <span className="shrink-0 text-[10.5px] text-white/40">{team.seed}위</span>}
    </span>
  );
}
