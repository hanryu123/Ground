"use client";

import { motion } from "framer-motion";
import LogoImage from "@/components/LogoImage";
import { findTeam, type Team } from "@/lib/teams";
import {
  POSTSEASON_ROUND_LABEL,
  getPostseasonRound,
  safeStarter,
  type LiveGame,
} from "@/lib/kbo";
import type { StandingsPayload } from "@/lib/standings";
import { venueDisplayLines } from "@/lib/venue";

/**
 * 오늘 경기 티켓 — TODAY 의 한 장짜리 구단 색 패스.
 *
 *  절취선 위: 라운드·일련번호, 대진(우리 팀이 항상 왼쪽), 시리즈 상황, 선발.
 *  절취선 아래 반쪽(stub)이 경기 상태를 담는다:
 *    경기 전  → 시작 시간 + 남은 시간
 *    경기 중  → 점수 (우리 점수 먼저) + LIVE
 *    경기 후  → 반쪽이 살짝 찢겨 내려가고 승/패/무 도장
 *    취소     → 취소 도장
 */

type Props = {
  team: Team;
  game: LiveGame;
  standings: StandingsPayload | null;
  nowMs: number;
  onOpenDetail?: () => void;
};

function startMs(date: string, time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!m) return null;
  return Date.parse(`${date}T${m[1].padStart(2, "0")}:${m[2]}:00+09:00`);
}

function untilLabel(ms: number): string {
  if (ms <= 60_000) return "곧 시작";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분 후 시작`;
  return m === 0 ? `${h}시간 후 시작` : `${h}시간 ${m}분 후 시작`;
}

/** 포스트시즌이면 시리즈 상황 한 줄 + 차전, 정규시즌이면 시즌 일련번호 */
function headerInfo(game: LiveGame, team: Team, standings: StandingsPayload | null) {
  const round = getPostseasonRound(game.id);
  if (round) {
    const opp = game.homeId === team.id ? game.awayId : game.homeId;
    const series = standings?.bracket?.series.find(
      (s) =>
        s.round === round &&
        [s.higher?.teamId, s.lower?.teamId].includes(team.id) &&
        [s.higher?.teamId, s.lower?.teamId].includes(opp)
    );
    const mine = series ? (series.higher?.teamId === team.id ? series.higher : series.lower) : null;
    const theirs = series ? (series.higher?.teamId === team.id ? series.lower : series.higher) : null;
    const played = game.status === "RESULT";
    const gameNo = mine && theirs ? mine.wins + theirs.wins + (played ? 0 : 1) : null;
    return {
      round: `${POSTSEASON_ROUND_LABEL[round]}${gameNo ? ` ${gameNo}차전` : ""}`,
      serial: seasonSerial(team.id, standings, played),
      series: mine && theirs ? `시리즈 ${mine.wins}승 ${theirs.wins}패` : null,
    };
  }
  return { round: "정규시즌", serial: seasonSerial(team.id, standings, game.status === "RESULT"), series: null as string | null };
}

/** 올 시즌 이 팀의 몇 번째 경기인지 — 정규시즌 경기 수 + 지금까지 치른 포스트시즌 경기 (+ 오늘 경기 전이면 1) */
export function seasonSerial(teamId: string, standings: StandingsPayload | null, todayPlayed: boolean): string | null {
  const row = standings?.standings.find((r) => r.teamId === teamId);
  if (!row) return null;
  const postseason = (standings?.bracket?.series ?? []).reduce((sum, s) => {
    const ids = [s.higher?.teamId, s.lower?.teamId];
    return ids.includes(teamId) ? sum + (s.higher?.wins ?? 0) + (s.lower?.wins ?? 0) : sum;
  }, 0);
  return `No.${row.wins + row.losses + row.draws + postseason + (todayPlayed ? 0 : 1)}`;
}

function rankLabel(teamId: string, standings: StandingsPayload | null): string | null {
  const row = standings?.standings.find((r) => r.teamId === teamId);
  if (!row) return null;
  return standings?.regularSeasonOver ? `정규 ${row.rank}위` : `${row.rank}위`;
}

function Side({ teamId, sub, dim }: { teamId: string; sub: string; dim?: boolean }) {
  const t = findTeam(teamId);
  return (
    <div className={`flex min-w-0 flex-col items-center ${dim ? "opacity-80" : ""}`}>
      <span className="mb-2 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white">
        <LogoImage teamId={teamId} alt="" size={36} fallbackText={t.shortEn} />
      </span>
      <b className="truncate text-[24px] font-black leading-none tracking-[-0.03em]">{t.short}</b>
      <span className="mt-1.5 text-[12px] font-medium opacity-80">{sub}</span>
    </div>
  );
}


function leadLabel(mine: number, opp: number): string {
  if (mine === opp) return "동점";
  return mine > opp ? `${mine - opp}점 앞서요` : `${opp - mine}점 뒤져요`;
}

/** 찢긴 반쪽 윗변 — 톱니 모양으로 잘라 "기울었다"가 아니라 "뜯겼다"로 읽히게 */
const TORN_EDGE_MASK =
  "conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) top / 12px 7px repeat-x, linear-gradient(#000 0 0) 0 6px / 100% 100% no-repeat";

export function Stamp({ label }: { label: string }) {
  return (
    <motion.span
      initial={{ scale: 1.6, opacity: 0, rotate: -14 }}
      animate={{ scale: 1, opacity: 1, rotate: -8 }}
      transition={{ type: "spring", stiffness: 420, damping: 18, delay: 0.25 }}
      className="inline-flex h-[54px] min-w-[54px] items-center justify-center rounded-[10px] border-[2.5px] border-current px-2 text-[24px] font-black leading-none"
      aria-label={`도장 ${label}`}
    >
      {label}
    </motion.span>
  );
}

/** 절취선 — 양끝 반원 홈은 바탕색으로 판다 */
export function Perforation() {
  return (
    <div className="relative h-0">
      <span className="absolute -left-[11px] -top-[11px] h-[22px] w-[22px] rounded-full bg-sys-bg" />
      <span className="absolute -right-[11px] -top-[11px] h-[22px] w-[22px] rounded-full bg-sys-bg" />
      <span className="absolute inset-x-[16px] top-0 border-t-2 border-dashed border-white/50" />
    </div>
  );
}

/** 절취선 아래 반쪽 — torn 이면 톱니로 뜯겨 살짝 내려앉는다 */
export function Stub({ torn, children }: { torn: boolean; children: React.ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={torn ? { y: 9, rotate: -1.2 } : { y: 0, rotate: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      style={{
        transformOrigin: "100% 0%",
        ...(torn ? { WebkitMask: TORN_EDGE_MASK, mask: TORN_EDGE_MASK } : null),
      }}
      className={`flex min-h-[78px] items-center justify-between gap-3 rounded-b-[18px] bg-club-stub px-[18px] pb-4 ${torn ? "pt-4" : "pt-3"}`}
    >
      {children}
    </motion.div>
  );
}

export default function GamePass({ team, game, standings, nowMs, onOpenDetail }: Props) {
  const isHome = game.homeId === team.id;
  const oppId = isHome ? game.awayId : game.homeId;
  const myStarter = safeStarter(isHome ? game.homePitcher : game.awayPitcher);
  const oppStarter = safeStarter(isHome ? game.awayPitcher : game.homePitcher);
  const venue = venueDisplayLines(game.stadium);
  const header = headerInfo(game, team, standings);

  const score = game.result
    ? { mine: isHome ? game.result.homeScore : game.result.awayScore, opp: isHome ? game.result.awayScore : game.result.homeScore }
    : game.liveScore
      ? { mine: isHome ? game.liveScore.homeScore : game.liveScore.awayScore, opp: isHome ? game.liveScore.awayScore : game.liveScore.homeScore }
      : null;

  const isFinal = game.status === "RESULT" && Boolean(game.result);
  const isLive = game.status === "LIVE";
  const isCancel = game.status === "CANCEL";
  const outcome = isFinal
    ? game.result?.winnerId == null
      ? "무"
      : game.result.winnerId === team.id
        ? "승"
        : "패"
    : null;
  const start = startMs(game.date, game.time);
  const torn = isFinal || isCancel;

  const mySub = [isHome ? "홈" : "원정", rankLabel(team.id, standings)].filter(Boolean).join(" · ");
  const oppSub = [isHome ? "원정" : "홈", rankLabel(oppId, standings)].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="relative mx-4 block w-[calc(100%-2rem)] text-left text-club-on transition-transform active:scale-[0.985]"
      aria-label={`${team.short} 대 ${findTeam(oppId).short} 경기 자세히 보기`}
    >
      {/* 절취선 위 */}
      <div className="rounded-t-[18px] bg-club-field shadow-[0_14px_30px_-18px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between px-[18px] pt-[14px] text-[12px] font-semibold tracking-[0.04em] opacity-90">
          <span>{header.round}</span>
          {header.serial ? (
            <span className="font-num text-[15px] font-semibold tracking-[0.02em]">{header.serial}</span>
          ) : null}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center px-[18px] pb-2 pt-4">
          <Side teamId={team.id} sub={mySub} />
          <span className="px-2 text-[14px] font-medium opacity-70">vs</span>
          <Side teamId={oppId} sub={oppSub} dim />
        </div>

        {header.series ? (
          <div className="flex justify-center pb-3.5 pt-1.5">
            <span className="rounded-[10px] bg-black/20 px-2.5 py-1 text-[13px] font-semibold">{header.series}</span>
          </div>
        ) : (
          <div className="h-3" />
        )}

        <div className="grid grid-cols-2 border-t border-white/20">
          <div className="px-[18px] pb-3.5 pt-2.5">
            <span className="block text-[10px] font-semibold tracking-[0.12em] opacity-75">우리 선발</span>
            <span className="mt-0.5 block text-[16px] font-extrabold">{myStarter ?? "발표 전"}</span>
          </div>
          <div className="border-l border-white/20 px-[18px] pb-3.5 pt-2.5">
            <span className="block text-[10px] font-semibold tracking-[0.12em] opacity-75">상대 선발</span>
            <span className="mt-0.5 block text-[16px] font-extrabold">{oppStarter ?? "발표 전"}</span>
          </div>
        </div>
      </div>

      <Perforation />

      {/* 절취선 아래 반쪽 */}
      <Stub torn={torn}>
        {score && (isLive || isFinal) ? (
          <div className="flex items-baseline gap-2 font-num font-bold leading-none">
            <span className="text-[44px]">{score.mine}</span>
            <span className="text-[26px] opacity-60">:</span>
            <span className="text-[44px] opacity-75">{score.opp}</span>
          </div>
        ) : isCancel ? (
          <span className="text-[17px] font-bold">{game.cancelReason === "RAIN" ? "우천 취소" : "경기 취소"}</span>
        ) : (
          <span className="font-num text-[42px] font-bold leading-none">{game.time}</span>
        )}

        <div className="flex items-center gap-3 text-right">
          <div className="text-[13px] font-medium leading-[1.35] opacity-90">
            {isLive ? (
              <>
                <span className="flex items-center justify-end gap-1.5 text-[15px] font-bold">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden />
                  {game.liveScore?.inningLabel ?? "경기 중"}
                </span>
                {score ? <span className="block font-bold">{leadLabel(score.mine, score.opp)}</span> : null}
              </>
            ) : isFinal ? (
              <span className="font-bold">경기 종료</span>
            ) : !isCancel && start ? (
              <span className="font-bold">{untilLabel(start - nowMs)}</span>
            ) : null}
            {isLive ? null : <span className="block">{venue.secondary || venue.primary}</span>}
          </div>
          {outcome ? <Stamp label={outcome} /> : isCancel ? <Stamp label="취소" /> : null}
        </div>
      </Stub>
    </button>
  );
}
