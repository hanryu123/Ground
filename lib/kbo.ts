/**
 * KBO 실시간 데이터 어댑터 (서버 사이드 전용 — Node runtime).
 *
 *  - 1차 소스: 네이버 스포츠 JSON (api-gw.sports.naver.com)
 *  - 실패 / 시즌 데이터 부재 시 → 정적 더미 (lib/games.ts, config/standings.ts) 폴백
 *
 *  내부 노출 타입은 기존 Game / StandingRow 와 호환되도록 매핑한다.
 *  ────────────────────────────────────────────────────────────────────
 *  ⚠ 이 모듈은 fetch 를 그대로 쓰므로 클라이언트 import 금지.
 *    클라이언트는 /api/kbo/today 또는 /api/kbo/standings 호출.
 */

import { TODAY_GAMES, type Game, type GameResult } from "@/lib/games";
import { STANDINGS, type StandingRow } from "@/config/standings";

const NAVER_BASE = "https://api-gw.sports.naver.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 GroundBot/1.0";

/** 네이버 팀코드 → 우리 내부 teamId (소문자 기준) */
const NAVER_TEAM_MAP: Record<string, string> = {
  LG: "lg",
  OB: "doosan", // 두산 (구 OB 베어스 코드 그대로)
  HT: "kia",
  HH: "hanwha",
  WO: "kiwoom",
  LT: "lotte",
  NC: "nc",
  SK: "ssg", // SK 와이번스 → SSG 인수 후에도 SK 코드 유지되는 케이스
  SS: "samsung",
  KT: "kt",
};

/** 네이버 statusCode → 내부 단순화 */
type LiveStatus = "BEFORE" | "LIVE" | "RESULT" | "CANCEL" | "OTHER";
function normalizeStatus(code: string | undefined): LiveStatus {
  switch ((code ?? "").toUpperCase()) {
    case "BEFORE":
    case "READY":
      return "BEFORE";
    case "STARTED":
    case "PLAYING":
    case "LIVE":
      return "LIVE";
    case "RESULT":
    case "FINISH":
    case "ENDED":
      return "RESULT";
    case "CANCEL":
    case "POSTPONED":
    case "CANCELLED":
      return "CANCEL";
    default:
      return "OTHER";
  }
}

export type LiveGame = Game & {
  /** 라이브 상태 — UI 의 '경기 전 / 경기 중 / 종료 / 우천 취소' 분기 */
  status: LiveStatus;
};

/** YYYY-MM-DD (KST) — 서버 시간이 어디든 한국 캘린더 기준으로 고정 */
export function todayKstDate(d: Date = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** 선발 투수 안전 변환 — 빈 값 / "미정" / "未定" 류는 모두 null 로 정규화 */
export function safeStarter(name?: string | null): string | null {
  if (name == null) return null;
  const t = String(name).trim();
  if (!t) return null;
  if (t === "미정" || t === "未定" || t === "TBD" || t === "?" || t === "-") return null;
  return t;
}

/** 선발 투수 라벨 — UI 노출용 ("선발: 김광현" / "선발: 미정") */
export function starterLabel(name?: string | null): string {
  const safe = safeStarter(name);
  return safe ?? "미정";
}

// ────────────────────────────────────────────────────────────────────
// 네이버 어댑터 — 일정/스코어/선발
// ────────────────────────────────────────────────────────────────────

type NaverScheduleGame = {
  gameId?: string;
  gameDate?: string;        // YYYYMMDD
  gameDateTime?: string;    // ISO
  gtime?: string;           // HH:mm
  homeTeamCode?: string;
  awayTeamCode?: string;
  stadium?: string;
  statusCode?: string;
  homeStarterName?: string;
  awayStarterName?: string;
  homeCurrentPitcherName?: string;
  awayCurrentPitcherName?: string;
  homeTeamScore?: number;
  awayTeamScore?: number;
  winner?: "HOME" | "AWAY" | "DRAW" | string;
  winningPitcherName?: string;
  losingPitcherName?: string;
  savePitcherName?: string;
};

function adaptNaverGame(raw: NaverScheduleGame, fallbackDate: string): LiveGame | null {
  const homeId = NAVER_TEAM_MAP[(raw.homeTeamCode ?? "").toUpperCase()];
  const awayId = NAVER_TEAM_MAP[(raw.awayTeamCode ?? "").toUpperCase()];
  if (!homeId || !awayId) return null;

  const status = normalizeStatus(raw.statusCode);
  const dateRaw = raw.gameDate ?? "";
  const date =
    dateRaw.length === 8
      ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
      : raw.gameDateTime?.slice(0, 10) ?? fallbackDate;
  const time =
    raw.gtime ??
    (raw.gameDateTime ? raw.gameDateTime.slice(11, 16) : "00:00");

  let result: GameResult | undefined;
  if (
    status === "RESULT" &&
    typeof raw.homeTeamScore === "number" &&
    typeof raw.awayTeamScore === "number"
  ) {
    let winnerId: string | null = null;
    if (raw.winner === "HOME") winnerId = homeId;
    else if (raw.winner === "AWAY") winnerId = awayId;
    else if (raw.homeTeamScore > raw.awayTeamScore) winnerId = homeId;
    else if (raw.awayTeamScore > raw.homeTeamScore) winnerId = awayId;
    result = {
      homeScore: raw.homeTeamScore,
      awayScore: raw.awayTeamScore,
      winnerId,
      winningPitcher: safeStarter(raw.winningPitcherName) ?? undefined,
      losingPitcher: safeStarter(raw.losingPitcherName) ?? undefined,
      savePitcher: safeStarter(raw.savePitcherName) ?? undefined,
    };
  }

  return {
    id: raw.gameId ?? `${date}-${awayId}-${homeId}`,
    date,
    time,
    awayId,
    homeId,
    stadium: raw.stadium ?? "",
    awayPitcher: safeStarter(raw.awayStarterName) ?? "미정",
    homePitcher: safeStarter(raw.homeStarterName) ?? "미정",
    result,
    status,
  };
}

/**
 * 임의 날짜 범위(KST) 의 KBO 경기. 단일 라이브 fetcher.
 *  - fromDate / toDate 는 YYYY-MM-DD (포함). 동일 날짜면 단일일치 호출과 동일.
 *  - 라이브가 죽으면 throw (상위에서 결정해라). 단일 day fetch 는 별도 함수에서 정적 폴백.
 */
async function fetchKboGamesRange(
  fromDate: string,
  toDate: string
): Promise<LiveGame[]> {
  // size 미지정 시 Naver 가 10건만 페이지네이션해서 돌려준다 (gameTotalCount 와 별개).
  // 9일치(D-7~D+1) ≈ 최대 45경기라 size=200 으로 한 번에 전부 수신.
  const url =
    `${NAVER_BASE}/schedule/games` +
    `?fields=basic,statusInfo,homeStarter,awayStarter,winningPitcher,losingPitcher` +
    `&upperCategoryId=kbaseball&categoryId=kbo` +
    `&fromDate=${fromDate}&toDate=${toDate}&size=200`;
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "application/json",
      referer: "https://m.sports.naver.com/",
    },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`naver schedule HTTP ${res.status}`);
  const json = (await res.json()) as {
    result?: { games?: NaverScheduleGame[] };
  };
  const raw = json?.result?.games ?? [];
  const games = raw
    .map((g) => adaptNaverGame(g, fromDate))
    .filter((g): g is LiveGame => Boolean(g));
  if (games.length === 0) throw new Error("naver returned 0 games");
  return games;
}

/**
 * 오늘(KST) 의 KBO 경기 리스트.
 *  - 1차: 네이버 schedule API
 *  - 실패 / 0건 시: 정적 TODAY_GAMES 폴백 (status 는 BEFORE 로 표기)
 */
export async function fetchKboTodayGames(date?: string): Promise<LiveGame[]> {
  const target = date ?? todayKstDate();
  try {
    return await fetchKboGamesRange(target, target);
  } catch (err) {
    console.warn(
      `[kbo] live games fetch failed (${(err as Error).message}); falling back to static TODAY_GAMES`
    );
    return TODAY_GAMES.map((g) => ({ ...g, status: "BEFORE" as LiveStatus }));
  }
}

/** ISO YYYY-MM-DD 에 day 만큼 더한 KST 날짜 */
export function addDaysKst(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10));
  const t = Date.UTC(y, m - 1, d) + days * 86400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export type ScheduleBundle = {
  /** 기준일(=오늘 KST) */
  date: string;
  /** 지난 7일(D-7~D-1), 오래된 → 최신 */
  past: LiveGame[];
  /** 오늘 경기 */
  today: LiveGame[];
  /** 내일 경기 (D+1) */
  tomorrow: LiveGame[];
  /** 모레 ~ D+6 (UI 에서 미래 일정 스크롤) */
  upcoming: LiveGame[];
  /** 라이브 fetch 실패 시 true */
  fallback: boolean;
};

/**
 * Schedule 탭용 통합 fetch — D-7 ~ D+6 한 방.
 *  - 1차: 네이버 range 쿼리 (단일 호출, size=200 으로 14일치 ≈ 70경기 커버)
 *  - 실패: 정적 PAST/TODAY/TOMORROW 폴백 (upcoming 은 비움) + fallback=true
 */
export async function fetchKboSchedule(today?: string): Promise<ScheduleBundle> {
  const base = today ?? todayKstDate();
  const from = addDaysKst(base, -7);
  const to = addDaysKst(base, +6);
  const tomorrowDate = addDaysKst(base, +1);
  const sortByDateTime = (a: LiveGame, b: LiveGame) =>
    a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date);
  try {
    const all = await fetchKboGamesRange(from, to);
    const past = all.filter((g) => g.date < base).sort(sortByDateTime);
    const today_ = all
      .filter((g) => g.date === base)
      .sort((a, b) => a.time.localeCompare(b.time));
    const tomorrow = all
      .filter((g) => g.date === tomorrowDate)
      .sort((a, b) => a.time.localeCompare(b.time));
    const upcoming = all.filter((g) => g.date > tomorrowDate).sort(sortByDateTime);
    // 라이브가 살아있는 한 빈 날(월요일·휴식일)은 빈 배열로 정직하게 반환.
    return {
      date: base,
      past,
      today: today_,
      tomorrow,
      upcoming,
      fallback: false,
    };
  } catch (err) {
    console.warn(
      `[kbo] schedule fetch failed (${(err as Error).message}); falling back to static`
    );
    const { PAST_GAMES, TODAY_GAMES, TOMORROW_GAMES } = await import(
      "@/lib/games"
    );
    const stamp = (g: import("@/lib/games").Game): LiveGame => ({
      ...g,
      status: g.result ? "RESULT" : "BEFORE",
    });
    return {
      date: base,
      past: PAST_GAMES.map(stamp),
      today: TODAY_GAMES.map(stamp),
      tomorrow: TOMORROW_GAMES.map(stamp),
      upcoming: [],
      fallback: true,
    };
  }
}

// ────────────────────────────────────────────────────────────────────
// 순위표 — 시즌 전체 일정에서 직접 derive (네이버 ranking 엔드포인트가 404)
// ────────────────────────────────────────────────────────────────────

/**
 * KBO 정규시즌 개막일 (KST). 시범경기를 제외하기 위한 기준.
 *  - 매년 3월 말 개막. 2026 시즌은 3/22 개막 (네이버 일정 기준).
 *  - 새 시즌엔 이 값만 갱신하면 됨.
 */
const KBO_SEASON_OPENER: Record<number, string> = {
  2026: "2026-03-22",
};

function seasonOpenerForYear(year: number): string {
  return KBO_SEASON_OPENER[year] ?? `${year}-03-22`;
}

/**
 * 시즌 전체(1/1~12/31) 일정 → size=1000 한 방으로 가져옴 (KBO 시즌 ≈ 720경기).
 * 5분 캐시.
 */
async function fetchKboSeasonGames(year: number): Promise<LiveGame[]> {
  const url =
    `${NAVER_BASE}/schedule/games` +
    `?fields=basic,statusInfo` +
    `&upperCategoryId=kbaseball&categoryId=kbo` +
    `&fromDate=${year}-01-01&toDate=${year}-12-31&size=1000`;
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "application/json",
      referer: "https://m.sports.naver.com/",
    },
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`naver season HTTP ${res.status}`);
  const json = (await res.json()) as {
    result?: { games?: NaverScheduleGame[] };
  };
  const raw = json?.result?.games ?? [];
  const games = raw
    .map((g) => adaptNaverGame(g, `${year}-01-01`))
    .filter((g): g is LiveGame => Boolean(g));
  return games;
}

/**
 * 정규시즌 결과(RESULT) 만 필터링 → 팀별 W/L/D/streak 누적 → 순위 계산.
 *  - 승률(winRate) = W / (W+L)  · 무승부 제외 (KBO 공식)
 *  - 게임차(GB) = ((1위.W - 본인.W) + (본인.L - 1위.L)) / 2
 *  - 정렬: 승률 desc → 승수 desc
 *  - 최근 연속(streak): 최근 5경기 결과 문자열 (예: "WWLWW")
 */
function deriveStandingsFromGames(games: LiveGame[]): StandingRow[] {
  type Stat = {
    wins: number;
    losses: number;
    draws: number;
    /** 시간순 결과 — 마지막 5개를 streak 로 노출 */
    recent: ("W" | "L" | "D")[];
  };
  const stats = new Map<string, Stat>();
  for (const teamId of Object.values(NAVER_TEAM_MAP)) {
    if (!stats.has(teamId)) {
      stats.set(teamId, { wins: 0, losses: 0, draws: 0, recent: [] });
    }
  }
  // 시간 오름차순 — recent 가 자연스럽게 시간 순서
  const finished = games
    .filter((g) => g.status === "RESULT" && g.result)
    .sort((a, b) =>
      a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)
    );
  for (const g of finished) {
    const r = g.result!;
    const home = stats.get(g.homeId);
    const away = stats.get(g.awayId);
    if (!home || !away) continue;
    if (r.winnerId == null) {
      home.draws++;
      away.draws++;
      home.recent.push("D");
      away.recent.push("D");
    } else if (r.winnerId === g.homeId) {
      home.wins++;
      away.losses++;
      home.recent.push("W");
      away.recent.push("L");
    } else {
      away.wins++;
      home.losses++;
      away.recent.push("W");
      home.recent.push("L");
    }
  }
  const rows: StandingRow[] = [];
  for (const [teamId, s] of stats.entries()) {
    const decided = s.wins + s.losses;
    const winRate = decided === 0 ? 0 : s.wins / decided;
    rows.push({
      rank: 0,
      teamId,
      games: s.wins + s.losses + s.draws,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      winRate,
      gamesBehind: 0,
      streak: s.recent.slice(-5).join("") || "—",
    });
  }
  rows.sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.wins - a.wins;
  });
  rows.forEach((r, i) => (r.rank = i + 1));
  if (rows.length > 0) {
    const top = rows[0];
    for (const r of rows) {
      r.gamesBehind = (top.wins - r.wins + (r.losses - top.losses)) / 2;
    }
  }
  return rows;
}

/** KBO 정규시즌 순위. 네이버 schedule 일정 → 결과 누적 derive. 실패 시 정적 STANDINGS. */
export async function fetchKboStandings(): Promise<StandingRow[]> {
  try {
    const year = parseInt(todayKstDate().slice(0, 4), 10);
    const all = await fetchKboSeasonGames(year);
    const opener = seasonOpenerForYear(year);
    const regular = all.filter((g) => g.date >= opener);
    const rows = deriveStandingsFromGames(regular);
    if (rows.length === 0) throw new Error("derived 0 rows");
    return rows;
  } catch (err) {
    console.warn(
      `[kbo] standings derive failed (${(err as Error).message}); falling back to static STANDINGS`
    );
    return STANDINGS;
  }
}

// ────────────────────────────────────────────────────────────────────
// 헬퍼 — UI / 프롬프트 양쪽에서 공유
// ────────────────────────────────────────────────────────────────────

/** teamId 의 오늘 경기 1건 + 이 팀이 home/away 어느 쪽인지 */
export type TeamGameView = {
  game: LiveGame;
  side: "home" | "away";
  /** 이 팀의 선발 투수 (있으면 이름, 없으면 null) */
  starter: string | null;
  /** 상대 팀 id */
  opponentId: string;
  /** 이 팀의 스코어 (RESULT 시) */
  myScore: number | null;
  /** 상대 스코어 (RESULT 시) */
  oppScore: number | null;
  /** 승리 확정 여부 (RESULT && winnerId === teamId) */
  isWinner: boolean;
  /** 무승부 (RESULT && winnerId === null) */
  isDraw: boolean;
};

export function getTeamGame(games: LiveGame[], teamId: string): TeamGameView | null {
  const id = teamId.toLowerCase();
  const g = games.find((x) => x.homeId === id || x.awayId === id);
  if (!g) return null;
  const side: "home" | "away" = g.homeId === id ? "home" : "away";
  const starter = safeStarter(side === "home" ? g.homePitcher : g.awayPitcher);
  const opponentId = side === "home" ? g.awayId : g.homeId;
  const myScore =
    g.result == null ? null : side === "home" ? g.result.homeScore : g.result.awayScore;
  const oppScore =
    g.result == null ? null : side === "home" ? g.result.awayScore : g.result.homeScore;
  const isWinner = g.result?.winnerId != null && g.result.winnerId === id;
  const isDraw = g.result != null && g.result.winnerId == null;
  return { game: g, side, starter, opponentId, myScore, oppScore, isWinner, isDraw };
}

/** standings 에서 teamId 의 순위 추출. 없으면 null. */
export function getTeamRank(rows: StandingRow[], teamId: string): StandingRow | null {
  const id = teamId.toLowerCase();
  return rows.find((r) => r.teamId === id) ?? null;
}
