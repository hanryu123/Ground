"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudRain } from "lucide-react";
import { findTeam, type Team } from "@/lib/teams";
import { TODAY_GAMES } from "@/lib/games";
import { pickSlogan, splitSloganForDisplay } from "@/config/teams";
import LogoImage from "@/components/LogoImage";
import NotificationBell from "@/components/NotificationBell";
import { useWeather, type WeatherInfo } from "@/lib/useWeather";
import { posterCandidates, POSTER_FINAL_FALLBACK } from "@/lib/posterImage";
import { useTodaySlot } from "@/lib/useTodaySlot";
import { isTeamWinnerToday } from "@/config/todayGames";

const ease = [0.22, 1, 0.36, 1] as const;

type Props = {
  team: Team;
  /**
   * 순위 드로어가 열려 있을 때 true. 하단 매치업/장소·시간/SP 정보 블록을
   * 부드럽게 페이드 아웃 + 약간 아래로 밀어둔다.
   */
  hideBottomInfo?: boolean;
};

function getTodayMatch(team: Team) {
  const game = TODAY_GAMES.find(
    (g) => g.awayId === team.id || g.homeId === team.id
  );
  if (!game) return null;
  const isHome = game.homeId === team.id;
  const homeTeam = findTeam(game.homeId);
  const awayTeam = findTeam(game.awayId);
  const opponent = isHome ? awayTeam : homeTeam;
  return { game, homeTeam, awayTeam, opponent, isHome };
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

export default function HeroCard({ team, hideBottomInfo = false }: Props) {
  const match = useMemo(() => getTodayMatch(team), [team]);

  // ── 날씨 — 구장 좌표 기반 ──
  const weather = useWeather(match?.game.stadium);
  const isRainy = weather.isRainy;
  const weatherLabel = formatWeather(weather);

  // ── 시간대 + 승패 기반 정적 화보 후보 체인 (zero-latency) ──
  //  기본(시간 무관)               → /images/refs/ready/${teamId}.{ext}
  //                                   → 없으면 ready 풀에서 teamId 해시로 결정론적 픽
  //  Night(22:00~05:59) + 승리만   → /images/refs/victory/Winning*.jpg 결정론적 픽
  //  ※ /images/refs/posters/night.png 는 어떤 경로에서도 사용하지 않음.
  const slot = useTodaySlot();
  const isWinner = isTeamWinnerToday(team.id);
  const dateKey = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const candidates = useMemo(
    () => posterCandidates({ teamId: team.id, slot, isWinner, dateKey }),
    [team.id, slot, isWinner, dateKey]
  );

  // 후보 인덱스 — onError 시 다음 후보로 넘어가는 안전장치
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    setIdx(0);
  }, [candidates]);

  const currentSrc = candidates[idx] ?? POSTER_FINAL_FALLBACK;

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
        <motion.div
          key={currentSrc}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease }}
          className="absolute inset-0"
        >
          <Image
            src={currentSrc}
            alt={team.nameEn}
            fill
            priority
            sizes="100vw"
            className="object-cover"
            onError={() => {
              // 현재 후보 404 → 다음 후보로 자동 폴백.
              // 마지막 후보(night.png)까지 실패해도 화면은 검정으로 유지되어 깨지지 않음.
              if (idx < candidates.length - 1) {
                console.warn(
                  `[HeroCard] poster not found: ${currentSrc} → fallback: ${candidates[idx + 1]}`
                );
                setIdx(idx + 1);
              } else {
                console.error(
                  `[HeroCard] all poster candidates failed for teamId="${team.id}" slot="${slot}" isWinner=${isWinner}.\n` +
                    `Tried in order:\n` +
                    candidates.map((c) => `  - ${c}`).join("\n") +
                    `\nFix: drop a matching file (e.g. /public${candidates[0]}).`
                );
              }
            }}
          />
        </motion.div>
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

      {/* ── 좌상단: 실제 구단 로고 ── */}
      <div className="absolute left-5 top-5 z-30">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease, delay: 0.15 }}
          className="h-12 w-12"
        >
          <LogoImage
            teamId={team.id}
            alt={team.nameEn}
            size={48}
            priority
            className="h-full w-full"
            style={{
              filter:
                "drop-shadow(0 2px 6px rgba(0,0,0,0.55)) drop-shadow(0 0 1px rgba(0,0,0,0.35))",
            }}
          />
        </motion.div>
      </div>

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
          0) 오늘 날짜 (4월 19일 · 일)       — 작게 (장소/시간과 같은 톤)
          1) 팀 매치업 (NC vs 두산)         — 가장 강조
          2) 선발투수 (임찬규 · 곽빈)        — 덜 강조
          3) 장소 · 시간 · 날씨              — 가장 작게
      */}
      {match && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{
            opacity: hideBottomInfo ? 0 : 1,
            y: hideBottomInfo ? 16 : 0,
          }}
          transition={{
            duration: hideBottomInfo ? 0.28 : 0.8,
            ease,
            delay: hideBottomInfo ? 0 : 0.45,
          }}
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col px-7 pb-10 text-white"
          style={{
            textShadow: "0 1px 6px rgba(0,0,0,0.65)",
            pointerEvents: hideBottomInfo ? "none" : "auto",
          }}
        >
          {/* 0. 오늘 날짜 — 장소/시간과 동일한 톤·크기로 매치업 위에 작게 */}
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
              {dateLabel}
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

          {/* 2. 선발투수 — 덜 강조 (away · home 순) */}
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
            <span>{match.game.awayPitcher}</span>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 300,
                color: "rgba(255,255,255,0.28)",
              }}
            >
              ·
            </span>
            <span>{match.game.homePitcher}</span>
          </div>

          {/* 3. 장소 · 시간 · 날씨 — 가장 작게 */}
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
            <span style={{ color: "rgba(255,255,255,0.22)" }}>·</span>
            <span>{match.game.time}</span>
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
