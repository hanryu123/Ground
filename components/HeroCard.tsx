"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudRain } from "lucide-react";
import { findTeam, type Team } from "@/lib/teams";
import { TODAY_GAMES } from "@/lib/games";
import { pickSlogan, splitSloganForDisplay } from "@/config/teams";
import NotificationBell from "@/components/NotificationBell";
import ShareButton from "@/components/ShareButton";
import { useWeather, type WeatherInfo } from "@/lib/useWeather";
import { posterCandidates, POSTER_FINAL_FALLBACK } from "@/lib/posterImage";
import { useTodaySlot } from "@/lib/useTodaySlot";
import { isTeamWinnerToday } from "@/config/todayGames";
import { useKboToday } from "@/lib/useKboToday";
import { getTeamGame, starterLabel, type LiveGame } from "@/lib/kbo";

const ease = [0.22, 1, 0.36, 1] as const;

type Props = {
  team: Team;
};

function getTodayMatch(team: Team, liveGames?: LiveGame[] | null) {
  // 1순위: 라이브 KBO 데이터에 오늘 경기가 있으면 그쪽 사용 (점수/상태 포함)
  // 2순위: 정적 더미 TODAY_GAMES 폴백 (시즌 데이터 부재 시)
  const liveGame =
    liveGames?.find((g) => g.awayId === team.id || g.homeId === team.id) ?? null;
  const game = liveGame ?? TODAY_GAMES.find(
    (g) => g.awayId === team.id || g.homeId === team.id
  );
  if (!game) return null;
  const isHome = game.homeId === team.id;
  const homeTeam = findTeam(game.homeId);
  const awayTeam = findTeam(game.awayId);
  const opponent = isHome ? awayTeam : homeTeam;
  return { game, homeTeam, awayTeam, opponent, isHome, isLive: Boolean(liveGame) };
}

/** OpenWeather condition(영문 main) → 짧은 한글 라벨 */
const KO_WEATHER: Record<string, string> = {
  Clear: "맑음",
  Clouds: "흐림",
  Rain: "비",
  Drizzle: "이슬비",
  Thunderstorm: "뇌우",
  Snow: "눈",
  Mist: "안개",
  Fog: "안개",
  Haze: "안개",
  Smoke: "연무",
  Dust: "황사",
  Sand: "모래",
  Squall: "돌풍",
  Tornado: "토네이도",
};

function formatWeather(w: WeatherInfo): string | null {
  if (w.loading) return null;
  if (!w.condition || w.condition === "Unknown") return null;
  const label = KO_WEATHER[w.condition] ?? w.condition;
  if (typeof w.temp === "number") return `${label} ${Math.round(w.temp)}°`;
  return label;
}

/** 풀네임 구장명에서 첫 어절(도시/지역)만 추출. 예: "수원 KT 위즈 파크" → "수원" */
function shortStadium(name: string | undefined | null): string {
  if (!name) return "";
  const head = name.trim().split(/\s+/)[0];
  return head ?? "";
}

const KO_DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-04-19" → "4월 19일 · 일" (UTC 기준 — 시간대 영향 X) */
function formatMatchDate(iso: string | undefined | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const dow = KO_DOW[d.getUTCDay()];
  return `${month}월 ${day}일 · ${dow}`;
}

/** sessionStorage 키 — (candidates 동일하면 재방문 시 즉시 hit) */
const POSTER_CACHE_KEY = "ground-poster-resolved";
type PosterCache = Record<string, string>;

function readPosterCache(): PosterCache {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(POSTER_CACHE_KEY);
    return raw ? (JSON.parse(raw) as PosterCache) : {};
  } catch {
    return {};
  }
}

function writePosterCache(cacheKey: string, src: string): void {
  if (typeof window === "undefined") return;
  try {
    const next = { ...readPosterCache(), [cacheKey]: src };
    sessionStorage.setItem(POSTER_CACHE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export default function HeroCard({ team }: Props) {
  // ── 라이브 KBO 데이터 (60s 폴링, 실패 시 폴백) ──
  const live = useKboToday();
  const match = useMemo(
    () => getTodayMatch(team, live?.games),
    [team, live?.games]
  );
  // 라이브 view — 점수/상태/승리 정보 추출용
  const liveView = useMemo(
    () => (live ? getTeamGame(live.games, team.id) : null),
    [live, team.id]
  );
  // (구) "현재 N위" 배지는 /rank 탭으로 이전되어 HeroCard 에서는 더 이상 표기 X.

  // ── 날씨 — 구장 좌표 기반 ──
  const weather = useWeather(match?.game.stadium);
  const isRainy = weather.isRainy;
  const weatherLabel = formatWeather(weather);

  // ── 시간대 + 승패 기반 정적 화보 후보 체인 (zero-latency) ──
  //  기본(시간 무관)               → /images/refs/ready/${teamId}.{ext}
  //                                   → 없으면 ready 풀에서 teamId 해시로 결정론적 픽
  //  Night(22:00~05:59) + 승리만   → /images/refs/victory/${teamId}.jpg → 공용 풀
  const slot = useTodaySlot();
  // 라이브 승리 정보가 있으면 1순위, 없으면 정적 폴백
  const isWinner = liveView?.isWinner ?? isTeamWinnerToday(team.id);
  const dateKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const candidates = useMemo(
    () => posterCandidates({ teamId: team.id, slot, isWinner, dateKey }),
    [team.id, slot, isWinner, dateKey]
  );

  // ── 화보 src 사전 해석 (브라우저 broken-image 깜빡임 방지) ──
  // 후보 체인을 JS Image 로 백그라운드 프로빙 → 첫 200 OK 만 DOM 에 마운트.
  // 이렇게 하면 Image 컴포넌트가 404 를 만나서 깜빡이는 일이 절대 없다.
  const cacheKey = candidates.join("|");
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    // 마운트 시 캐시 hit이면 즉시 결정 → 첫 페인트부터 정상 렌더
    if (typeof window === "undefined") return null;
    const cached = readPosterCache()[cacheKey];
    return cached && candidates.includes(cached) ? cached : null;
  });

  useEffect(() => {
    let cancelled = false;

    // 캐시 hit 체크 (effect 진입 시점에 다시 한 번)
    const cachedNow = readPosterCache()[cacheKey];
    if (cachedNow && candidates.includes(cachedNow)) {
      setResolvedSrc(cachedNow);
      return;
    }

    setResolvedSrc(null); // 후보 변경 → 일단 검정 배경 유지

    (async () => {
      for (const src of candidates) {
        const ok = await new Promise<boolean>((resolve) => {
          const img = new window.Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = src;
        });
        if (cancelled) return;
        if (ok) {
          writePosterCache(cacheKey, src);
          setResolvedSrc(src);
          return;
        }
      }
      if (!cancelled) {
        // 모든 후보가 실패해도 최종 안전망(POSTER_FINAL_FALLBACK)은 ready 풀의 실재 파일.
        // 만에 하나 그것마저 사라졌다면 그냥 검정 배경으로 떨어진다(깨짐 X).
        console.error(
          `[HeroCard] all poster candidates failed for teamId="${team.id}".\n` +
            candidates.map((c) => `  - ${c}`).join("\n")
        );
        setResolvedSrc(POSTER_FINAL_FALLBACK);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [candidates, cacheKey, team.id]);

  // ── 슬로건 — 우천이면 sloganRainy 우선, 아니면 sloganReady ──
  const sloganText =
    pickSlogan(team.id, "ready", isRainy) ?? team.manifestoEn;
  const lines = splitSloganForDisplay(sloganText);

  const stadiumShort = shortStadium(match?.game.stadium);
  const dateLabel = formatMatchDate(match?.game.date);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      {/*
        배경 — 정적 화보 (zero-latency).
        team / 슬롯(06↔22 경계) / 승패 변화로 src가 바뀌면
        AnimatePresence 의 default(sync) 모드가 0.8s 부드러운 cross-fade를 수행.
        같은 src일 땐 키가 안정되어 깜빡임 없음.
      */}
      <AnimatePresence initial={false}>
        {resolvedSrc && (
          <motion.div
            key={resolvedSrc}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease }}
            className="absolute inset-0"
          >
            <Image
              src={resolvedSrc}
              alt={team.nameEn}
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/*
        텍스트/하단 UI 가독성 확보용 — 아주 얇은 검정 그라데이션 한 장.
        상/하단만 어둡게 떨어뜨려 중앙 슬로건과 하단 매치업이 떠 보이게 한다.
      */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 28%, transparent 62%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      {/*
        ── 좌상단: MY CTA ──
        기존 구단 로고 자리를 응원팀 칩 + "MY" 라벨로 대체.
        탭하면 /my 로 이동 (BottomNav 의 MY 와 동일 동작 — 이번 라운드에서
        BottomNav 의 MY 가 RANK 로 빠지면서 응원팀 변경 진입점이 사라지는 걸
        상단 CTA 가 흡수한다).
      */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease, delay: 0.15 }}
        className="absolute left-5 top-5 z-30"
      >
        <Link
          href="/my"
          aria-label="응원팀 변경"
          className="flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-2.5 py-1.5 backdrop-blur-md transition active:scale-95"
          style={{
            boxShadow:
              "0 2px 8px rgba(0,0,0,0.35), inset 0 0 0 0.5px rgba(255,255,255,0.04)",
          }}
        >
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] tabular-nums"
            style={{
              backgroundColor: team.accent,
              color: "#fff",
              fontWeight: 900,
              letterSpacing: "-0.03em",
              boxShadow: `0 0 6px ${team.accent}88`,
            }}
          >
            {team.short}
          </span>
          <span
            className="text-[10px] uppercase tracking-[0.28em] text-white/85"
            style={{ fontWeight: 700 }}
          >
            MY
          </span>
        </Link>
      </motion.div>

      {/* ── 우상단: 공유 (벨 옆에 살짝 왼쪽) ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease, delay: 0.18 }}
        className="absolute right-[60px] top-5 z-30"
      >
        <ShareButton
          title="KBO TODAY"
          text={
            match
              ? `${match.awayTeam.short} vs ${match.homeTeam.short} — ${formatMatchDate(match.game.date)}`
              : `${team.short} — ${team.nameEn}`
          }
        />
      </motion.div>

      {/* ── 우상단: 알림 종 ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease, delay: 0.2 }}
      >
        <NotificationBell accent={team.accent} />
      </motion.div>

      {/* ── 중앙: 슬로건 ── */}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-7">
        <motion.h1
          key={team.id + "-" + sloganText}
          initial={{ opacity: 0, y: -4, letterSpacing: "0.55em" }}
          animate={{ opacity: 1, y: 0, letterSpacing: "0.42em" }}
          transition={{ duration: 1.2, ease, delay: 0.25 }}
          className="text-center text-white"
          style={{
            fontFamily:
              '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
            fontWeight: 300,
            fontSize: "clamp(15px, 4.4vw, 23px)",
            lineHeight: 1.5,
            letterSpacing: "0.42em",
            textShadow: isRainy
              ? "0 1px 6px rgba(0,0,0,0.7), 0 0 14px rgba(140,180,220,0.45), 0 0 32px rgba(80,120,170,0.35), 0 0 3px rgba(0,0,0,0.55)"
              : "0 1px 6px rgba(0,0,0,0.55), 0 0 24px rgba(0,0,0,0.35)",
            filter: isRainy ? "blur(0.25px)" : undefined,
            textTransform: "uppercase",
            color: isRainy ? "rgba(232,240,250,0.92)" : "rgba(255,255,255,0.95)",
          }}
        >
          {lines.join("  ·  ")}
        </motion.h1>
      </div>

      {/*
        ── 하단 정보 — 위→아래 우선순위 ──
          0) 오늘 날짜 · 시간 (4월 19일 · 일 · 18:30) — 라이브 상태 뱃지 inline
          1) 팀 매치업 (NC vs 두산)                  — 가장 강조
          2) 선발투수 (임찬규 · 곽빈)                — 덜 강조
          3) 장소 · 날씨                             — 가장 작게

        위치: bottom-0 + pb-[24vh] 로 화면 하단에서 24% 위에 떠 있게.
        → 슬로건/날짜/매치업/선발/장소까지 viewport 한 화면 안에 들어옴.
        ※ 직전 버전엔 "현재 N위" 배지가 매치업 위에 별도 라인으로 있었으나
          /rank 탭 신설로 정보 중복이라 제거.
      */}
      {match && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.45 }}
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col px-7 pb-[24vh] text-white"
          style={{ textShadow: "0 1px 6px rgba(0,0,0,0.65)" }}
        >
          {/* 0. 오늘 날짜 + 시간 — 매치업 위에 작게 (시간 합쳐서 한 줄) */}
          {dateLabel && (
            <div
              className="mb-2"
              style={{
                fontFamily:
                  '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
                fontSize: "11.5px",
                fontWeight: 500,
                letterSpacing: "0.04em",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              <span>{dateLabel}</span>
              <span
                className="mx-1.5 tabular-nums"
                style={{ color: "rgba(255,255,255,0.22)" }}
              >
                ·
              </span>
              <span className="tabular-nums">{match.game.time}</span>
              {liveView?.game.status === "LIVE" && (
                <span
                  className="ml-2 inline-flex items-center gap-1 align-middle"
                  style={{ color: "#ff4d4d", fontWeight: 700 }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
                    style={{ backgroundColor: "#ff4d4d" }}
                  />
                  LIVE
                </span>
              )}
              {liveView?.game.status === "RESULT" && (
                <span
                  className="ml-2 align-middle"
                  style={{ color: "rgba(255,255,255,0.4)", fontWeight: 600 }}
                >
                  종료
                </span>
              )}
            </div>
          )}

          {/* 1. 팀 매치업 — 거대 (away vs home, 응원팀에 옅은 글로우) */}
          <div className="flex items-baseline gap-2.5">
            <span
              style={{
                fontFamily:
                  '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
                fontSize: "34px",
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                color: "rgba(255,255,255,0.98)",
                textShadow:
                  match.awayTeam.id === team.id
                    ? `0 0 22px ${team.accent}88, 0 1px 6px rgba(0,0,0,0.65)`
                    : "0 1px 6px rgba(0,0,0,0.65)",
              }}
            >
              {match.awayTeam.short}
            </span>
            {/* RESULT/LIVE 시: 스코어 / 그 외: vs */}
            {liveView?.game.result ? (
              <span
                className="tabular-nums"
                style={{
                  fontFamily:
                    '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
                  fontSize: "26px",
                  fontWeight: 700,
                  lineHeight: 1,
                  color: "rgba(255,255,255,0.95)",
                  letterSpacing: "-0.01em",
                }}
              >
                {liveView.game.result.awayScore}
                <span
                  className="mx-1.5"
                  style={{ color: "rgba(255,255,255,0.32)", fontWeight: 300 }}
                >
                  :
                </span>
                {liveView.game.result.homeScore}
              </span>
            ) : (
              <span
                className="italic"
                style={{
                  fontFamily:
                    '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
                  fontSize: "15px",
                  fontWeight: 300,
                  color: "rgba(255,255,255,0.32)",
                }}
              >
                vs
              </span>
            )}
            <span
              style={{
                fontFamily:
                  '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
                fontSize: "34px",
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                color: "rgba(255,255,255,0.98)",
                textShadow:
                  match.homeTeam.id === team.id
                    ? `0 0 22px ${team.accent}88, 0 1px 6px rgba(0,0,0,0.65)`
                    : "0 1px 6px rgba(0,0,0,0.65)",
              }}
            >
              {match.homeTeam.short}
            </span>
          </div>

          {/* 2. 선발투수 — "선발: 김광현 · 고영표" 또는 "선발: 미정" 폴백 */}
          <div
            className="mt-2.5 inline-flex items-baseline gap-2"
            style={{
              fontFamily:
                '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
              fontSize: "16px",
              fontWeight: 500,
              letterSpacing: "-0.005em",
              color: "rgba(255,255,255,0.72)",
            }}
          >
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.04em",
                color: "rgba(255,255,255,0.4)",
              }}
            >
              선발
            </span>
            <span>{starterLabel(match.game.awayPitcher)}</span>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 300,
                color: "rgba(255,255,255,0.28)",
              }}
            >
              ·
            </span>
            <span>{starterLabel(match.game.homePitcher)}</span>
          </div>

          {/*
            3. 장소 · 날씨 — 가장 작게
            (시간은 위 날짜 라인으로 이동 — 중복 제거)
          */}
          <div
            className="mt-3 inline-flex items-center gap-1.5 tabular-nums"
            style={{
              fontFamily:
                '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
              fontSize: "11.5px",
              fontWeight: 400,
              letterSpacing: "0.01em",
              color: "rgba(255,255,255,0.5)",
            }}
          >
            <span>{stadiumShort || match.game.stadium}</span>
            {weatherLabel && (
              <>
                <span style={{ color: "rgba(255,255,255,0.22)" }}>·</span>
                <motion.span
                  key={weatherLabel}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, ease, delay: 0.65 }}
                  title={weather.description || undefined}
                >
                  {weatherLabel}
                </motion.span>
              </>
            )}
            {isRainy && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6, ease, delay: 0.75 }}
                className="ml-0.5 inline-flex items-center"
                aria-label="수중전 진행 중"
                title="수중전 진행 중"
              >
                <motion.span
                  animate={{ opacity: [0.55, 1, 0.55] }}
                  transition={{
                    duration: 2.2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <CloudRain
                    size={11}
                    strokeWidth={1.6}
                    style={{
                      color: "rgba(180,210,235,0.85)",
                      filter:
                        "drop-shadow(0 0 4px rgba(140,180,220,0.55))",
                    }}
                  />
                </motion.span>
              </motion.span>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
