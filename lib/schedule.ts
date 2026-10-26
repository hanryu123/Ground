/**
 * Games 탭(스와이프 캘린더) 데이터 — 서버 전용.
 *
 *  - 월 단위: fetchKboSeasonGames(year) 를 그대로 쓰고 월로 잘라 준다 (시즌 일정은 5분 캐시).
 *    주간 스트립 점·월 달력·빈 날 "가장 가까운 경기일" 계산용이라 가벼운 필드만 있다.
 *  - 하루 단위: 고른 날짜의 경기만 상세(선발·구장·승패 투수) 까지 채운다.
 *    시즌 일정 목록 API 엔 선발·구장·승패 투수가 안 내려오고, 경기 상세 엔드포인트에만 있다.
 */

import {
  fetchKboSeasonGames,
  fetchKboTodayGames,
  fetchSeasonStatus,
  safeStarter,
  todayKstDate,
  type LiveGame,
} from "@/lib/kbo";
import { highlightUrlForFinishedGame } from "@/lib/games";
import { NAVER_BASE } from "@/lib/naverApi";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export type MonthGamesPayload = {
  month: string;
  /** 오늘 (KST) */
  today: string;
  games: LiveGame[];
  /** 그 해 경기가 있는 날 전부 (오름차순) — 월 경계를 넘는 "가장 가까운 경기일" 계산용 */
  seasonDates: string[];
  /** 그 해 시즌이 끝났는지 (지난해는 항상 true, 올해는 한국시리즈까지 끝났을 때) */
  seasonOver: boolean;
  /** 그 해 일정이 아직 없을 때만 — 직전 시즌 마지막 경기일 */
  prevSeasonLastDate: string | null;
};

export type DayGamesPayload = {
  date: string;
  games: LiveGame[];
};

function sortByDateTime(a: LiveGame, b: LiveGame) {
  return a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date);
}

function withHighlight(g: LiveGame): LiveGame {
  if (!g.result || g.highlightUrl) return g;
  return { ...g, highlightUrl: highlightUrlForFinishedGame(g) };
}

async function seasonGamesSafe(year: number): Promise<LiveGame[]> {
  try {
    return await fetchKboSeasonGames(year);
  } catch (err) {
    console.warn(`[schedule] season ${year} fetch failed: ${(err as Error).message}`);
    return [];
  }
}

export async function fetchMonthGames(month: string): Promise<MonthGamesPayload> {
  const today = todayKstDate();
  const year = parseInt(month.slice(0, 4), 10);
  const season = await seasonGamesSafe(year);
  const games = season
    .filter((g) => g.date.startsWith(month))
    .sort(sortByDateTime)
    .map(withHighlight);
  const seasonDates = Array.from(new Set(season.map((g) => g.date))).sort();

  let seasonOver = false;
  const thisYear = parseInt(today.slice(0, 4), 10);
  if (year < thisYear) {
    seasonOver = true;
  } else if (year === thisYear && seasonDates.length > 0 && today > seasonDates[0]) {
    try {
      seasonOver = (await fetchSeasonStatus(today)).activeTeamIds.length === 0;
    } catch {
      seasonOver = false;
    }
  }

  let prevSeasonLastDate: string | null = null;
  if (seasonDates.length === 0) {
    const prev = await seasonGamesSafe(year - 1);
    prevSeasonLastDate = prev.reduce<string | null>(
      (max, g) => (max === null || g.date > max ? g.date : max),
      null
    );
  }

  return { month, today, games, seasonDates, seasonOver, prevSeasonLastDate };
}

type NaverGameDetail = {
  result?: {
    game?: {
      stadium?: string | null;
      homeStarterName?: string | null;
      awayStarterName?: string | null;
      winPitcherName?: string | null;
      losePitcherName?: string | null;
    };
  };
};

async function fetchGameDetail(gameId: string, past: boolean) {
  try {
    const res = await fetch(`${NAVER_BASE}/schedule/games/${gameId}`, {
      headers: {
        "user-agent": UA,
        accept: "application/json",
        referer: "https://m.sports.naver.com/",
      },
      // 지난 경기는 바뀔 일이 없어 길게 캐시
      next: { revalidate: past ? 3600 : 60 },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return ((await res.json()) as NaverGameDetail)?.result?.game ?? null;
  } catch {
    return null;
  }
}

/** 하루 경기 + 선발·구장·승패 투수 */
export async function fetchDayGames(date: string): Promise<DayGamesPayload> {
  const today = todayKstDate();
  let games = await fetchKboTodayGames(date, { includeLineups: false });
  if (games.length === 0) {
    // 하루 단위 라이브 조회가 실패하면 시즌 일정에서라도 꺼낸다
    const season = await seasonGamesSafe(parseInt(date.slice(0, 4), 10));
    games = season.filter((g) => g.date === date);
  }

  const details = await Promise.all(games.map((g) => fetchGameDetail(g.id, date < today)));
  const enriched = games.map((g, i) => {
    const d = details[i];
    if (!d) return withHighlight(g);
    const result = g.result
      ? {
          ...g.result,
          winningPitcher: g.result.winningPitcher ?? safeStarter(d.winPitcherName) ?? undefined,
          losingPitcher: g.result.losingPitcher ?? safeStarter(d.losePitcherName) ?? undefined,
        }
      : undefined;
    return withHighlight({
      ...g,
      stadium: d.stadium?.trim() || g.stadium,
      homePitcher: safeStarter(d.homeStarterName) ?? g.homePitcher,
      awayPitcher: safeStarter(d.awayStarterName) ?? g.awayPitcher,
      result,
    });
  });

  return { date, games: enriched.sort(sortByDateTime) };
}
