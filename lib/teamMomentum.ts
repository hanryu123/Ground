import { addDaysKst, type LiveGame } from "@/lib/kbo";
import { findTeam } from "@/lib/teams";

const NAVER_BASE = "https://api-gw.sports.naver.com";
const NAVER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 GroundBot/1.0";

const NAVER_TEAM_MAP: Record<string, string> = {
  LG: "lg",
  OB: "doosan",
  HT: "kia",
  HH: "hanwha",
  WO: "kiwoom",
  LT: "lotte",
  NC: "nc",
  SK: "ssg",
  SS: "samsung",
  KT: "kt",
};

type ResultMark = "W" | "L" | "D";

type NaverScheduleGameRaw = {
  gameId?: string;
  gameDate?: string;
  gameDateTime?: string;
  gtime?: string;
  homeTeamCode?: string;
  awayTeamCode?: string;
  homeTeamScore?: number;
  awayTeamScore?: number;
  winner?: "HOME" | "AWAY" | "DRAW" | string;
  statusCode?: string;
};

type TeamResultGame = {
  externalId: string;
  date: string;
  time: string;
  opponentTeamId: string;
  myScore: number;
  oppScore: number;
  result: ResultMark;
};

export type TeamMomentum = {
  teamId: string;
  asOfDate: string;
  recentForm: string;
  recentRecord: string;
  recentScores: string[];
  lastResult: ResultMark | null;
  lastGameLine: string | null;
  lastGameWasYesterday: boolean;
  streak: { result: ResultMark; count: number; label: string } | null;
  summary: string;
};

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseNaverDate(raw?: string, fallback?: string): string | null {
  if (typeof raw === "string" && raw.length === 8) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  if (typeof fallback === "string" && fallback.length >= 10) return fallback.slice(0, 10);
  return null;
}

function normalizeStatus(code?: string): string {
  return (code ?? "").toUpperCase();
}

function resultMark(input: {
  teamId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  winner?: string;
}): ResultMark {
  let winnerId: string | null = null;
  if (input.winner === "HOME") winnerId = input.homeTeam;
  else if (input.winner === "AWAY") winnerId = input.awayTeam;
  else if (input.winner === "DRAW") winnerId = null;
  else if (input.homeScore > input.awayScore) winnerId = input.homeTeam;
  else if (input.awayScore > input.homeScore) winnerId = input.awayTeam;
  if (winnerId == null) return "D";
  return winnerId === input.teamId ? "W" : "L";
}

function adaptNaverGame(raw: NaverScheduleGameRaw, teamId: string): TeamResultGame | null {
  if (normalizeStatus(raw.statusCode) !== "RESULT") return null;
  const homeTeam = NAVER_TEAM_MAP[(raw.homeTeamCode ?? "").toUpperCase()];
  const awayTeam = NAVER_TEAM_MAP[(raw.awayTeamCode ?? "").toUpperCase()];
  if (!homeTeam || !awayTeam || !raw.gameId) return null;
  if (homeTeam !== teamId && awayTeam !== teamId) return null;
  if (typeof raw.homeTeamScore !== "number" || typeof raw.awayTeamScore !== "number") return null;
  const date = parseNaverDate(raw.gameDate, raw.gameDateTime);
  if (!date) return null;
  const isHome = homeTeam === teamId;
  return {
    externalId: raw.gameId,
    date,
    time: raw.gtime ?? raw.gameDateTime?.slice(11, 16) ?? "00:00",
    opponentTeamId: isHome ? awayTeam : homeTeam,
    myScore: isHome ? raw.homeTeamScore : raw.awayTeamScore,
    oppScore: isHome ? raw.awayTeamScore : raw.homeTeamScore,
    result: resultMark({
      teamId,
      homeTeam,
      awayTeam,
      homeScore: raw.homeTeamScore,
      awayScore: raw.awayTeamScore,
      winner: raw.winner,
    }),
  };
}

function adaptLiveGame(game: LiveGame, teamId: string): TeamResultGame | null {
  if (!game.result) return null;
  if (game.homeId !== teamId && game.awayId !== teamId) return null;
  const isHome = game.homeId === teamId;
  return {
    externalId: game.id,
    date: game.date,
    time: game.time,
    opponentTeamId: isHome ? game.awayId : game.homeId,
    myScore: isHome ? game.result.homeScore : game.result.awayScore,
    oppScore: isHome ? game.result.awayScore : game.result.homeScore,
    result: game.result.winnerId == null ? "D" : game.result.winnerId === teamId ? "W" : "L",
  };
}

function formatRecord(games: TeamResultGame[]): string {
  const wins = games.filter((game) => game.result === "W").length;
  const losses = games.filter((game) => game.result === "L").length;
  const draws = games.filter((game) => game.result === "D").length;
  const parts = [`${wins}승`, `${losses}패`];
  if (draws > 0) parts.push(`${draws}무`);
  return parts.join(" ");
}

function formatStreak(mark: ResultMark, count: number): string {
  if (mark === "W") return `${count}연승`;
  if (mark === "L") return `${count}연패`;
  return `${count}경기 연속 무승부`;
}

function buildLastGameLine(game: TeamResultGame, teamId: string): string {
  const team = findTeam(teamId).short;
  const opp = findTeam(game.opponentTeamId).short;
  const label = game.result === "W" ? "승" : game.result === "L" ? "패" : "무";
  return `${game.date} ${team} ${game.myScore}:${game.oppScore} ${opp} ${label}`;
}

function buildSummary(input: {
  teamId: string;
  asOfDate: string;
  recent: TeamResultGame[];
  last: TeamResultGame | null;
  streak: TeamMomentum["streak"];
}) {
  if (input.recent.length === 0) return "최근 경기 흐름 데이터 없음.";
  const record = formatRecord(input.recent);
  const form = input.recent.map((game) => game.result).join("");
  const parts = [`최근 5경기 ${record}(${form}).`];
  if (input.streak && input.streak.count >= 3) {
    parts.push(`현재 ${input.streak.label} 중.`);
  }
  if (input.last) {
    const when =
      input.last.date === input.asOfDate
        ? "오늘 경기"
        : input.last.date === addDaysKst(input.asOfDate, -1)
          ? "어제 경기"
          : "직전 경기";
    const label = input.last.result === "W" ? "승리" : input.last.result === "L" ? "패배" : "무승부";
    parts.push(`${when}는 ${label}.`);
  }
  if (
    input.recent.filter((game) => game.result === "W").length >= 4 &&
    input.last?.result === "L"
  ) {
    parts.push("좋은 흐름이라고 단정하지 말고, 상승세가 한 번 꺾인 맥락까지 같이 언급.");
  }
  return compact(parts.join(" "));
}

function buildMomentum(teamId: string, asOfDate: string, games: TeamResultGame[]): TeamMomentum {
  const ordered = [...games].sort((a, b) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
  );
  const recent = ordered.slice(-5);
  const last = ordered.at(-1) ?? null;
  let streak: TeamMomentum["streak"] = null;
  if (last) {
    let count = 0;
    for (let i = ordered.length - 1; i >= 0; i -= 1) {
      if (ordered[i]?.result !== last.result) break;
      count += 1;
    }
    streak = {
      result: last.result,
      count,
      label: formatStreak(last.result, count),
    };
  }
  return {
    teamId,
    asOfDate,
    recentForm: recent.length > 0 ? recent.map((game) => game.result).join("") : "기록 없음",
    recentRecord: recent.length > 0 ? formatRecord(recent) : "기록 없음",
    recentScores: recent.map((game) => buildLastGameLine(game, teamId)),
    lastResult: last?.result ?? null,
    lastGameLine: last ? buildLastGameLine(last, teamId) : null,
    lastGameWasYesterday: Boolean(last && last.date === addDaysKst(asOfDate, -1)),
    streak,
    summary: buildSummary({ teamId, asOfDate, recent, last, streak }),
  };
}

export function buildTeamMomentumFromLiveGames(input: {
  teamId: string;
  asOfDate: string;
  games: LiveGame[];
}): TeamMomentum {
  const games = input.games
    .map((game) => adaptLiveGame(game, input.teamId))
    .filter((game): game is TeamResultGame => Boolean(game));
  return buildMomentum(input.teamId, input.asOfDate, games);
}

export async function fetchTeamMomentum(input: {
  teamId: string;
  asOfDate: string;
  includeAsOfDate: boolean;
  lookbackDays?: number;
}): Promise<TeamMomentum | null> {
  const toDate = input.includeAsOfDate ? input.asOfDate : addDaysKst(input.asOfDate, -1);
  const fromDate = addDaysKst(toDate, -(input.lookbackDays ?? 45));
  const url =
    `${NAVER_BASE}/schedule/games` +
    `?fields=basic,statusInfo,score` +
    `&upperCategoryId=kbaseball&categoryId=kbo` +
    `&fromDate=${fromDate}&toDate=${toDate}&size=300`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2200);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": NAVER_UA,
        accept: "application/json",
        referer: "https://m.sports.naver.com/",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: { games?: NaverScheduleGameRaw[] } };
    const games = (json.result?.games ?? [])
      .map((game) => adaptNaverGame(game, input.teamId))
      .filter((game): game is TeamResultGame => Boolean(game));
    return buildMomentum(input.teamId, input.asOfDate, games);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
