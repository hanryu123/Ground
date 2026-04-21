"use client";

import Image from "next/image";
import Link from "next/link";
import { Cormorant_Garamond } from "next/font/google";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudRain, User } from "lucide-react";
import { findTeam, heroLeftEpithetLabel, type Team } from "@/lib/teams";
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

/** 영문 슬로건 · VS · 스코어 — 포스터형 세리프 */
const displaySerif = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/** 한글 슬로건 줄만 Pretendard 유지, 영문 줄은 Cormorant(displaySerif) */
function hasHangul(s: string): boolean {
  return /[\u3131-\u318E\uAC00-\uD7A3]/.test(s);
}

/** 팀명 공통 메트릭 — globals.css 의 Black Han Sans(한글 포함 전체 서브셋) */
const TEAM_SHORT_STYLE = {
  fontSize: "clamp(28px, 7.2vw, 46px)",
  lineHeight: 0.92,
  letterSpacing: "-0.05em",
} as const;

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

/**
 * 구장 풀네임 → 짧은 **도시/지역** 라벨만 (경기장 풀명 제외).
 * 예: 잠실 구장 → "잠실", 사직 → "부산", "수원 KT 위즈 파크" → "수원"
 */
function venueCityOnly(stadium: string | undefined | null): string {
  if (!stadium) return "";
  const s = stadium.trim();
  if (s.includes("잠실")) return "잠실";
  if (s.includes("사직")) return "부산";
  if (s.includes("고척")) return "고척";
  if (s.includes("수원")) return "수원";
  if (s.includes("대구")) return "대구";
  if (s.includes("창원")) return "창원";
  if (s.includes("대전")) return "대전";
  if (s.includes("광주")) return "광주";
  if (s.includes("문학")) return "인천";
  if (s.includes("울산")) return "울산";
  const head = s.split(/\s+/)[0];
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

/** YYYY-MM-DD + HH:mm → KST 시작 시각(ms, UTC 기준 타임스탬프) */
function gameStartMsKst(date: string, time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!date || !m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (
    !Number.isFinite(hh) ||
    !Number.isFinite(mm) ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59
  ) {
    return null;
  }
  const iso = `${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 남은 초 → `HH:MM:SS` (표시 상한 99:59:59) */
function formatCountdownHms(totalSeconds: number): string {
  const cap = 99 * 3600 + 59 * 60 + 59;
  const sec = Math.min(cap, Math.max(0, Math.floor(totalSeconds)));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
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
  const sloganOneLine =
    lines.length === 0
      ? ""
      : sloganText.includes("\n")
        ? lines.join(" · ")
        : lines.join(" ");

  const dateLabel = formatMatchDate(match?.game.date);

  const gameStartMs = useMemo(() => {
    if (!match?.game.date || !match.game.time) return null;
    return gameStartMsKst(match.game.date, match.game.time);
  }, [match?.game.date, match?.game.time]);

  const showHeroCountdown =
    Boolean(match) &&
    liveView?.game.status !== "LIVE" &&
    liveView?.game.status !== "RESULT" &&
    liveView?.game.status !== "CANCEL" &&
    !liveView?.game.result &&
    !match?.game.result;

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!showHeroCountdown || gameStartMs == null) return;
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [showHeroCountdown, gameStartMs, match?.game.id]);

  const countdownHms =
    showHeroCountdown && gameStartMs != null
      ? formatCountdownHms(Math.floor((gameStartMs - nowMs) / 1000))
      : null;

  /** 응원팀(team) 항상 좌측, 상대 우측 */
  const heroMatch = useMemo(() => {
    if (!match) return null;
    const leftIsAway = team.id === match.awayTeam.id;
    return {
      leftTeam: leftIsAway ? match.awayTeam : match.homeTeam,
      rightTeam: leftIsAway ? match.homeTeam : match.awayTeam,
      leftPitcher: leftIsAway ? match.game.awayPitcher : match.game.homePitcher,
      rightPitcher: leftIsAway ? match.game.homePitcher : match.game.awayPitcher,
      leftIsAway,
      venueCity: venueCityOnly(match.game.stadium),
    };
  }, [match, team.id]);

  const leftHeroEpithet = heroMatch
    ? heroLeftEpithetLabel(heroMatch.leftTeam.id)
    : null;

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
        하단 웅장한 암부 그라데이션 — 패널 없이 텍스트만 얹어도 대비 확보.
      */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: [
            "linear-gradient(180deg, rgba(0,0,0,0.32) 0%, transparent 24%)",
            "linear-gradient(0deg, #000000 0%, rgba(0,0,0,0.94) 12%, rgba(0,0,0,0.72) 28%, rgba(0,0,0,0.35) 45%, transparent 62%)",
          ].join(", "),
        }}
      />

      {/* ── 좌상단: 프로필 (/my) — 공유·알림과 동일 터치 타겟 h-11 w-11 ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7, ease, delay: 0.15 }}
        className="absolute left-5 top-5 z-30"
      >
        <motion.div whileTap={{ scale: 0.9 }}>
          <Link
            href="/my"
            aria-label="응원팀 변경"
            className="flex h-11 w-11 items-center justify-center rounded-full"
          >
            <User
              size={21}
              strokeWidth={1.5}
              className="text-white/85"
              style={{ filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.55))" }}
            />
          </Link>
        </motion.div>
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

      {/* ── 경기 없음: 하단 그라데이션 위 중앙 스택 (글래스 없음) ── */}
      {!match && (
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.85, ease, delay: 0.18 }}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center px-7 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] pt-[18vh] text-center"
        >
          <div className="flex max-w-md flex-col items-center">
            <motion.p
              key={`${team.id}-${sloganText}-1l`}
              initial={{
                opacity: 0,
                letterSpacing: hasHangul(sloganOneLine) ? "-0.02em" : "0.2em",
              }}
              animate={{
                opacity: 1,
                letterSpacing: hasHangul(sloganOneLine) ? "-0.02em" : "0.1em",
              }}
              transition={{ duration: 1.05, ease, delay: 0.12 }}
              className={
                hasHangul(sloganOneLine)
                  ? "text-white"
                  : `text-white ${displaySerif.className}`
              }
              style={{
                fontWeight: hasHangul(sloganOneLine) ? 700 : 600,
                fontSize: hasHangul(sloganOneLine)
                  ? "clamp(18px, 5.07vw, 26px)"
                  : "clamp(21px, 5.98vw, 34px)",
                lineHeight: 1.35,
                textTransform: hasHangul(sloganOneLine) ? "none" : "uppercase",
                filter: isRainy ? "blur(0.2px)" : undefined,
              }}
            >
              {sloganOneLine}
            </motion.p>
          </div>
        </motion.div>
      )}

      {/*
        경기 있음: 응원팀 좌측 · 팀명·선발 · 슬로건 · 날짜 · 날씨 · 맨 아래 도시만
      */}
      {match && heroMatch && (
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease, delay: 0.22 }}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center px-6 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] pt-[10vh] text-center"
        >
          <div className="max-w-md px-1">
            <motion.p
              key={`${team.id}-${sloganText}-hero-top`}
              initial={{
                opacity: 0,
                letterSpacing: hasHangul(sloganOneLine) ? "-0.02em" : "0.18em",
              }}
              animate={{
                opacity: 1,
                letterSpacing: hasHangul(sloganOneLine) ? "-0.02em" : "0.08em",
              }}
              transition={{ duration: 0.95, ease, delay: 0.08 }}
              className={
                hasHangul(sloganOneLine)
                  ? "text-white/88"
                  : `text-white/85 ${displaySerif.className}`
              }
              style={{
                fontWeight: hasHangul(sloganOneLine) ? 600 : 550,
                fontSize: hasHangul(sloganOneLine)
                  ? "clamp(16px, 4.16vw, 20px)"
                  : "clamp(16px, 4.29vw, 21px)",
                lineHeight: 1.45,
                textTransform: hasHangul(sloganOneLine) ? "none" : "uppercase",
              }}
            >
              {sloganOneLine}
            </motion.p>
          </div>

          {/*
            max-content 3열 — 1fr 대칭이 아니라 내용 너비만 쓰고 VS 를 가운데에 두어
            팀명 길이가 달라도 "팀 · VS · 팀" 이 한 덩어로 중앙에 모인다.
          */}
          <div className="mx-auto mt-7 w-max max-w-[min(100%,36rem)]">
            <div className="grid grid-cols-[max-content_auto_max-content] grid-rows-[auto_auto] items-end gap-x-4 gap-y-2 sm:gap-x-5">
              <div className="min-w-0 justify-self-end text-right">
                <div className="flex flex-col items-end justify-end gap-0 leading-none">
                  {leftHeroEpithet ? (
                    <p
                      className="mb-1.5 w-full text-left text-[clamp(11px,2.6vw,17px)] leading-none tracking-[0.02em] text-white/58"
                      style={{ fontWeight: 200 }}
                    >
                      {leftHeroEpithet}
                    </p>
                  ) : null}
                  <span
                    className="inline-block origin-bottom font-['Black_Han_Sans',sans-serif] text-white"
                    style={{
                      ...TEAM_SHORT_STYLE,
                      transform: "skewX(-9deg)",
                      textShadow: `0 0 28px ${team.accent}88, 0 3px 14px rgba(0,0,0,0.65)`,
                    }}
                  >
                    {heroMatch.leftTeam.short}
                  </span>
                </div>
              </div>

              <div className="flex min-h-[2.75rem] items-end justify-center self-end px-1 pb-0.5">
                {liveView?.game.result ? (
                  <span
                    className={`tabular-nums text-white/95 ${displaySerif.className}`}
                    style={{
                      fontWeight: 600,
                      fontSize: "clamp(20px, 5.2vw, 30px)",
                      letterSpacing: "0.04em",
                      lineHeight: 1,
                    }}
                  >
                    {heroMatch.leftIsAway
                      ? liveView.game.result.awayScore
                      : liveView.game.result.homeScore}
                    <span className="mx-2 font-light text-white/28">:</span>
                    {heroMatch.leftIsAway
                      ? liveView.game.result.homeScore
                      : liveView.game.result.awayScore}
                  </span>
                ) : (
                  <span
                    className={`${displaySerif.className} uppercase text-white/36`}
                    style={{
                      fontWeight: 500,
                      fontSize: "9px",
                      letterSpacing: "0.38em",
                      lineHeight: 1,
                    }}
                  >
                    vs
                  </span>
                )}
              </div>

              <div className="min-w-0 justify-self-start text-left">
                <span
                  className="inline-block origin-bottom font-['Black_Han_Sans',sans-serif] text-white/92"
                  style={{
                    ...TEAM_SHORT_STYLE,
                    transform: "skewX(-9deg)",
                    textShadow: "0 2px 20px rgba(0,0,0,0.55)",
                  }}
                >
                  {heroMatch.rightTeam.short}
                </span>
              </div>

              <div className="flex min-h-[1.35rem] items-start justify-end justify-self-end">
                <span className="text-right text-[11px] font-semibold leading-snug tracking-wide text-white/72">
                  {starterLabel(heroMatch.leftPitcher)}
                </span>
              </div>
              <div aria-hidden className="min-h-[1.35rem]" />
              <div className="flex min-h-[1.35rem] items-start justify-start justify-self-start">
                <span className="text-left text-[11px] font-semibold leading-snug tracking-wide text-white/68">
                  {starterLabel(heroMatch.rightPitcher)}
                </span>
              </div>
            </div>
          </div>

          {countdownHms ? (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.55, ease, delay: 0.32 }}
              className="mt-6 text-[11px] font-medium tabular-nums tracking-[0.32em] text-white/52"
              aria-label="경기 시작까지 남은 시간"
            >
              {countdownHms}
            </motion.p>
          ) : null}

          <div
            className={`max-w-md text-[11px] font-normal uppercase tracking-[0.22em] text-white/58 ${countdownHms ? "mt-8" : "mt-10"}`}
            style={{ fontWeight: 400 }}
          >
            <p className="tabular-nums">
              {dateLabel ? (
                <>
                  <span>{dateLabel}</span>
                  <span className="mx-2 text-white/25">·</span>
                </>
              ) : null}
              <span>{match.game.time}</span>
              {liveView?.game.status === "LIVE" && (
                <>
                  <span className="mx-2 text-white/25">·</span>
                  <span className="inline-flex items-center gap-1.5 font-medium tracking-[0.18em] text-[#ff5c5c]">
                    <span
                      className="inline-block h-1 w-1 animate-pulse rounded-full bg-[#ff5c5c]"
                      aria-hidden
                    />
                    LIVE
                  </span>
                </>
              )}
              {liveView?.game.status === "RESULT" && (
                <>
                  <span className="mx-2 text-white/25">·</span>
                  <span className="text-white/45">종료</span>
                </>
              )}
            </p>
          </div>

          <div
            className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white/38"
          >
            {weatherLabel && (
              <motion.span
                key={weatherLabel}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.45, ease, delay: 0.4 }}
                title={weather.description || undefined}
              >
                {weatherLabel}
              </motion.span>
            )}
            {isRainy && (
              <motion.span
                initial={{ opacity: 0, x: -3 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, ease, delay: 0.5 }}
                className="ml-1 inline-flex items-center"
                aria-label="수중전 진행 중"
                title="수중전 진행 중"
              >
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{
                    duration: 2.2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                >
                  <CloudRain
                    size={11}
                    strokeWidth={1.5}
                    className="text-sky-300/70"
                    style={{
                      filter: "drop-shadow(0 0 3px rgba(140,180,220,0.35))",
                    }}
                  />
                </motion.span>
              </motion.span>
            )}
          </div>

          {heroMatch.venueCity ? (
            <p className="mt-5 text-[12px] font-medium tracking-[0.14em] text-white/52">
              {heroMatch.venueCity}
            </p>
          ) : null}
        </motion.div>
      )}
    </div>
  );
}
