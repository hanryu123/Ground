"use client";

import { useEffect, useMemo, useRef } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import {
  PAST_GAMES,
  TODAY_GAMES,
  TOMORROW_GAMES,
  type Game,
} from "@/lib/games";
import { findTeam } from "@/lib/teams";

type Section = {
  /** 정렬용 ISO 날짜 */
  date: string;
  /** 화면 라벨 (예: "4월 18일 · 금") */
  dateLabel: string;
  /** 상단 작은 뱃지 (PAST / TODAY / TOMORROW) */
  badge: "PAST" | "TODAY" | "TOMORROW";
  /** 과거 일자 vs 오늘/미래 vs 오늘에 따라 톤 다르게 */
  tone: "past" | "today" | "future";
  games: Game[];
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

/** PAST_GAMES 를 날짜별로 묶어 ascending(오래된→최신) 으로 반환 */
function groupPastByDate(games: Game[]): Array<{ date: string; games: Game[] }> {
  const map = new Map<string, Game[]>();
  for (const g of games) {
    const arr = map.get(g.date) ?? [];
    arr.push(g);
    map.set(g.date, arr);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b)) // 오래된 → 최신
    .map(([date, games]) => ({ date, games }));
}

export default function SchedulePage() {
  const todayRef = useRef<HTMLDivElement | null>(null);

  // 모든 섹션을 데이터에서 동적으로 빌드. 모듈 캐시된 정적 배열만 다루므로 비용 미미.
  const sections = useMemo<Section[]>(() => {
    const past = groupPastByDate(PAST_GAMES).map(
      ({ date, games }): Section => ({
        date,
        dateLabel: formatDateLabel(date),
        badge: "PAST",
        tone: "past",
        games,
      })
    );

    const today: Section | null =
      TODAY_GAMES[0]
        ? {
            date: TODAY_GAMES[0].date,
            dateLabel: formatDateLabel(TODAY_GAMES[0].date),
            badge: "TODAY",
            tone: "today",
            games: TODAY_GAMES,
          }
        : null;

    const tomorrow: Section | null =
      TOMORROW_GAMES[0]
        ? {
            date: TOMORROW_GAMES[0].date,
            dateLabel: formatDateLabel(TOMORROW_GAMES[0].date),
            badge: "TOMORROW",
            tone: "future",
            games: TOMORROW_GAMES,
          }
        : null;

    return [...past, ...(today ? [today] : []), ...(tomorrow ? [tomorrow] : [])];
  }, []);

  // 페이지(window) 스크롤을 TODAY 섹션 상단으로 즉시 점프.
  // BottomNav 가 fixed 라서 내부 overflow 컨테이너 없이 body 스크롤만 사용 → 더 빠르고 단순.
  useEffect(() => {
    const target = todayRef.current;
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top, behavior: "auto" });
  }, []);

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
          {section.badge === "TOMORROW" && (
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
          <GameRow key={g.id} game={g} muted={muted} />
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

function GameRow({ game, muted }: { game: Game; muted?: boolean }) {
  const home = findTeam(game.homeId);
  const away = findTeam(game.awayId);
  const result = game.result;

  const text = muted ? "text-white/55" : "text-white";
  const subtext = muted ? "text-white/30" : "text-white/55";
  const stadiumColor = muted ? "text-white/25" : "text-white/45";

  // 결과가 있으면: 승팀은 풀 화이트, 패팀은 살짝 옅게 — 시각 위계 강조
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

  return (
    <li className="group flex items-start gap-5 py-5">
      {/* 좌측: 시간 + 장소 */}
      <div className="w-24 shrink-0">
        <span
          className={`block tabular-nums text-[20px] leading-none tracking-tight ${text}`}
          style={{ fontWeight: 800 }}
        >
          {game.time}
        </span>
        <span
          className={`mt-1.5 block truncate text-[11px] leading-tight ${stadiumColor}`}
          style={{ fontWeight: 500, letterSpacing: "-0.005em" }}
          title={game.stadium}
        >
          {game.stadium}
        </span>
      </div>

      {/* 우측: 팀 매치업 (+ 결과/스코어) + 투수 라인 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={`text-[18px] leading-none tracking-tight ${awayTeamColor}`}
            style={{ fontWeight: 800 }}
          >
            {away.short}
          </span>

          {/* 미경기: vs / 경기끝: 스코어 / 무승부: D 뱃지 */}
          {result ? (
            <>
              <span
                className={`tabular-nums text-[16px] leading-none tracking-tight ${
                  awayWon ? "text-white" : "text-white/45"
                }`}
                style={{ fontWeight: 800 }}
              >
                {result.awayScore}
              </span>
              <span
                className="text-[10px] tracking-[0.3em] text-white/30"
                style={{ fontWeight: 600 }}
              >
                {draw ? "D" : ":"}
              </span>
              <span
                className={`tabular-nums text-[16px] leading-none tracking-tight ${
                  homeWon ? "text-white" : "text-white/45"
                }`}
                style={{ fontWeight: 800 }}
              >
                {result.homeScore}
              </span>
            </>
          ) : (
            <span
              className="text-[10px] italic tracking-[0.3em] text-white/35"
              style={{ fontWeight: 300 }}
            >
              vs
            </span>
          )}

          <span
            className={`text-[18px] leading-none tracking-tight ${homeTeamColor}`}
            style={{ fontWeight: 800 }}
          >
            {home.short}
          </span>

          {/* 결과 뱃지 (W·L·D) — 우측에 살짝 */}
          {result && (
            <ResultBadge
              winnerSide={awayWon ? "away" : homeWon ? "home" : "draw"}
            />
          )}
        </div>

        <p
          className={`mt-1.5 truncate text-[12px] leading-tight tracking-wide ${subtext}`}
          style={{ fontWeight: 400 }}
        >
          {result ? (
            draw ? (
              <>무승부 · 선발 {game.awayPitcher} vs {game.homePitcher}</>
            ) : (
              <>
                <span className="text-white/70" style={{ fontWeight: 600 }}>
                  승
                </span>{" "}
                {result.winningPitcher ?? "—"}
                <span className="mx-1.5 text-white/20">·</span>
                <span className="text-white/55" style={{ fontWeight: 600 }}>
                  패
                </span>{" "}
                {result.losingPitcher ?? "—"}
              </>
            )
          ) : (
            <>
              {game.awayPitcher}
              <span className="mx-1.5 text-white/20">vs</span>
              {game.homePitcher}
            </>
          )}
        </p>
      </div>
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
      className="ml-auto rounded-full px-2 py-[2px] text-[8.5px] uppercase"
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
