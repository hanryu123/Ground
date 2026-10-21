/**
 * /rank 순위표 전용 데이터 — 연속·최근 10경기 보강 + 포스트시즌 대진표.
 *
 *  - 기본 순위는 lib/kbo.ts fetchKboStandings() 를 그대로 쓴다 (KBO 공식 → 네이버 집계 → 정적 폴백).
 *  - 연속·최근 10경기는 KBO 공식/폴백 데이터에 형식이 제각각이라, 네이버 시즌 경기
 *    (fetchKboSeasonGames) 정규시즌 결과로 다시 계산해 채운다.
 *  - 대진표는 같은 시즌 경기 목록의 포스트시즌 경기(id 앞 4자리)와 최종 순위 시드로 만든다.
 *
 *  클라이언트는 이 파일에서 타입만 import 한다 (서버 fetch 코드가 번들에 섞이지 않게).
 */

import type { StandingRow } from "@/config/standings";
import {
  computePostseasonSeriesState,
  fetchKboSeasonGames,
  fetchKboStandings,
  getPostseasonRound,
  isRegularSeasonGameId,
  POSTSEASON_ROUND_LABEL,
  seasonOpenerForYear,
  todayKstDate,
  type LiveGame,
  type PostseasonRound,
} from "@/lib/kbo";

export type RecentRecord = { wins: number; losses: number; draws: number };

export type StandingsTableRow = StandingRow & {
  /** 현재 연속 기록 — "W3" / "L2" / "D1". 모르면 null */
  streakLabel: string | null;
  /** 최근 10경기 승·패·무. 모르면 null */
  last10: RecentRecord | null;
};

export type BracketTeam = {
  teamId: string;
  /** 정규시즌 최종 순위 (1~5) */
  seed: number | null;
  wins: number;
};

export type BracketSeries = {
  round: PostseasonRound;
  label: string;
  /** 상위 시드 (정규시즌 순위가 높은 쪽) */
  higher: BracketTeam | null;
  /** 하위 시드 — 앞 라운드가 안 끝났으면 null */
  lower: BracketTeam | null;
  /** lower 가 null 일 때 보여줄 자리 표시 ("와일드카드 승자") */
  lowerPlaceholder: string | null;
  /** 와일드카드 4위 1승 어드밴티지 */
  hasWildcardAdvantage: boolean;
  status: "WAITING" | "UPCOMING" | "LIVE" | "ONGOING" | "DONE";
  winnerId: string | null;
  /** 다음(또는 첫) 경기 일정 */
  nextGame: { date: string; time: string } | null;
};

export type PostseasonBracket = {
  series: BracketSeries[];
  championId: string | null;
  /** 아직 끝나지 않은 가장 앞 라운드 — 접힌 상태 요약에 쓴다 */
  currentRound: PostseasonRound | null;
};

export type StandingsPayload = {
  standings: StandingsTableRow[];
  /** 정규시즌 경기가 모두 끝났는지 */
  regularSeasonOver: boolean;
  bracket: PostseasonBracket | null;
  season: number;
};

const ROUND_ORDER: PostseasonRound[] = ["WC", "SEMI_PO", "PO", "KS"];
/** 각 라운드에 직행하는 상위 시드 */
const ROUND_HIGHER_SEED: Record<PostseasonRound, number> = { WC: 4, SEMI_PO: 3, PO: 2, KS: 1 };
const PLACEHOLDER: Record<PostseasonRound, string> = {
  WC: "5위",
  SEMI_PO: "와일드카드 승자",
  PO: "준PO 승자",
  KS: "PO 승자",
};

function byTime(a: LiveGame, b: LiveGame): number {
  return a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date);
}

// ────────────────────────────────────────────────────────────────────
// 연속 · 최근 10경기
// ────────────────────────────────────────────────────────────────────

type Result = "W" | "L" | "D";

/** 정규시즌 종료 경기 → 팀별 시간순 결과 */
function teamResults(regular: LiveGame[]): Map<string, Result[]> {
  const map = new Map<string, Result[]>();
  const push = (id: string, r: Result) => map.set(id, [...(map.get(id) ?? []), r]);
  for (const g of [...regular].sort(byTime)) {
    if (g.status !== "RESULT" || !g.result) continue;
    const w = g.result.winnerId;
    push(g.homeId, w == null ? "D" : w === g.homeId ? "W" : "L");
    push(g.awayId, w == null ? "D" : w === g.awayId ? "W" : "L");
  }
  return map;
}

/** KBO 공식 기준 — 무승부는 연승·연패를 끊지 않는다. 무승부만 있으면 "D{n}" */
function streakOf(results: Result[]): string | null {
  const decided = results.filter((r) => r !== "D");
  const last = decided[decided.length - 1];
  if (!last) return results.length > 0 ? `D${results.length}` : null;
  let n = 0;
  for (let i = decided.length - 1; i >= 0 && decided[i] === last; i--) n++;
  return `${last}${n}`;
}

function recordOf(results: Result[]): RecentRecord {
  return {
    wins: results.filter((r) => r === "W").length,
    losses: results.filter((r) => r === "L").length,
    draws: results.filter((r) => r === "D").length,
  };
}

/**
 * 기존 streak 문자열 정규화 — 시즌 경기를 못 가져왔을 때만 쓴다.
 *  KBO 공식 "2W" → "W2", 네이버 집계 "WWLWW" → "W2"
 */
function normalizeStreak(raw: string | undefined): string | null {
  const s = (raw ?? "").trim().toUpperCase();
  const lead = /^(\d+)([WLD])$/.exec(s);
  if (lead) return `${lead[2]}${lead[1]}`;
  if (/^[WLD]+$/.test(s)) return streakOf(s.split("") as Result[]);
  return null;
}

export function enrichStandings(
  rows: StandingRow[],
  regular: LiveGame[] | null
): StandingsTableRow[] {
  const results = regular ? teamResults(regular) : null;
  return rows.map((row) => {
    const list = results?.get(row.teamId);
    const computed = list && list.length > 0;
    // KBO 공식 "10W" 형식이면 그대로 쓰고, 아니면 시즌 경기로 계산한 값을 쓴다
    const official = /^\d+[WLD]$/.test(row.streak.trim()) ? normalizeStreak(row.streak) : null;
    return {
      ...row,
      streakLabel: official ?? (computed ? streakOf(list) : normalizeStreak(row.streak)),
      last10: computed ? recordOf(list.slice(-10)) : null,
    };
  });
}

// ────────────────────────────────────────────────────────────────────
// 포스트시즌 대진표
// ────────────────────────────────────────────────────────────────────

export function buildPostseasonBracket(
  games: LiveGame[],
  standings: StandingRow[]
): PostseasonBracket | null {
  const post = games.filter((g) => getPostseasonRound(g.id) && g.status !== "CANCEL");
  if (post.length === 0) return null;

  const ordered = [...standings].sort((a, b) => a.rank - b.rank);
  const seedOf = (teamId: string): number | null => {
    const i = ordered.findIndex((r) => r.teamId === teamId);
    return i >= 0 && i < 5 ? i + 1 : null;
  };
  const teamAtSeed = (seed: number): string | null => ordered[seed - 1]?.teamId ?? null;

  const series: BracketSeries[] = [];
  let prevWinner: string | null = null;

  for (const round of ROUND_ORDER) {
    const roundGames = post.filter((g) => getPostseasonRound(g.id) === round).sort(byTime);
    const label = POSTSEASON_ROUND_LABEL[round];

    if (roundGames.length === 0) {
      // 일정이 아직 안 잡힌 라운드 — 시드 팀 대기, 상대는 앞 라운드 승자
      const higherId = teamAtSeed(ROUND_HIGHER_SEED[round]);
      const lowerId = round === "WC" ? teamAtSeed(5) : prevWinner;
      series.push({
        round,
        label,
        higher: higherId ? { teamId: higherId, seed: ROUND_HIGHER_SEED[round], wins: 0 } : null,
        lower: lowerId ? { teamId: lowerId, seed: seedOf(lowerId), wins: 0 } : null,
        lowerPlaceholder: lowerId ? null : PLACEHOLDER[round],
        hasWildcardAdvantage: round === "WC",
        status: "WAITING",
        winnerId: null,
        nextGame: null,
      });
      prevWinner = null;
      continue;
    }

    const first = roundGames[0]!;
    const [a, b] = [first.homeId, first.awayId];
    const sa = seedOf(a) ?? 99;
    const sb = seedOf(b) ?? 99;
    const higherId = sa <= sb ? a : b;
    const lowerId = higherId === a ? b : a;

    const last = roundGames[roundGames.length - 1]!;
    const state = computePostseasonSeriesState(last, higherId, roundGames, true);
    const higherWins = state?.teamWins ?? 0;
    const lowerWins = state?.opponentWins ?? 0;
    const winnerId =
      state?.outcome === "ADVANCED" ? higherId : state?.outcome === "ELIMINATED" ? lowerId : null;

    const upcoming = roundGames.find((g) => g.status === "LIVE" || g.status === "BEFORE");
    const played = roundGames.some((g) => g.status === "RESULT");
    const status: BracketSeries["status"] = winnerId
      ? "DONE"
      : roundGames.some((g) => g.status === "LIVE")
        ? "LIVE"
        : played
          ? "ONGOING"
          : "UPCOMING";

    series.push({
      round,
      label,
      higher: { teamId: higherId, seed: seedOf(higherId), wins: higherWins },
      lower: { teamId: lowerId, seed: seedOf(lowerId), wins: lowerWins },
      lowerPlaceholder: null,
      hasWildcardAdvantage: state?.hasWildcardAdvantage ?? false,
      status,
      winnerId,
      nextGame: !winnerId && upcoming ? { date: upcoming.date, time: upcoming.time } : null,
    });
    prevWinner = winnerId;
  }

  const ks = series.find((s) => s.round === "KS");
  return {
    series,
    championId: ks?.winnerId ?? null,
    currentRound: series.find((s) => s.status !== "DONE")?.round ?? null,
  };
}

// ────────────────────────────────────────────────────────────────────
// API 진입점
// ────────────────────────────────────────────────────────────────────

export async function fetchStandingsPayload(today: string = todayKstDate()): Promise<StandingsPayload> {
  const season = parseInt(today.slice(0, 4), 10);
  const [rows, games] = await Promise.all([
    fetchKboStandings(),
    fetchKboSeasonGames(season).catch((err) => {
      console.warn(`[standings] season games failed (${(err as Error).message})`);
      return null;
    }),
  ]);

  const opener = seasonOpenerForYear(season);
  const regular = games?.filter((g) => g.date >= opener && isRegularSeasonGameId(g.id)) ?? null;
  const regularSeasonOver =
    regular != null &&
    regular.length > 0 &&
    !regular.some(
      (g) => g.status === "LIVE" || (g.status !== "RESULT" && g.status !== "CANCEL" && g.date >= today)
    );

  return {
    standings: enrichStandings(rows, regular),
    regularSeasonOver,
    bracket: games ? buildPostseasonBracket(games, rows) : null,
    season,
  };
}
