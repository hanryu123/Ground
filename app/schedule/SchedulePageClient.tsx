"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { findTeam } from "@/lib/teams";
import { getClubTheme } from "@/lib/clubTheme";
import { Perforation, Stamp, Stub } from "@/components/today/GamePass";
import { useMyTeam } from "@/lib/useMyTeam";
import { starterLabel, type LiveGame } from "@/lib/kbo";
import { venueDisplayLines } from "@/lib/venue";
import {
  KO_DOW,
  longDateLabel,
  monthGrid,
  monthKey,
  monthTitle,
  shiftDate,
  shiftMonth,
  shortDateLabel,
  weekDates,
  weekStart,
} from "@/lib/calendar";
import type { DayGamesPayload, MonthGamesPayload } from "@/lib/schedule";
import type { ScoringEvent } from "@/app/api/kbo/scoring/[gameId]/route";
import LogoImage from "@/components/LogoImage";

function isMyGame(g: LiveGame, teamId: string) {
  return g.homeId === teamId || g.awayId === teamId;
}

// ─── 데이터 캐시 ───────────────────────────────────────────────────────────────

function useGamesData(initialMonth: MonthGamesPayload, initialDay: DayGamesPayload) {
  const [months, setMonths] = useState<Record<string, MonthGamesPayload>>({
    [initialMonth.month]: initialMonth,
  });
  const [days, setDays] = useState<Record<string, DayGamesPayload>>({
    [initialDay.date]: initialDay,
  });
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const inflight = useRef(new Set<string>());

  const load = useCallback(async (kind: "month" | "date", key: string, force = false) => {
    const id = `${kind}:${key}`;
    if (inflight.current.has(id)) return;
    inflight.current.add(id);
    try {
      const r = await fetch(`/api/kbo/games?${kind}=${key}`, {
        cache: force ? "no-store" : "default",
      });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      if (kind === "month") setMonths((m) => ({ ...m, [key]: j as MonthGamesPayload }));
      else setDays((d) => ({ ...d, [key]: j as DayGamesPayload }));
      setFailed((f) => ({ ...f, [id]: false }));
    } catch {
      setFailed((f) => ({ ...f, [id]: true }));
    } finally {
      inflight.current.delete(id);
    }
  }, []);

  const ensureMonth = useCallback(
    (month: string) => {
      if (!months[month]) void load("month", month);
    },
    [months, load]
  );
  const ensureDay = useCallback(
    (date: string) => {
      if (!days[date]) void load("date", date);
    },
    [days, load]
  );

  return { months, days, failed, load, ensureMonth, ensureDay };
}

// ─── 페이지 ─────────────────────────────────────────────────────────────────────

export default function SchedulePageClient({
  today,
  initialMonth,
  initialDay,
}: {
  today: string;
  initialMonth: MonthGamesPayload;
  initialDay: DayGamesPayload;
}) {
  const myTeam = useMyTeam();
  const dotColor = "var(--club-tint)";
  // 우리 팀 경기 카드(구단 색) 위 글자색 — "R G B" 형식으로 --label-rgb 에 넣는다
  const onFieldRgb = getClubTheme(myTeam.id).onField === "#FFFFFF" ? "255 255 255" : "28 28 30";
  const { months, days, failed, load, ensureMonth, ensureDay } = useGamesData(
    initialMonth,
    initialDay
  );

  const [selected, setSelected] = useState(today);
  // 주간 스트립 슬라이드 방향 (+1 다음 주, -1 지난주)
  const [direction, setDirection] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const week = useMemo(() => weekDates(selected), [selected]);
  const selectedMonth = monthKey(selected);

  const goTo = useCallback(
    (date: string) => {
      setDirection(date > selected ? 1 : date < selected ? -1 : 0);
      setSelected(date);
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [selected]
  );

  // 주가 두 달에 걸치면 두 달 다 받아 둬야 점이 다 찍힌다
  useEffect(() => {
    for (const m of new Set([monthKey(week[0]), monthKey(week[6])])) ensureMonth(m);
  }, [week, ensureMonth]);

  useEffect(() => {
    ensureDay(selected);
  }, [selected, ensureDay]);

  // 오늘 화면을 보고 있으면 1분마다 스코어 갱신
  useEffect(() => {
    if (selected !== today) return;
    const t = window.setInterval(() => void load("date", today, true), 60_000);
    return () => window.clearInterval(t);
  }, [selected, today, load]);

  const gamesOn = useCallback(
    (date: string): LiveGame[] | null => {
      const m = months[monthKey(date)];
      return m ? m.games.filter((g) => g.date === date) : null;
    },
    [months]
  );

  const dayGames = useMemo<LiveGame[] | null>(() => {
    const list = days[selected]?.games ?? gamesOn(selected);
    if (!list) return null;
    // 우리 팀 경기를 맨 위로, 나머지는 시간순 그대로
    return [...list].sort(
      (a, b) => Number(isMyGame(b, myTeam.id)) - Number(isMyGame(a, myTeam.id))
    );
  }, [days, selected, gamesOn, myTeam.id]);

  const detailReady = !!days[selected];
  const loadFailed =
    !dayGames && (failed[`month:${selectedMonth}`] || failed[`date:${selected}`]);

  const shiftWeek = useCallback(
    (delta: number) => {
      setDirection(delta);
      setSelected((s) => shiftDate(s, delta * 7));
      scrollRef.current?.scrollTo({ top: 0 });
    },
    []
  );

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
      <section className="pb-nav">
        {/* ── 헤더: "10월 2026 ▾" + TODAY ── */}
        <header className="safe-pt flex items-end justify-between px-5 pb-1">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex items-center gap-1.5 text-label active:opacity-70"
            aria-label="월 달력 열기"
          >
            <span className="text-[34px] font-bold leading-[1.15] tracking-[-0.02em]">
              {monthTitle(selectedMonth)}
            </span>
            <ChevronDown size={22} strokeWidth={2.6} className="text-club-tint" />
          </button>
          <AnimatePresence>
            {selected !== today && (
              <motion.button
                type="button"
                key="today-btn"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                onClick={() => goTo(today)}
                className="mb-1.5 min-h-[34px] rounded-full bg-sys-fill px-3.5 text-[15px] font-semibold text-club-tint active:opacity-60"
              >
                오늘
              </motion.button>
            )}
          </AnimatePresence>
        </header>

        <WeekStrip
          week={week}
          selected={selected}
          today={today}
          direction={direction}
          dotColor={dotColor}
          myTeamId={myTeam.id}
          gamesOn={gamesOn}
          onSelect={goTo}
          onShiftWeek={shiftWeek}
        />

        {/* ── 고른 날 ── */}
        <div className="px-5 pt-6">
          <div className="mb-3 flex items-baseline justify-between px-1">
            <h2 className="text-[20px] font-bold tracking-[-0.02em] text-label">
              {longDateLabel(selected)}
            </h2>
            {dayGames && dayGames.length > 0 && (
              <span className="text-[13px] text-sys-label2">
                {dayGames.length}경기
              </span>
            )}
          </div>

          {dayGames === null ? (
            loadFailed ? (
              <EmptyCard
                title="일정을 못 불러왔어요"
                body="잠깐 뒤에 다시 해 볼게요."
                action={{
                  label: "다시 불러오기",
                  onClick: () => {
                    void load("month", selectedMonth, true);
                    void load("date", selected, true);
                  },
                }}
              />
            ) : (
              <LoadingCards />
            )
          ) : dayGames.length === 0 ? (
            <EmptyDay
              date={selected}
              today={today}
              month={months[selectedMonth] ?? null}
              onGo={goTo}
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {dayGames.map((g) => (
                <GameRow
                  key={g.id}
                  game={g}
                  mine={isMyGame(g, myTeam.id)}
                  myTeamId={myTeam.id}
                  mineColor={onFieldRgb}
                  muted={selected < today}
                  detailReady={detailReady}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <MonthSheet
        open={sheetOpen}
        selected={selected}
        today={today}
        dotColor={dotColor}
        myTeamId={myTeam.id}
        months={months}
        ensureMonth={ensureMonth}
        onClose={() => setSheetOpen(false)}
        onPick={(d) => {
          setSheetOpen(false);
          goTo(d);
        }}
      />
    </div>
  );
}

// ─── 주간 스트립 ───────────────────────────────────────────────────────────────

const stripVariants = {
  enter: (dir: number) => ({ x: dir === 0 ? 0 : dir > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir === 0 ? 0 : dir > 0 ? "-100%" : "100%", opacity: 0 }),
};

function WeekStrip({
  week,
  selected,
  today,
  direction,
  dotColor,
  myTeamId,
  gamesOn,
  onSelect,
  onShiftWeek,
}: {
  week: string[];
  selected: string;
  today: string;
  direction: number;
  dotColor: string;
  myTeamId: string;
  gamesOn: (date: string) => LiveGame[] | null;
  onSelect: (date: string) => void;
  onShiftWeek: (delta: number) => void;
}) {
  const dragged = useRef(false);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.x < -40 || velocity.x < -400) onShiftWeek(1);
    else if (offset.x > 40 || velocity.x > 400) onShiftWeek(-1);
  };

  return (
    <div className="relative mt-5 overflow-hidden px-3">
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.div
          key={weekStart(selected)}
          custom={direction}
          variants={stripVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.35}
          dragDirectionLock
          onDragStart={() => {
            dragged.current = true;
          }}
          onDragEnd={(e, info) => {
            onDragEnd(e, info);
            // 드래그 직후 손을 뗀 자리의 날짜가 눌리지 않게
            window.setTimeout(() => {
              dragged.current = false;
            }, 0);
          }}
          className="grid touch-pan-y grid-cols-7"
        >
          {week.map((d) => {
            const games = gamesOn(d);
            const hasGames = !!games && games.length > 0;
            const mine = !!games?.some((g) => isMyGame(g, myTeamId));
            const isSel = d === selected;
            const isToday = d === today;
            const dow = new Date(d + "T00:00:00Z").getUTCDay();
            return (
              <button
                key={d}
                type="button"
                onClick={() => {
                  if (!dragged.current) onSelect(d);
                }}
                className="flex flex-col items-center gap-1.5 py-1"
                aria-label={`${longDateLabel(d)}${mine ? ", 우리 팀 경기" : ""}`}
                aria-pressed={isSel}
              >
                <span
                  className={`text-[10px] ${isSel ? "text-label" : "text-label/45"}`}
                  style={{ fontWeight: 700 }}
                >
                  {KO_DOW[dow]}
                </span>
                <span
                  className={[
                    "flex h-9 w-9 items-center justify-center rounded-full text-[15px] tabular-nums transition-colors",
                    isSel
                      ? "bg-label text-sys-bg"
                      : isToday
                        ? "border border-label/50 text-label"
                        : hasGames || games === null
                          ? "text-label/85"
                          : "text-label/30",
                  ].join(" ")}
                  style={{ fontWeight: isSel || isToday ? 900 : 700 }}
                >
                  {Number(d.slice(8, 10))}
                </span>
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    backgroundColor: mine ? dotColor : "transparent",
                  }}
                />
              </button>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── 월 달력 바텀시트 ──────────────────────────────────────────────────────────

function MonthSheet({
  open,
  selected,
  today,
  dotColor,
  myTeamId,
  months,
  ensureMonth,
  onClose,
  onPick,
}: {
  open: boolean;
  selected: string;
  today: string;
  dotColor: string;
  myTeamId: string;
  months: Record<string, MonthGamesPayload>;
  ensureMonth: (month: string) => void;
  onClose: () => void;
  onPick: (date: string) => void;
}) {
  const [month, setMonth] = useState(monthKey(selected));

  // 열 때마다 지금 보고 있는 달부터
  useEffect(() => {
    if (open) setMonth(monthKey(selected));
  }, [open, selected]);

  useEffect(() => {
    if (open) ensureMonth(month);
  }, [open, month, ensureMonth]);

  const data = months[month];
  const grid = useMemo(() => monthGrid(month), [month]);
  const byDate = useMemo(() => {
    const map = new Map<string, { any: boolean; mine: boolean }>();
    for (const g of data?.games ?? []) {
      const cur = map.get(g.date) ?? { any: false, mine: false };
      cur.any = true;
      if (isMyGame(g, myTeamId)) cur.mine = true;
      map.set(g.date, cur);
    }
    return map;
  }, [data, myTeamId]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="sheet-backdrop"
            className="fixed inset-0 z-[60] bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-label="월 달력"
            className="fixed inset-x-0 bottom-0 z-[61] rounded-t-3xl border-t border-label/10 bg-sys-card px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-3"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 500) onClose();
            }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-label/20" />
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMonth((m) => shiftMonth(m, -1))}
                className="flex h-9 w-9 items-center justify-center rounded-full text-label/70 active:bg-label/10"
                aria-label="지난달"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="text-[17px] text-label" style={{ fontWeight: 900 }}>
                {monthTitle(month)}
              </span>
              <button
                type="button"
                onClick={() => setMonth((m) => shiftMonth(m, 1))}
                className="flex h-9 w-9 items-center justify-center rounded-full text-label/70 active:bg-label/10"
                aria-label="다음 달"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="grid grid-cols-7 pb-1">
              {KO_DOW.map((d) => (
                <span
                  key={d}
                  className="text-center text-[10px] text-label/40"
                  style={{ fontWeight: 700 }}
                >
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-1">
              {grid.map((d) => {
                const inMonth = d.startsWith(month);
                const info = byDate.get(d);
                const isSel = d === selected;
                const isToday = d === today;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onPick(d)}
                    className="flex flex-col items-center gap-1 py-1"
                    aria-label={longDateLabel(d)}
                  >
                    <span
                      className={[
                        "flex h-9 w-9 items-center justify-center rounded-full text-[14px] tabular-nums",
                        isSel
                          ? "bg-label text-sys-bg"
                          : isToday
                            ? "border border-label/50 text-label"
                            : !inMonth
                              ? "text-label/15"
                              : info?.any || !data
                                ? "text-label/85"
                                : "text-label/30",
                      ].join(" ")}
                      style={{ fontWeight: isSel || isToday ? 900 : 700 }}
                    >
                      {Number(d.slice(8, 10))}
                    </span>
                    <span
                      className="h-1 w-1 rounded-full"
                      style={{
                        backgroundColor: inMonth && info?.mine ? dotColor : "transparent",
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── 빈 날 ─────────────────────────────────────────────────────────────────────

function nearestGameDate(dates: string[], date: string): string | null {
  let best: string | null = null;
  let bestDiff = Infinity;
  const t = Date.parse(date);
  for (const d of dates) {
    const diff = Math.abs(Date.parse(d) - t);
    // 같은 거리면 앞으로 올 경기를 고른다
    if (diff < bestDiff || (diff === bestDiff && d > date)) {
      best = d;
      bestDiff = diff;
    }
  }
  return best;
}

function EmptyDay({
  date,
  today,
  month,
  onGo,
}: {
  date: string;
  today: string;
  month: MonthGamesPayload | null;
  onGo: (date: string) => void;
}) {
  const dates = month?.seasonDates ?? [];
  const year = Number(date.slice(0, 4));
  const first = dates[0];
  const last = dates[dates.length - 1];

  // 그 해 일정이 아예 없음 (다음 시즌 일정 미발표)
  if (dates.length === 0) {
    const prev = month?.prevSeasonLastDate;
    return (
      <EmptyCard
        title="아직 시즌 전이에요"
        body={`${year} 시즌 일정은 아직 안 나왔어요. 개막일이 발표되면 여기서 바로 볼 수 있어요.`}
        action={
          prev ? { label: `지난 시즌 마지막 경기 · ${shortDateLabel(prev)}`, onClick: () => onGo(prev) } : undefined
        }
      />
    );
  }

  // 그 해 마지막 경기 이후 + 시즌 종료 → 비시즌
  if (date > last && month?.seasonOver) {
    const isCurrentOrFuture = year >= Number(today.slice(0, 4));
    return (
      <EmptyCard
        title="시즌이 끝났어요"
        body={
          isCurrentOrFuture
            ? `${year + 1} 시즌 개막일은 아직 발표 전이에요. 일정이 나오면 여기서 바로 볼 수 있어요.`
            : `${year} 시즌 경기는 여기까지예요.`
        }
        action={{ label: `마지막 경기 보기 · ${shortDateLabel(last)}`, onClick: () => onGo(last) }}
      />
    );
  }

  // 그 해 첫 경기 전
  if (date < first) {
    return (
      <EmptyCard
        title="아직 시즌 전이에요"
        body={`${year} 시즌 첫 경기는 ${shortDateLabel(first)}이에요.`}
        action={{ label: `첫 경기 보기 · ${shortDateLabel(first)}`, onClick: () => onGo(first) }}
      />
    );
  }

  const near = nearestGameDate(dates, date);
  return (
    <EmptyCard
      title="경기 없는 날"
      body={
        date > last
          ? "다음 경기 일정은 정해지는 대로 올라와요."
          : "쉬어 가는 날이에요."
      }
      action={
        near ? { label: `가까운 경기일로 · ${shortDateLabel(near)}`, onClick: () => onGo(near) } : undefined
      }
    />
  );
}

function EmptyCard({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-[14px] bg-sys-card px-6 py-10 text-center">
      <p className="text-[17px] text-label" style={{ fontWeight: 900 }}>
        {title}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-sys-label2">
        {body}
      </p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-5 min-h-[44px] rounded-full bg-sys-fill px-5 text-[15px] font-semibold text-club-tint active:opacity-60"
          style={{ fontWeight: 700 }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function LoadingCards() {
  return (
    <ul className="flex flex-col gap-3" aria-busy>
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="h-[112px] animate-pulse rounded-[14px] bg-sys-card"
        />
      ))}
    </ul>
  );
}

// ─── 경기 카드 ─────────────────────────────────────────────────────────────────

function GameRow({
  game,
  mine,
  myTeamId,
  mineColor,
  muted,
  detailReady,
}: {
  game: LiveGame;
  mine: boolean;
  myTeamId: string;
  mineColor: string;
  muted?: boolean;
  /** 선발·구장·승패 투수 상세가 도착했는지 (아직이면 그 줄을 비워 둔다) */
  detailReady: boolean;
}) {
  const home = findTeam(game.homeId);
  const away = findTeam(game.awayId);
  const result = game.result;
  const liveStatus = game.status;
  const liveScore = game.liveScore;

  const [expanded, setExpanded] = useState(false);
  const [scoring, setScoring] = useState<ScoringEvent[] | null>(null);
  const [loadingScoring, setLoadingScoring] = useState(false);

  const isResult = liveStatus === "RESULT";
  const isLive = liveStatus === "LIVE";
  const isCancel = liveStatus === "CANCEL";

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

  const text = muted ? "text-label/70" : "text-label";
  const awayWon = result?.winnerId === away.id;
  const homeWon = result?.winnerId === home.id;
  const draw = !!result && result.winnerId === null;

  // 편파 원칙 — 우리 팀은 져도 흐리게 하지 않는다 (결과는 도장이 말한다)
  const teamColor = (won: boolean, teamId?: string) =>
    mine && teamId === myTeamId ? "text-label" : result ? (won ? "text-label" : "text-label/40") : text;
  const myOutcome = mine && result ? (result.winnerId == null ? "무" : result.winnerId === myTeamId ? "승" : "패") : null;

  const venue = venueDisplayLines(game.stadium);

  const liveColor = (mineScore: number, other: number) =>
    mineScore > other ? "text-label" : mineScore < other ? "text-label/50" : "text-label/75";

  const pitcherLine = !detailReady ? null : result ? (
    draw ? (
      <>무승부</>
    ) : (
      <>
        <span className="text-label/50" style={{ fontWeight: 600 }}>승 </span>
        {result.winningPitcher ?? "—"}
        <span className="mx-1.5 text-label/20">·</span>
        <span className="text-label/50" style={{ fontWeight: 600 }}>패 </span>
        {result.losingPitcher ?? "—"}
      </>
    )
  ) : isCancel ? (
    <>{game.cancelReason === "RAIN" ? "비 때문에 취소됐어요" : "취소된 경기예요"}</>
  ) : (
    <>
      <span className="text-label/50" style={{ fontWeight: 600 }}>선발 </span>
      {starterLabel(game.awayPitcher)}
      <span className="mx-1.5 text-label/20">vs</span>
      {starterLabel(game.homePitcher)}
    </>
  );

  return (
    <li
      className={[
        mine ? "mb-2 text-club-on" : "rounded-[14px] bg-sys-card",
        isResult ? "cursor-pointer select-none active:scale-[0.99] transition-transform duration-100" : "",
      ].join(" ")}
      // 우리 팀 경기는 구단 색 티켓 — 안의 text-label 이 구단 색 위 글자색이 되게 바꿔 끼운다
      style={mine ? ({ "--label-rgb": mineColor, "--label-2": `rgb(${mineColor} / 0.75)` } as React.CSSProperties) : undefined}
      onClick={isResult ? handleExpand : undefined}
    >
      {/* 우리 팀 경기는 TODAY 티켓과 같은 몸체 — 위(구단 색) · 절취선 · 점수를 담은 반쪽 */}
      <div className={mine ? "rounded-t-[18px] bg-club-field" : ""}>
      <div className="p-4">
        {/* ── 메타 행: 시간·상태 · 구장 | 별 ── */}
        <div className="flex items-center gap-2">
          {isLive ? (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-bold"
              style={{ color: mine ? "rgb(var(--label-rgb))" : "var(--loss)", background: "rgb(var(--label-rgb) / 0.08)" }}
            >
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              경기 중
            </span>
          ) : result ? (
            <ResultBadge winnerSide={awayWon ? "away" : homeWon ? "home" : "draw"} />
          ) : isCancel ? (
            <span
              className="rounded-full px-2 py-0.5 text-[12px] font-bold"
              style={{ color: "var(--label-2)", background: "rgb(var(--label-rgb) / 0.08)" }}
            >
              취소
            </span>
          ) : (
            <span className={`font-num text-[19px] font-semibold leading-none ${text}`}>
              {game.time}
            </span>
          )}
          {venue.primary && (
            <span className="min-w-0 truncate text-[13px] text-sys-label2">
              {venue.primary}
            </span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            {isResult && (
              <span
                style={{ color: "rgb(var(--label-rgb) / 0.3)", transition: "transform 0.2s", display: "inline-block", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                <ChevronDown size={13} strokeWidth={2} />
              </span>
            )}
          </span>
        </div>

        {/* ── 매치업: 원정 로고·이름 | 스코어 | 홈 이름·로고 ── */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <LogoImage teamId={away.id} alt={away.name} size={32} className="shrink-0 object-contain" />
            <span
              className={`min-w-0 truncate text-[18px] leading-none tracking-tight ${teamColor(awayWon, away.id)}`}
              style={{ fontWeight: 900 }}
            >
              {away.short}
            </span>
          </div>

          {result && !mine ? (
            <span className="shrink-0 min-w-[64px] text-center font-num text-[28px] font-bold leading-none">
              <span className={awayWon || (mine && away.id === myTeamId) ? "text-label" : "text-label/50"}>{result.awayScore}</span>
              <span className="mx-1.5 text-[18px] text-label/40">{draw ? "무" : ":"}</span>
              <span className={homeWon || (mine && home.id === myTeamId) ? "text-label" : "text-label/50"}>{result.homeScore}</span>
            </span>
          ) : isLive && liveScore && !mine ? (
            <span className="shrink-0 min-w-[64px] text-center font-num text-[28px] font-bold leading-none">
              <span className={liveColor(liveScore.awayScore, liveScore.homeScore)}>{liveScore.awayScore}</span>
              <span className="mx-1.5 text-[18px] text-label/40">:</span>
              <span className={liveColor(liveScore.homeScore, liveScore.awayScore)}>{liveScore.homeScore}</span>
            </span>
          ) : (
            <span className="shrink-0 min-w-[40px] text-center text-[13px] text-sys-label2">
              vs
            </span>
          )}

          <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
            <span
              className={`min-w-0 truncate text-right text-[18px] leading-none tracking-tight ${teamColor(homeWon, home.id)}`}
              style={{ fontWeight: 900 }}
            >
              {home.short}
            </span>
            <LogoImage teamId={home.id} alt={home.name} size={32} className="shrink-0 object-contain" />
          </div>
        </div>

        {/* ── 선발 / 승패 투수 + HIGHLIGHT ── */}
        <div className="mt-3 flex min-h-[14px] items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[13px] leading-tight text-label/70">
            {pitcherLine}
          </p>
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
      </div>
      {mine ? (
        <>
          <Perforation />
          <Stub torn={isResult || isCancel}>
            {result ? (
              <span className="font-num text-[34px] font-bold leading-none">
                {result.awayScore}
                <span className="mx-1.5 text-[22px] opacity-60">:</span>
                {result.homeScore}
              </span>
            ) : isLive && liveScore ? (
              <span className="font-num text-[34px] font-bold leading-none">
                {liveScore.awayScore}
                <span className="mx-1.5 text-[22px] opacity-60">:</span>
                {liveScore.homeScore}
              </span>
            ) : isCancel ? (
              <span className="text-[17px] font-bold">{game.cancelReason === "RAIN" ? "우천 취소" : "경기 취소"}</span>
            ) : (
              <span className="font-num text-[34px] font-bold leading-none">{game.time}</span>
            )}
            {myOutcome ? <Stamp label={myOutcome} /> : isLive ? <span className="text-[15px] font-bold">{liveScore?.inningLabel ?? "경기 중"}</span> : null}
          </Stub>
        </>
      ) : null}
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
      style={{ background: "rgb(var(--label-rgb) / 0.04)", border: "1px solid rgb(var(--label-rgb) / 0.08)" }}
    >
      {/* 헤더 */}
      <div
        className="px-3 py-2 text-[13px] font-semibold text-sys-label2"
        style={{ fontWeight: 700, borderBottom: "1px solid rgb(var(--label-rgb) / 0.06)" }}
      >
        득점 정보
      </div>

      {/* 내용 */}
      {loading ? (
        <div className="px-3 py-5 text-center">
          <span className="text-[13px] text-sys-label2">불러오는 중</span>
        </div>
      ) : !events || events.length === 0 ? (
        <div className="px-3 py-5 text-center">
          <span className="text-[13px] text-sys-label2">상세 기록 없음</span>
        </div>
      ) : (
        <ul className="py-1">
          {events.map((ev, i) => {
            const isAway = ev.teamId === awayId;
            const teamName = isAway ? awayTeam : homeTeam;
            const inningLabel = `${ev.inning}회${ev.half === "top" ? "초" : "말"}`;
            const scoreLabel = `${ev.awayScore}:${ev.homeScore}`;
            const details = ev.details ?? [];

            return (
              <li
                key={i}
                className="px-3 py-[8px]"
                style={{
                  borderTop: i > 0 ? "1px solid rgb(var(--label-rgb) / 0.04)" : undefined,
                }}
              >
                <div className="flex items-start gap-2">
                  {/* 이닝 */}
                  <span
                    className="w-[38px] shrink-0 pt-[1px] text-[10px] tabular-nums text-label/35"
                    style={{ fontWeight: 600 }}
                  >
                    {inningLabel}
                  </span>

                  {/* 팀 */}
                  <span
                    className="w-[28px] shrink-0 pt-[1px] text-[11px] text-label/60"
                    style={{ fontWeight: 700 }}
                  >
                    {teamName}
                  </span>

                  {/* 선수 + 설명 */}
                  <div className="min-w-0 flex-1">
                    <p className="min-w-0 text-[11px] leading-snug text-label/80" style={{ fontWeight: 600 }}>
                      {ev.player ? (
                        <>
                          <span className="text-label/95" style={{ fontWeight: 800 }}>{ev.player}</span>
                          <span className="mx-1 text-label/40">·</span>
                          {ev.description}
                        </>
                      ) : (
                        ev.description
                      )}
                    </p>
                    {details.length > 1 && (
                      <ul className="mt-1 space-y-0.5">
                        {details.slice(0, 4).map((detail, detailIndex) => (
                          <li
                            key={`${detail.player ?? "run"}-${detail.description}-${detailIndex}`}
                            className="min-w-0 truncate text-[10px] leading-snug text-label/40"
                            style={{ fontWeight: 500 }}
                          >
                            <span className="mr-1 text-label/20">·</span>
                            {detail.player && (
                              <span className="text-label/60" style={{ fontWeight: 700 }}>{detail.player} </span>
                            )}
                            {detail.description}
                            {detail.runs && detail.runs > 1 ? (
                              <span className="text-label/30"> ({detail.runs}점)</span>
                            ) : null}
                          </li>
                        ))}
                        {details.length > 4 && (
                          <li className="text-[10px] leading-snug text-label/25">
                            +{details.length - 4}개 장면
                          </li>
                        )}
                      </ul>
                    )}
                  </div>

                  {/* 누적 스코어 */}
                  <span
                    className="shrink-0 pt-[1px] tabular-nums text-[11px] text-label/40"
                    style={{ fontWeight: 700 }}
                    aria-label={`누적 스코어 ${scoreLabel}`}
                  >
                    {isAway ? (
                      <>
                        <span className="text-label/65">{ev.awayScore}</span>
                        <span className="mx-0.5 text-label/25">:</span>
                        {ev.homeScore}
                      </>
                    ) : (
                      <>
                        {ev.awayScore}
                        <span className="mx-0.5 text-label/25">:</span>
                        <span className="text-label/65">{ev.homeScore}</span>
                      </>
                    )}
                  </span>
                </div>
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
  const label = winnerSide === "draw" ? "무승부" : "종료";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[12px] font-bold"
      style={{ color: "var(--label-2)", background: "rgb(var(--label-rgb) / 0.08)" }}
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
        "min-h-[32px] text-[13px] font-semibold",
        "transition-colors duration-200 ease-out",
        "focus-visible:rounded-sm focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-label/25",
        muted ? "text-label/40 hover:text-label" : "text-label/50 hover:text-label",
      ].join(" ")}
    >
      <Play
        size={13}
        strokeWidth={2}
        className="shrink-0 opacity-90"
        aria-hidden
      />
      <span>하이라이트</span>
    </a>
  );
}
