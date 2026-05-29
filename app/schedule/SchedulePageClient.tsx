"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Play } from "lucide-react";
import {
  PAST_GAMES,
  TODAY_GAMES,
  TOMORROW_GAMES,
  type Game,
} from "@/lib/games";
import { findTeam } from "@/lib/teams";
import { useKboSchedule } from "@/lib/useKboSchedule";
import { starterLabel, type LiveGame, type ScheduleBundle } from "@/lib/kbo";
import { venueDisplayLines } from "@/lib/venue";
import type { ScoringEvent } from "@/app/api/kbo/scoring/[gameId]/route";

const EMPTY_GAMES: Game[] = [];

type Section = {
  date: string;
  dateLabel: string;
  badge: "PAST" | "TODAY" | "TOMORROW" | "UPCOMING";
  tone: "past" | "today" | "future";
  games: (Game | LiveGame)[];
};

const KO_DOW = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const dow = KO_DOW[d.getUTCDay()];
  return `${month}월 ${day}일 · ${dow}`;
}

function groupByDate<T extends { date: string }>(
  games: T[]
): Array<{ date: string; games: T[] }> {
  const map = new Map<string, T[]>();
  for (const g of games) {
    const arr = map.get(g.date) ?? [];
    arr.push(g);
    map.set(g.date, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, games]) => ({ date, games }));
}

export default function SchedulePageClient({
  initial,
}: {
  initial: ScheduleBundle;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const currentSectionRef = useRef(0);
  const scrollLockedRef = useRef(false);
  const didLiveScrollRef = useRef(false);

  const live = useKboSchedule(initial);

  const sections = useMemo<Section[]>(() => {
    const sourcePast: (Game | LiveGame)[] = live?.past ?? PAST_GAMES;
    const sourceToday: (Game | LiveGame)[] = live?.today ?? TODAY_GAMES;
    const sourceTomorrow: (Game | LiveGame)[] = live?.tomorrow ?? TOMORROW_GAMES;
    const sourceUpcoming: (Game | LiveGame)[] = live?.upcoming ?? EMPTY_GAMES;

    const past = groupByDate(sourcePast).map(
      ({ date, games }): Section => ({
        date,
        dateLabel: formatDateLabel(date),
        badge: "PAST",
        tone: "past",
        games,
      })
    );

    let todaySections = groupByDate(sourceToday).map(
      ({ date, games }): Section => ({
        date,
        dateLabel: formatDateLabel(date),
        badge: "TODAY",
        tone: "today",
        games,
      })
    );
    if (todaySections.length === 0 && live?.date) {
      todaySections = [
        {
          date: live.date,
          dateLabel: formatDateLabel(live.date),
          badge: "TODAY",
          tone: "today",
          games: [],
        },
      ];
    }
    const tomorrowSections = groupByDate(sourceTomorrow).map(
      ({ date, games }): Section => ({
        date,
        dateLabel: formatDateLabel(date),
        badge: "TOMORROW",
        tone: "future",
        games,
      })
    );
    const upcomingSections = groupByDate(sourceUpcoming).map(
      ({ date, games }): Section => ({
        date,
        dateLabel: formatDateLabel(date),
        badge: "UPCOMING",
        tone: "future",
        games,
      })
    );

    return [...past, ...todaySections, ...tomorrowSections, ...upcomingSections];
  }, [live]);

  const todayIndex = useMemo(() => {
    const idx = sections.findIndex((s) => s.badge === "TODAY");
    return idx >= 0 ? idx : 0;
  }, [sections]);

  const scrollToSection = useCallback(
    (index: number, behavior: ScrollBehavior = "smooth") => {
      const root = rootRef.current;
      const target = sectionRefs.current[index];
      if (!root || !target) return;
      currentSectionRef.current = index;
      root.scrollTo({ top: target.offsetTop, behavior });
    },
    []
  );

  const bumpHaptic = useCallback(() => {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(12);
    }
  }, []);

  const stepSection = useCallback(
    (dir: 1 | -1) => {
      if (scrollLockedRef.current) return;
      const max = Math.max(0, sections.length - 1);
      const next = Math.min(max, Math.max(0, currentSectionRef.current + dir));
      if (next === currentSectionRef.current) return;
      scrollLockedRef.current = true;
      scrollToSection(next, "smooth");
      bumpHaptic();
      window.setTimeout(() => {
        scrollLockedRef.current = false;
      }, 430);
    },
    [sections.length, scrollToSection, bumpHaptic]
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    scrollToSection(todayIndex, "auto");
  }, [todayIndex, scrollToSection]);

  useEffect(() => {
    if (didLiveScrollRef.current) return;
    if (!live) return;
    if (live === initial) {
      didLiveScrollRef.current = true;
      return;
    }
    const raf = requestAnimationFrame(() => {
      scrollToSection(todayIndex, "auto");
      didLiveScrollRef.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [live, initial, todayIndex, scrollToSection]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchDeltaY = 0;
    let axis: "x" | "y" | null = null;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 8) return;
      e.preventDefault();
      stepSection(e.deltaY > 0 ? 1 : -1);
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0]?.clientX ?? 0;
      touchStartY = e.touches[0]?.clientY ?? 0;
      touchDeltaY = 0;
      axis = null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      if (axis == null && Math.hypot(dx, dy) > 8) {
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (axis === "x") return;
      touchDeltaY = touchStartY - t.clientY;
      e.preventDefault();
    };
    const onTouchEnd = () => {
      if (axis !== "y") return;
      if (Math.abs(touchDeltaY) < 24) return;
      stepSection(touchDeltaY > 0 ? 1 : -1);
    };

    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: false });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
    };
  }, [stepSection]);

  return (
    <div ref={rootRef} className="flex-1 min-h-0 overflow-y-auto">
      <section className="px-0 pb-10">
        <header className="px-7 pt-7">
          <p
            className="text-[10px] uppercase tracking-[0.32em] text-white/45"
            style={{ fontWeight: 600 }}
          >
            Schedule
          </p>
        </header>

        {sections.map((sec, i) => (
          <DaySection
            key={`${sec.badge}-${sec.date}-${i}`}
            section={sec}
            sectionRef={(el) => {
              sectionRefs.current[i] = el;
            }}
          />
        ))}

        <p
          className="px-7 pt-12 text-[10px] uppercase tracking-[0.32em] text-white/30"
          style={{ fontWeight: 600 }}
        >
          End of feed
        </p>
      </section>
    </div>
  );
}

function DaySection({
  section,
  sectionRef,
}: {
  section: Section;
  sectionRef?: (el: HTMLDivElement | null) => void;
}) {
  const muted = section.tone !== "today";
  const headingColor =
    section.tone === "today"
      ? "text-white"
      : section.tone === "future"
        ? "text-white/60"
        : "text-white/45";

  return (
    <div ref={sectionRef} className="px-5 pt-10">
      <div className="mb-4 px-2">
        <div
          className="mb-2 flex items-center gap-1.5 text-white/70 drop-shadow-md"
          style={{ textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}
        >
          {section.badge === "PAST" && <ChevronUp size={12} strokeWidth={2.4} />}
          {(section.badge === "TOMORROW" || section.badge === "UPCOMING") && (
            <ChevronDown size={12} strokeWidth={2.4} />
          )}
          <span
            className="text-[10px] uppercase tracking-[0.3em]"
            style={{ fontWeight: 700 }}
          >
            {section.badge}
          </span>
        </div>
        <h2
          className={`text-[40px] leading-[0.95] tracking-tightest drop-shadow-md ${headingColor}`}
          style={{
            fontWeight: 900,
            textShadow: "0 2px 12px rgba(0,0,0,0.5)",
          }}
        >
          {section.dateLabel}
        </h2>
      </div>

      <ul className="flex flex-col gap-3">
        {section.games.map((g) => (
          <GameRow key={g.id} game={g} muted={muted} badge={section.badge} />
        ))}
        {section.games.length === 0 && (
          <li
            className="rounded-2xl border border-white/10 bg-black/40 py-10 text-center text-[11px] uppercase tracking-[0.3em] text-white/50 backdrop-blur-md"
            style={{ fontWeight: 700 }}
          >
            No games
          </li>
        )}
      </ul>
    </div>
  );
}

function GameRow({
  game,
  muted,
  badge,
}: {
  game: Game | LiveGame;
  muted?: boolean;
  badge: Section["badge"];
}) {
  const home = findTeam(game.homeId);
  const away = findTeam(game.awayId);
  const result = game.result;
  const liveGame = game as LiveGame;
  const liveStatus = liveGame.status;
  const liveScore = liveGame.liveScore;

  const [expanded, setExpanded] = useState(false);
  const [scoring, setScoring] = useState<ScoringEvent[] | null>(null);
  const [loadingScoring, setLoadingScoring] = useState(false);

  const isResult = liveStatus === "RESULT";
  const isLive = liveStatus === "LIVE";

  const handleExpand = useCallback(async () => {
    if (!isResult) return;
    const next = !expanded;
    setExpanded(next);
    if (next && scoring === null && !loadingScoring) {
      setLoadingScoring(true);
      try {
        const res = await fetch(
          `/api/kbo/scoring/${game.id}?homeId=${game.homeId}&awayId=${game.awayId}`
        );
        if (res.ok) {
          const data = (await res.json()) as { events: ScoringEvent[] };
          setScoring(data.events);
        } else {
          setScoring([]);
        }
      } catch {
        setScoring([]);
      } finally {
        setLoadingScoring(false);
      }
    }
  }, [isResult, expanded, scoring, loadingScoring, game.id, game.homeId, game.awayId]);

  const text = muted ? "text-white/55" : "text-white";
  const subtext = muted ? "text-white/30" : "text-white/55";
  const awayWon = result?.winnerId === away.id;
  const homeWon = result?.winnerId === home.id;
  const draw = !!result && result.winnerId === null;

  const awayTeamColor = result
    ? awayWon
      ? "text-white"
      : "text-white/35"
    : text;
  const homeTeamColor = result
    ? homeWon
      ? "text-white"
      : "text-white/35"
    : text;

  const venue = venueDisplayLines(game.stadium);

  // Live score colors - pulsing amber when live
  const liveAwayColor = liveScore
    ? liveScore.awayScore > liveScore.homeScore
      ? "text-white"
      : liveScore.awayScore < liveScore.homeScore
        ? "text-white/50"
        : "text-white/75"
    : "text-white/75";
  const liveHomeColor = liveScore
    ? liveScore.homeScore > liveScore.awayScore
      ? "text-white"
      : liveScore.homeScore < liveScore.awayScore
        ? "text-white/50"
        : "text-white/75"
    : "text-white/75";

  return (
    <li
      className={[
        "rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md backdrop-saturate-150 shadow-[0_8px_22px_rgba(0,0,0,0.35)]",
        isResult ? "cursor-pointer select-none active:scale-[0.992] transition-transform duration-100" : "",
      ].join(" ")}
      onClick={isResult ? handleExpand : undefined}
    >
      <div className="p-4">
        {/* ── 메인 행: 시간 | 원정팀 | 스코어/vs | 홈팀 | 뱃지 ── */}
        <div className="flex items-baseline gap-2">
          {/* 시간 */}
          <span
            className={`w-[52px] shrink-0 tabular-nums text-[17px] leading-none tracking-tight ${text}`}
            style={{ fontWeight: 800 }}
          >
            {game.time}
          </span>

          {/* 원정팀 */}
          <span
            className={`min-w-0 flex-1 truncate text-right text-[17px] leading-none tracking-tight drop-shadow-md ${awayTeamColor}`}
            style={{ fontWeight: 900, textShadow: "0 1px 6px rgba(0,0,0,0.45)" }}
          >
            {away.short}
          </span>

          {/* 스코어 / 라이브 스코어 / vs */}
          {result ? (
            <span
              className="shrink-0 min-w-[56px] text-center tabular-nums text-[15px] leading-none tracking-tight"
              style={{ fontWeight: 800 }}
            >
              <span className={awayWon ? "text-white" : "text-white/50"}>{result.awayScore}</span>
              <span className="mx-1 text-white/40">{draw ? "D" : ":"}</span>
              <span className={homeWon ? "text-white" : "text-white/50"}>{result.homeScore}</span>
            </span>
          ) : isLive && liveScore ? (
            <span
              className="shrink-0 min-w-[56px] text-center tabular-nums text-[16px] leading-none tracking-tight"
              style={{ fontWeight: 800 }}
            >
              <span className={liveAwayColor}>{liveScore.awayScore}</span>
              <span className="mx-1" style={{ color: "rgba(255,77,77,0.6)" }}>:</span>
              <span className={liveHomeColor}>{liveScore.homeScore}</span>
            </span>
          ) : (
            <span
              className="shrink-0 min-w-[32px] text-center text-[10px] italic text-white/45"
              style={{ fontWeight: 400 }}
            >
              vs
            </span>
          )}

          {/* 홈팀 */}
          <span
            className={`min-w-0 flex-1 truncate text-left text-[17px] leading-none tracking-tight drop-shadow-md ${homeTeamColor}`}
            style={{ fontWeight: 900, textShadow: "0 1px 6px rgba(0,0,0,0.45)" }}
          >
            {home.short}
          </span>

          {/* 상태 뱃지 */}
          <div className="shrink-0 flex flex-col items-end gap-1">
            {result && (
              <div className="flex items-center gap-1.5">
                <ResultBadge winnerSide={awayWon ? "away" : homeWon ? "home" : "draw"} />
                {/* 확장 토글 인디케이터 */}
                <span style={{ color: "rgba(255,255,255,0.3)", transition: "transform 0.2s", display: "inline-block", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                  <ChevronDown size={13} strokeWidth={2} />
                </span>
              </div>
            )}
            {liveStatus === "LIVE" && !result && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[8.5px] uppercase"
                style={{ fontWeight: 800, letterSpacing: "0.2em", color: "#ff4d4d", background: "rgba(255,77,77,0.12)" }}
              >
                <span className="inline-block h-1 w-1 animate-pulse rounded-full" style={{ backgroundColor: "#ff4d4d" }} />
                LIVE
              </span>
            )}
            {liveStatus === "CANCEL" && !result && (
              <span
                className="rounded-full px-2 py-[2px] text-[8.5px] uppercase"
                style={{ fontWeight: 800, letterSpacing: "0.2em", color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }}
              >
                CXL
              </span>
            )}
          </div>
        </div>

        {/* ── 서브 행: 투수 정보 ── */}
        {!(badge === "PAST" && result) && (
          <p
            className={`mt-2 truncate text-[11px] leading-tight tracking-wide ${subtext}`}
            style={{ fontWeight: 400 }}
          >
            {result ? (
              draw ? (
                <>무승부 · {starterLabel(game.awayPitcher)} vs {starterLabel(game.homePitcher)}</>
              ) : (
                <>{result.winningPitcher ?? "—"}<span className="mx-1.5 text-white/20">·</span>{result.losingPitcher ?? "—"}</>
              )
            ) : (
              <>
                {badge !== "TODAY" && <span className="text-white/40" style={{ fontWeight: 600 }}>선발 </span>}
                {starterLabel(game.awayPitcher)}<span className="mx-1.5 text-white/20">vs</span>{starterLabel(game.homePitcher)}
              </>
            )}
          </p>
        )}

        {/* ── 구장 + HIGHLIGHT ── */}
        <div className="mt-2 flex items-end justify-between gap-2">
          {venue.primary ? (
            <div className={`space-y-0.5 ${muted ? "text-white/38" : "text-white/52"}`}>
              <p className="text-[11px] leading-snug tracking-[0.08em]" style={{ fontWeight: 600 }}>{venue.primary}</p>
              {venue.secondary && (
                <p className={`text-[10px] leading-snug tracking-wide ${muted ? "text-white/28" : "text-white/36"}`} style={{ fontWeight: 400 }}>{venue.secondary}</p>
              )}
            </div>
          ) : <span />}
          <HighlightLink url={game.highlightUrl} muted={muted} />
        </div>
      </div>

      {/* ── 득점 정보 패널 (종료 경기만, 확장 시 노출) ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="scoring-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <ScoringPanel
              events={scoring}
              loading={loadingScoring}
              awayTeam={away.short}
              homeTeam={home.short}
              awayId={game.awayId}
              homeId={game.homeId}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

// ─── 득점 정보 패널 ───────────────────────────────────────────────────────────

function ScoringPanel({
  events,
  loading,
  awayTeam,
  homeTeam,
  awayId,
  homeId,
}: {
  events: ScoringEvent[] | null;
  loading: boolean;
  awayTeam: string;
  homeTeam: string;
  awayId: string;
  homeId: string;
}) {
  return (
    <div
      className="mx-4 mb-4 rounded-xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {/* 헤더 */}
      <div
        className="px-3 py-2 text-[9px] uppercase tracking-[0.28em] text-white/35"
        style={{ fontWeight: 700, borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        득점 정보
      </div>

      {/* 내용 */}
      {loading ? (
        <div className="px-3 py-5 text-center">
          <span className="text-[10px] text-white/30 tracking-[0.2em] uppercase">Loading...</span>
        </div>
      ) : !events || events.length === 0 ? (
        <div className="px-3 py-5 text-center">
          <span className="text-[10px] text-white/25 tracking-[0.18em] uppercase">상세 기록 없음</span>
        </div>
      ) : (
        <ul className="py-1">
          {events.map((ev, i) => {
            const isAway = ev.teamId === awayId;
            const teamName = isAway ? awayTeam : homeTeam;
            const inningLabel = `${ev.inning}회${ev.half === "top" ? "초" : "말"}`;
            const scoreLabel = `${ev.awayScore}:${ev.homeScore}`;

            return (
              <li
                key={i}
                className="flex items-center gap-2 px-3 py-[7px]"
                style={{
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : undefined,
                }}
              >
                {/* 이닝 */}
                <span
                  className="w-[38px] shrink-0 text-[10px] tabular-nums text-white/35"
                  style={{ fontWeight: 600 }}
                >
                  {inningLabel}
                </span>

                {/* 팀 */}
                <span
                  className="w-[28px] shrink-0 text-[11px] text-white/60"
                  style={{ fontWeight: 700 }}
                >
                  {teamName}
                </span>

                {/* 선수 + 설명 */}
                <span className="flex-1 min-w-0 truncate text-[11px] text-white/80" style={{ fontWeight: 500 }}>
                  {ev.player ? (
                    <>
                      <span className="text-white/90" style={{ fontWeight: 700 }}>{ev.player}</span>
                      <span className="text-white/40 mx-1">·</span>
                      {ev.description}
                    </>
                  ) : (
                    ev.description
                  )}
                </span>

                {/* 누적 스코어 */}
                <span
                  className="shrink-0 tabular-nums text-[11px] text-white/40"
                  style={{ fontWeight: 700 }}
                >
                  {isAway ? (
                    <>
                      <span className="text-white/65">{ev.awayScore}</span>
                      <span className="mx-0.5 text-white/25">:</span>
                      {ev.homeScore}
                    </>
                  ) : (
                    <>
                      {ev.awayScore}
                      <span className="mx-0.5 text-white/25">:</span>
                      <span className="text-white/65">{ev.homeScore}</span>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─── 기존 서브 컴포넌트들 ────────────────────────────────────────────────────

function ResultBadge({
  winnerSide,
}: {
  winnerSide: "away" | "home" | "draw";
}) {
  const label = winnerSide === "draw" ? "DRAW" : "FT";
  return (
    <span
      className="rounded-full px-2 py-[2px] text-[8.5px] uppercase"
      style={{
        fontWeight: 700,
        letterSpacing: "0.24em",
        color: "rgba(255,255,255,0.55)",
        background: "rgba(255,255,255,0.06)",
      }}
    >
      {label}
    </span>
  );
}

function HighlightLink({
  url,
  muted,
}: {
  url?: string;
  muted?: boolean;
}) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={[
        "inline-flex items-center gap-1.5 bg-transparent",
        "text-[8px] font-medium uppercase tracking-[0.28em]",
        "transition-colors duration-200 ease-out",
        "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-white/25",
        muted ? "text-white/40 hover:text-white" : "text-white/50 hover:text-white",
      ].join(" ")}
      style={{
        fontFamily:
          'ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <Play
        size={11}
        strokeWidth={1.15}
        className="shrink-0 opacity-90"
        aria-hidden
      />
      <span>HIGHLIGHT</span>
    </a>
  );
}
