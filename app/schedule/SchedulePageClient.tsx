"use client";

import { useEffect, useMemo, useRef } from "react";
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

const EMPTY_GAMES: Game[] = [];

type Section = {
  /** 정렬용 ISO 날짜 */
  date: string;
  /** 화면 라벨 (예: "4월 18일 · 금") */
  dateLabel: string;
  /** 상단 작은 뱃지 */
  badge: "PAST" | "TODAY" | "TOMORROW" | "UPCOMING";
  /** 과거 일자 vs 오늘/미래 vs 오늘에 따라 톤 다르게 */
  tone: "past" | "today" | "future";
  /** Game 또는 LiveGame (LiveGame 은 status 필드 추가) */
  games: (Game | LiveGame)[];
};

const KO_DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** ISO date (YYYY-MM-DD) → "4월 18일 · 금" */
function formatDateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const dow = KO_DOW[d.getUTCDay()];
  return `${month}월 ${day}일 · ${dow}`;
}

/** 같은 날짜끼리 묶어 ascending(오래된→최신) 으로 반환 */
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
  /** 서버에서 SSR 로 받아온 초기 번들 — 첫 paint 부터 라이브 데이터 노출. */
  initial: ScheduleBundle;
}) {
  const todayRef = useRef<HTMLDivElement | null>(null);
  // 라이브 도착 후 한 번만 anchor 재조정. 5분 폴링마다 점프하면 사용자 스크롤 위치가 박살남.
  const didLiveScrollRef = useRef(false);

  // ── 라이브 KBO 데이터 (initial 로 즉시 채워진 뒤 5분 폴링으로 갱신) ──
  const live = useKboSchedule(initial);

  // 라이브 데이터가 도착하면 그것을, 아니면 정적 mock 으로 빌드.
  // SSR 덕에 initial 이 항상 채워져 있어 첫 렌더부터 sourceXxx 가 라이브 값.
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
    // 월요일·휴식일 등 today 경기 0건이라도 anchor 잡을 수 있게 placeholder 1섹션.
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

  // 초기 mount 시 TODAY 섹션으로 점프. SSR 덕분에 초기 콘텐츠가 이미 라이브이므로
  // 한 번의 useLayoutEffect 호출로 정확한 위치에 anchor 됨 (이전의 깜빡임 사라짐).
  useEffect(() => {
    const target = todayRef.current;
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top, behavior: "auto" });
  }, []);

  // 폴링으로 새 데이터가 도착했을 때, 사용자가 아직 스크롤하지 않은 첫 갱신 한정으로만
  // 보정 스크롤 (initial 과 동일한 데이터면 영향 없음).
  useEffect(() => {
    if (didLiveScrollRef.current) return;
    if (!live) return;
    if (live === initial) {
      // 첫 SSR 그대로면 폴링 갱신 아님 → 스킵
      didLiveScrollRef.current = true;
      return;
    }
    const raf = requestAnimationFrame(() => {
      const target = todayRef.current;
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({ top, behavior: "auto" });
      didLiveScrollRef.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [live, initial]);

  return (
    <section className="px-0 pb-10">
      <header className="px-7 pt-7">
        <p
          className="text-[10px] uppercase tracking-[0.32em] text-white/45"
          style={{ fontWeight: 600 }}
        >
          Schedule
        </p>
      </header>

      {sections.map((sec) => (
        <DaySection
          key={sec.date}
          section={sec}
          innerRef={sec.badge === "TODAY" ? todayRef : undefined}
        />
      ))}

      <p
        className="px-7 pt-12 text-[10px] uppercase tracking-[0.32em] text-white/30"
        style={{ fontWeight: 600 }}
      >
        End of feed
      </p>
    </section>
  );
}

function DaySection({
  section,
  innerRef,
}: {
  section: Section;
  innerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const muted = section.tone !== "today";
  const headingColor =
    section.tone === "today"
      ? "text-white"
      : section.tone === "future"
        ? "text-white/60"
        : "text-white/45";

  return (
    <div ref={innerRef} className="px-7 pt-12">
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-1.5 text-white/45">
          {section.badge === "PAST" && <ChevronUp size={12} strokeWidth={2.4} />}
          {(section.badge === "TOMORROW" || section.badge === "UPCOMING") && (
            <ChevronDown size={12} strokeWidth={2.4} />
          )}
          <span
            className="text-[10px] uppercase tracking-[0.3em]"
            style={{ fontWeight: 600 }}
          >
            {section.badge}
          </span>
        </div>
        <h2
          className={`text-[40px] leading-[0.95] tracking-tightest ${headingColor}`}
          style={{ fontWeight: 900 }}
        >
          {section.dateLabel}
        </h2>
      </div>

      <ul className="flex flex-col">
        {section.games.map((g) => (
          <GameRow key={g.id} game={g} muted={muted} badge={section.badge} />
        ))}
        {section.games.length === 0 && (
          <li
            className="py-10 text-center text-[11px] uppercase tracking-[0.3em] text-white/30"
            style={{ fontWeight: 600 }}
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
  const liveStatus = (game as LiveGame).status;

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

  return (
    <li className="group flex items-start gap-5 py-5">
      <div className="w-24 shrink-0" title={game.stadium || undefined}>
        <span
          className={`block tabular-nums text-[20px] leading-none tracking-tight ${text}`}
          style={{ fontWeight: 800 }}
        >
          {game.time}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0 flex flex-1 flex-nowrap items-baseline gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span
              className={`shrink-0 whitespace-nowrap text-[18px] leading-none tracking-tight ${awayTeamColor}`}
              style={{ fontWeight: 800 }}
            >
              {away.short}
            </span>

            {result ? (
              <>
                <span
                  className={`shrink-0 tabular-nums text-[16px] leading-none tracking-tight ${
                    awayWon ? "text-white" : "text-white/45"
                  }`}
                  style={{ fontWeight: 800 }}
                >
                  {result.awayScore}
                </span>
                <span
                  className="shrink-0 text-[10px] tracking-[0.3em] text-white/30"
                  style={{ fontWeight: 600 }}
                >
                  {draw ? "D" : ":"}
                </span>
                <span
                  className={`shrink-0 tabular-nums text-[16px] leading-none tracking-tight ${
                    homeWon ? "text-white" : "text-white/45"
                  }`}
                  style={{ fontWeight: 800 }}
                >
                  {result.homeScore}
                </span>
              </>
            ) : (
              <span
                className="shrink-0 text-[10px] italic tracking-[0.3em] text-white/35"
                style={{ fontWeight: 300 }}
              >
                vs
              </span>
            )}

            <span
              className={`shrink-0 whitespace-nowrap text-[18px] leading-none tracking-tight ${homeTeamColor}`}
              style={{ fontWeight: 800 }}
            >
              {home.short}
            </span>
          </div>

          {result && (
            <div className="flex shrink-0 flex-col items-end gap-1.5 self-baseline">
              <ResultBadge
                winnerSide={awayWon ? "away" : homeWon ? "home" : "draw"}
              />
              <HighlightLink url={game.highlightUrl} muted={muted} />
            </div>
          )}
        </div>

        {!(badge === "PAST" && result) && (
          <p
            className={`mt-1.5 truncate text-[12px] leading-tight tracking-wide ${subtext}`}
            style={{ fontWeight: 400 }}
          >
            {result ? (
              draw ? (
                <>
                  무승부 ·{" "}
                  {badge === "TODAY"
                    ? `${starterLabel(game.awayPitcher)} vs ${starterLabel(game.homePitcher)}`
                    : `선발 ${game.awayPitcher} vs ${game.homePitcher}`}
                </>
              ) : (
                <>
                  {result.winningPitcher ?? "—"}
                  <span className="mx-1.5 text-white/20">·</span>
                  {result.losingPitcher ?? "—"}
                </>
              )
            ) : (
              <>
                {badge === "TODAY" ? null : (
                  <>
                    <span className="text-white/40" style={{ fontWeight: 600 }}>
                      선발
                    </span>{" "}
                  </>
                )}
                {starterLabel(game.awayPitcher)}
                <span className="mx-1.5 text-white/20">vs</span>
                {starterLabel(game.homePitcher)}
              </>
            )}
          </p>
        )}

        {venue.primary ? (
          <div
            className={`mt-2.5 space-y-0.5 ${muted ? "text-white/42" : "text-white/55"}`}
          >
            <p
              className="text-[11px] font-semibold leading-snug tracking-[0.08em]"
              style={{ fontWeight: 600 }}
            >
              {venue.primary}
            </p>
            {venue.secondary ? (
              <p
                className={`text-[10px] font-normal leading-snug tracking-wide normal-case ${
                  muted ? "text-white/30" : "text-white/38"
                }`}
                style={{ fontWeight: 400 }}
              >
                {venue.secondary}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {liveStatus === "LIVE" && !result && (
        <span
          className="ml-2 inline-flex items-center gap-1 self-start rounded-full px-2 py-[2px] text-[8.5px] uppercase"
          style={{
            fontWeight: 800,
            letterSpacing: "0.2em",
            color: "#ff4d4d",
            background: "rgba(255,77,77,0.12)",
          }}
        >
          <span
            className="inline-block h-1 w-1 animate-pulse rounded-full"
            style={{ backgroundColor: "#ff4d4d" }}
          />
          LIVE
        </span>
      )}
      {liveStatus === "CANCEL" && !result && (
        <span
          className="ml-2 self-start rounded-full px-2 py-[2px] text-[8.5px] uppercase"
          style={{
            fontWeight: 800,
            letterSpacing: "0.2em",
            color: "rgba(255,255,255,0.4)",
            background: "rgba(255,255,255,0.06)",
          }}
        >
          CXL
        </span>
      )}
    </li>
  );
}

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

/** 유튜브 하이라이트 — 빨간 브랜드 없음, Play + HIGHLIGHT 만 */
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
