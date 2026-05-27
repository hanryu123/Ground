/**
 * 클러치 상황 감지 및 알림 발송.
 *
 * 트리거 조건:
 *  1. [late_clutch]       8회 이상 & 점수차 ≤2 & 득점권 주자(2루 or 3루)
 *  2. [bases_loaded_2out] 2아웃 & 만루 (이닝 무관)
 *
 * 중복 방지:
 *  NotificationDispatchState.eventKey = `{date}:{gameId}:clutch:{inn}:{batterName}:{kind}`
 *  → 동일 이닝·동일 타자 타석에서 최초 1회만 발송.
 */

import { findTeam } from "@/lib/teams";
import { mapWithConcurrency } from "@/lib/concurrency";
import {
  markDispatchOnce,
  sendTeamTopicNotification,
} from "@/services/notificationService";
import { generateClutchPushCopy } from "@/lib/pushLlm";
import type { LiveScoreGame } from "@/lib/score/types";

const NAVER_BASE = "https://api-gw.sports.naver.com";
const NAVER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 GroundBot/1.0";

export type ClutchKind = "late_clutch" | "bases_loaded_2out";

export type ClutchGameState = {
  inningNum: number | null;
  inningHalf: "초" | "말" | null;
  outCount: number | null;
  bases: { first: boolean; second: boolean; third: boolean };
  batterName: string | null;
};

export type BatterTodayStats = {
  hits: number;
  homeRuns: number;
  strikeouts: number;
};

// ─── 헬퍼: 필드 값 파싱 ─────────────────────────────────────────────────────

function readBool(gs: Record<string, unknown>, ...keys: string[]): boolean {
  for (const key of keys) {
    const v = gs[key];
    if (v === true || v === "Y" || v === "y" || v === 1 || v === "1") return true;
    if (v === false || v === "N" || v === "n" || v === 0 || v === "0") return false;
  }
  return false;
}

function readNum(gs: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = gs[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") { const n = parseInt(v); if (!Number.isNaN(n)) return n; }
  }
  return null;
}

function readStr(gs: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = gs[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

// ─── Naver relay 단일 fetch (gameState + 릴레이 텍스트 둘 다 추출) ─────────

type RelayFetchResult = {
  state: ClutchGameState;
  textRelays: unknown[];
};

async function fetchRelayRaw(externalId: string): Promise<RelayFetchResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`${NAVER_BASE}/schedule/games/${externalId}/relay`, {
      headers: {
        "user-agent": NAVER_UA,
        accept: "application/json",
        referer: "https://m.sports.naver.com/",
      },
      cache: "no-store",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const result = json["result"] as Record<string, unknown> | undefined;
    const trd = result?.["textRelayData"] as Record<string, unknown> | undefined;
    const textRelays = Array.isArray(trd?.["textRelays"]) ? (trd!["textRelays"] as unknown[]) : [];

    // 이닝 초/말
    let inningNum: number | null = null;
    let inningHalf: "초" | "말" | null = null;

    const subCandidates = [
      json["inningSub"], result?.["inningSub"],
      result?.["currentInningSub"], json["currentInningSub"],
    ];
    for (const s of subCandidates) {
      if (s === 1 || s === "1") { inningHalf = "초"; break; }
      if (s === 2 || s === "2") { inningHalf = "말"; break; }
    }

    let outCount: number | null = null;
    let bases = { first: false, second: false, third: false };
    let batterName: string | null = null;

    // textRelays 마지막 항목 → currentGameState
    if (textRelays.length > 0) {
      const last = textRelays[textRelays.length - 1] as Record<string, unknown>;
      const rawInn = last["inn"] ?? last["inning"];
      inningNum =
        typeof rawInn === "number" ? rawInn :
        typeof rawInn === "string" ? (parseInt(rawInn) || null) : null;

      if (!inningHalf) {
        const sub = last["inningSub"];
        if (sub === 1 || sub === "1") inningHalf = "초";
        else if (sub === 2 || sub === "2") inningHalf = "말";
      }

      const textOptions = last["textOptions"] as Array<Record<string, unknown>> | undefined;
      const gs = textOptions?.[0]?.["currentGameState"] as Record<string, unknown> | undefined;

      if (gs) {
        outCount = readNum(gs, "outCount", "outs", "outNum");
        bases = {
          first:  readBool(gs, "base1", "onBase1", "runner1B", "firstBase"),
          second: readBool(gs, "base2", "onBase2", "runner2B", "secondBase"),
          third:  readBool(gs, "base3", "onBase3", "runner3B", "thirdBase"),
        };
        batterName = readStr(gs, "batterName", "currentBatter", "batter");
      }
    }

    return {
      state: { inningNum, inningHalf, outCount, bases, batterName },
      textRelays,
    };
  } catch {
    return null;
  }
}

// ─── 타자 오늘 기록 파싱 (relay 텍스트에서 직접 추산) ────────────────────

function parseBatterStats(textRelays: unknown[], batterName: string): BatterTodayStats {
  const stats: BatterTodayStats = { hits: 0, homeRuns: 0, strikeouts: 0 };
  for (const relay of textRelays) {
    const r = relay as Record<string, unknown>;
    const title = (r["title"] as string | undefined) ?? "";
    const plays = ((r["textOptions"] as Array<Record<string, unknown>> | undefined) ?? [])
      .map((o) => (o["playText"] as string | undefined) ?? "")
      .join(" ");
    const full = `${title} ${plays}`;
    if (!full.includes(batterName)) continue;

    if (/홈런/.test(full)) {
      stats.homeRuns += 1;
      stats.hits += 1;
    } else if (/[23]루타|안타/.test(full)) {
      stats.hits += 1;
    }
    if (/삼진/.test(full)) stats.strikeouts += 1;
  }
  return stats;
}

// ─── 클러치 상황 감지 ────────────────────────────────────────────────────────

export function detectClutchSituation(
  state: ClutchGameState,
  homeScore: number,
  awayScore: number,
): ClutchKind | null {
  const { inningNum, outCount, bases } = state;
  if (inningNum == null) return null;

  const scoreDiff = Math.abs(homeScore - awayScore);
  const isScoringPosition = bases.second || bases.third;
  const isBasesLoaded = bases.first && bases.second && bases.third;

  // [후반 승부처]: 8회 이상 & 점수차 ≤2 & 득점권
  if (inningNum >= 8 && scoreDiff <= 2 && isScoringPosition) return "late_clutch";

  // [2사 만루]: 2아웃 & 만루
  if (outCount === 2 && isBasesLoaded) return "bases_loaded_2out";

  return null;
}

export function getBatterNarrative(stats: BatterTodayStats | null): "hot" | "cold" | null {
  if (!stats) return null;
  if (stats.hits >= 2 || stats.homeRuns >= 1) return "hot";
  if (stats.strikeouts >= 2 && stats.hits === 0) return "cold";
  return null;
}

// ─── 알림 발송 ───────────────────────────────────────────────────────────────

export async function sendClutchAlerts(input: {
  game: LiveScoreGame;
  state: ClutchGameState;
  clutchKind: ClutchKind;
  batterStats: BatterTodayStats | null;
  targetDate: string;
  origin: string;
}): Promise<{ sent: number; disabled: number; inboxCreated: number; skipped: number }> {
  const { game, state, clutchKind, batterStats, targetDate } = input;

  // 중복 방지 키: 날짜 + 경기ID + 이닝 + 타자명 + 종류
  const inningKey = state.inningNum ?? "x";
  const batterKey = state.batterName ?? "unk";
  const eventKey = `${targetDate}:${game.externalId}:clutch:${inningKey}:${batterKey}:${clutchKind}`;

  const narrative = getBatterNarrative(batterStats);
  const teamIds = [game.homeTeam, game.awayTeam];
  let sent = 0, disabled = 0, inboxCreated = 0, skipped = 0;

  await mapWithConcurrency(teamIds, 2, async (teamId) => {
    const lock = await markDispatchOnce({
      alertKind: "clutch",
      teamScope: teamId,
      eventKey,
      gameExternalId: game.externalId,
    });
    if (!lock) { skipped += 1; return; }

    const isHomeFan = teamId === game.homeTeam;
    const myTeam = findTeam(teamId);
    const oppTeamId = isHomeFan ? game.awayTeam : game.homeTeam;
    const oppTeam = findTeam(oppTeamId);
    const myScore = isHomeFan ? game.homeScore : game.awayScore;
    const oppScore = isHomeFan ? game.awayScore : game.homeScore;

    // 공격 중이면 유리(찬스), 수비 중이면 불리(위기)
    const myTeamIsBatting = isHomeFan
      ? state.inningHalf === "말"
      : state.inningHalf === "초";
    const isAdvantage = myTeamIsBatting;

    const copy = await generateClutchPushCopy({
      favoriteTeam: myTeam.short,
      opponentTeam: oppTeam.short,
      myScore,
      oppScore,
      clutchKind,
      inningNum: state.inningNum,
      inningHalf: state.inningHalf,
      outCount: state.outCount,
      bases: state.bases,
      batterName: state.batterName,
      batterNarrative: narrative,
      isAdvantage,
    });

    const result = await sendTeamTopicNotification({
      teamId,
      topicKey: "score",
      title: copy.title,
      body: copy.body,
      url: "/today",
      payload: {
        kind: "clutch",
        clutchKind,
        externalId: game.externalId,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        teamId,
        inningNum: state.inningNum,
        inningHalf: state.inningHalf,
        batterName: state.batterName,
        isAdvantage,
        narrative,
      },
      type: "SCORE_UPDATE",
      origin: input.origin,
    });

    sent += result.sent;
    disabled += result.disabled;
    inboxCreated += result.inboxCreated;
  });

  return { sent, disabled, inboxCreated, skipped };
}

/**
 * check-score cron 진입점.
 * relay를 1회만 fetch하고 state + batter stats를 함께 반환.
 */
export async function fetchClutchData(externalId: string): Promise<{
  state: ClutchGameState;
  batterStats: BatterTodayStats | null;
} | null> {
  const raw = await fetchRelayRaw(externalId);
  if (!raw) return null;

  const { state, textRelays } = raw;
  const batterStats = state.batterName
    ? parseBatterStats(textRelays, state.batterName)
    : null;

  return { state, batterStats };
}
