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
  /** 내일 경기 */
  tomorrow: LiveGame[];
  /** 라이브 fetch 실패 시 true */
  fallback: boolean;
};

/**
 * Schedule 탭용 통합 fetch — D-7 ~ D+1 한 방.
 *  - 1차: 네이버 range 쿼리 (단일 호출로 9일치)
 *  - 실패: 정적 PAST/TODAY/TOMORROW 폴백 + fallback=true 표시
 */
export async function fetchKboSchedule(today?: string): Promise<ScheduleBundle> {
  const base = today ?? todayKstDate();
  const from = addDaysKst(base, -7);
  const to = addDaysKst(base, +1);
  try {
    const all = await fetchKboGamesRange(from, to);
    const past = all
      .filter((g) => g.date < base)
      .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
    const today_ = all
      .filter((g) => g.date === base)
      .sort((a, b) => a.time.localeCompare(b.time));
    const tomorrow = all
      .filter((g) => g.date > base)
      .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
    // 라이브가 살아있는 한 today/tomorrow 가 비어있어도 그대로 빈 배열 반환.
    // (월요일·올스타 휴식 등 정상적으로 경기가 없는 날을 정적 mock 으로 채우면
    //  TODAY 뱃지가 stale 한 과거 날짜에 박혀서 anchor·라벨이 다 깨진다.)
    return {
      date: base,
      past,
      today: today_,
      tomorrow,
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
      fallback: true,
    };
  }
}

// ────────────────────────────────────────────────────────────────────
// 네이버 어댑터 — 순위표
// ────────────────────────────────────────────────────────────────────

type NaverRankingRow = {
  rank?: number;
  teamCode?: string;
  gameCount?: number;
  win?: number;
  lose?: number;
  drawn?: number;
  wra?: number;        // 승률 0~1
  gameBehind?: number;
  recentGameResult?: string; // "WLWLW"
};

function adaptNaverRanking(raw: NaverRankingRow): StandingRow | null {
  const teamId = NAVER_TEAM_MAP[(raw.teamCode ?? "").toUpperCase()];
  if (!teamId) return null;
  const recent = (raw.recentGameResult ?? "").toUpperCase().slice(-5);
  return {
    rank: raw.rank ?? 0,
    teamId,
    games: raw.gameCount ?? 0,
    wins: raw.win ?? 0,
    losses: raw.lose ?? 0,
    draws: raw.drawn ?? 0,
    winRate: typeof raw.wra === "number" ? raw.wra : 0,
    gamesBehind: typeof raw.gameBehind === "number" ? raw.gameBehind : 0,
    streak: recent || "—",
  };
}

/** KBO 정규시즌 순위. 네이버 우선 → 실패 시 정적 STANDINGS 폴백. */
export async function fetchKboStandings(): Promise<StandingRow[]> {
  try {
    const seasonCode = String(new Date().getFullYear());
    const url =
      `${NAVER_BASE}/team/rankings` +
      `?categoryId=kbo&seasonCode=${seasonCode}&type=jjasica`;
    const res = await fetch(url, {
      headers: {
        "user-agent": UA,
        accept: "application/json",
        referer: "https://m.sports.naver.com/",
      },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`naver standings HTTP ${res.status}`);
    const json = (await res.json()) as {
      result?: { teams?: NaverRankingRow[] };
    };
    const rows = (json?.result?.teams ?? [])
      .map(adaptNaverRanking)
      .filter((r): r is StandingRow => Boolean(r));
    if (rows.length === 0) throw new Error("naver standings returned 0");
    rows.sort((a, b) => a.rank - b.rank);
    return rows;
  } catch (err) {
    console.warn(
      `[kbo] standings fetch failed (${(err as Error).message}); falling back to static STANDINGS`
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
