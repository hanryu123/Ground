"use client";

import { useEffect, useState } from "react";
import { findTeam, type Team } from "@/lib/teams";
import type { LiveGame } from "@/lib/kbo";
import type { ScoringEvent } from "@/app/api/kbo/scoring/[gameId]/route";

/**
 * 오늘 탭 — 경기 중·후 득점 기록. 최신 득점이 위, 우리 팀 득점은 구단 색 점과 진한 글씨,
 * 상대 득점은 흐리게. 점수는 항상 우리 점수가 먼저. 경기 중엔 1분마다 다시 받는다.
 */
export default function ScoringTimeline({ team, game }: { team: Team; game: LiveGame }) {
  const [events, setEvents] = useState<ScoringEvent[] | null>(null);
  const live = game.status === "LIVE";
  const active = live || game.status === "RESULT";

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = () =>
      fetch(`/api/kbo/scoring/${game.id}?homeId=${game.homeId}&awayId=${game.awayId}${live ? "&live=1" : ""}`)
        .then((r) => (r.ok ? r.json() : { events: [] }))
        .then((j: { events?: ScoringEvent[] }) => {
          if (alive) setEvents(j.events ?? []);
        })
        .catch(() => {
          if (alive) setEvents((prev) => prev ?? []);
        });
    void load();
    const id = live ? window.setInterval(load, 60_000) : null;
    return () => {
      alive = false;
      if (id) window.clearInterval(id);
    };
  }, [active, live, game.id, game.homeId, game.awayId]);

  if (!active || !events || events.length === 0) return null;
  const isHome = game.homeId === team.id;
  const opp = findTeam(isHome ? game.awayId : game.homeId);

  return (
    <section className="mx-4 mt-4" aria-labelledby="scoring-timeline-title">
      <h2 id="scoring-timeline-title" className="mb-1.5 px-5 text-[13px] text-sys-label2">
        득점 기록
      </h2>
      <ol className="overflow-hidden rounded-[12px] bg-sys-card">
        {[...events].reverse().map((e, i) => {
          const mine = e.teamId === team.id;
          const my = isHome ? e.homeScore : e.awayScore;
          const op = isHome ? e.awayScore : e.homeScore;
          return (
            <li key={`${e.inning}-${e.half}`} className={i > 0 ? "border-t-[0.5px] border-sys-sep" : ""}>
              <div className={`flex min-h-[52px] items-center gap-3 px-4 py-2.5 ${mine ? "" : "text-sys-label2"}`}>
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${mine ? "bg-club-tint" : "bg-sys-label3"}`}
                  aria-hidden
                />
                <span className="w-[54px] shrink-0 text-[13px] font-semibold">
                  {e.inning}회{e.half === "top" ? "초" : "말"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[16px] ${mine ? "font-bold text-label" : ""}`}>
                    {mine ? team.short : opp.short} {e.description === `${e.runs}점` ? `${e.runs}점` : e.description}
                  </span>
                  {e.description !== `${e.runs}점` ? (
                    <span className="block text-[13px] text-sys-label2">이 이닝 {e.runs}점</span>
                  ) : null}
                </span>
                <span className={`shrink-0 font-num text-[20px] font-semibold ${mine ? "text-label" : ""}`}>
                  {my}
                  <span className="mx-1 opacity-50">:</span>
                  {op}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
