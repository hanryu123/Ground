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
import { useKboSchedule } from "@/lib/useKboSchedule";
import { starterLabel, type LiveGame } from "@/lib/kbo";

type Section = {
  /** 정렬용 ISO 날짜 */
  date: string;
  /** 화면 라벨 (예: "4월 18일 · 금") */
  dateLabel: string;
  /** 상단 작은 뱃지 (PAST / TODAY / TOMORROW) */
  badge: "PAST" | "TODAY" | "TOMORROW";
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

export default function SchedulePage() {
  const todayRef = useRef<HTMLDivElement | null>(null);
  // 라이브 도착 후 한 번만 anchor 재조정. 5분 폴링마다 점프하면 사용자 스크롤 위치가 박살남.
  const didLiveScrollRef = useRef(false);

  // ── 라이브 KBO 데이터 (5분 폴링, 실패 시 정적 폴백) ──
  const live = useKboSchedule();

  // 라이브 데이터가 도착하면 그것을, 아니면 정적 mock 으로 빌드.
  // 두 경로 모두 같은 Section 구조 → 아래 렌더 코드는 단일 경로 유지.
  const sections = useMemo<Section[]>(() => {
    const sourcePast: (Game | LiveGame)[] = live?.past ?? PAST_GAMES;
    const sourceToday: (Game | LiveGame)[] = live?.today ?? TODAY_GAMES;
    const sourceTomorrow: (Game | LiveGame)[] = live?.tomorrow ?? TOMORROW_GAMES;

    const past = groupByDate(sourcePast).map(
      ({ date, games }): Section => ({
        date,
        dateLabel: formatDateLabel(date),
        badge: "PAST",
        tone: "past",
        games,
      })
    );

    // today / tomorrow 도 날짜별 그룹핑(다일치 라이브 fetch 대비) — 보통은 1그룹.
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
    // 라이브 응답의 base 날짜를 그대로 라벨링 → "오늘 경기 없음" 메시지가 정확한 날짜로 노출.
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

    return [...past, ...todaySections, ...tomorrowSections];
  }, [live]);

  // 페이지(window) 스크롤을 TODAY 섹션 상단으로 점프.
  // 1) mount 시 static 데이터 기준으로 한 번 (대략적 위치 잡기 — UX 깜빡임 최소화)
  // 2) 라이브 데이터가 처음 도착했을 때 한 번 더 (실제 today 날짜로 보정).
  //    이걸 안 하면 콘텐츠가 reflow 되면서 viewport 가 미래(TOMORROW) 쪽으로 흘러내림.
  useEffect(() => {
    const target = todayRef.current;
    if (!target) return;
    const top = target.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (didLiveScrollRef.current) return;
    if (!live) return;
    // sections 는 useMemo([live]) 로 동기 갱신됨 → 다음 paint 직전에 위치 측정.
    const raf = requestAnimationFrame(() => {
      const target = todayRef.current;
      if (!target) return;
      const top = target.getBoundingClientRect().top + window.scrollY - 12;
      window.scrollTo({ top, behavior: "auto" });
      didLiveScrollRef.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [live]);

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

function GameRow({
  game,
  muted,
}: {
  game: Game | LiveGame;
  muted?: boolean;
}) {
  const home = findTeam(game.homeId);
  const away = findTeam(game.awayId);
  const result = game.result;
  const liveStatus = (game as LiveGame).status;

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
              <span className="text-white/40" style={{ fontWeight: 600 }}>
                선발
              </span>{" "}
              {starterLabel(game.awayPitcher)}
              <span className="mx-1.5 text-white/20">vs</span>
              {starterLabel(game.homePitcher)}
            </>
          )}
        </p>
      </div>

      {/* LIVE 뱃지 — 라이브 데이터에 status=LIVE 인 경기에만 노출 */}
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
