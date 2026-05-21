/**
 * KBO 정규시즌 순위 — 정적 폴백 데이터.
 *
 *  - 라이브 데이터 fetch 실패 시 이 값이 표시됨.
 *  - 실제 순위는 lib/kbo.ts fetchKboStandings() 에서
 *    koreabaseball.com → Naver API → 이 파일 순서로 소싱됨.
 *
 *  최종 업데이트: 2026-05-21 (KBO 공식 사이트 기준)
 */

export type StandingRow = {
  rank: number;
  teamId: string;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** 0~1, 무승부 제외 승률 */
  winRate: number;
  /** 1위와의 게임차. 1위는 0 */
  gamesBehind: number;
  /** 최근 흐름 — "2W" / "3L" 등 */
  streak: string;
};

export const STANDINGS: StandingRow[] = [
  { rank: 1, teamId: "samsung", games: 44, wins: 26, losses: 17, draws: 1, winRate: 0.605, gamesBehind: 0,   streak: "2W" },
  { rank: 2, teamId: "lg",      games: 44, wins: 26, losses: 18, draws: 0, winRate: 0.591, gamesBehind: 0.5, streak: "1W" },
  { rank: 3, teamId: "kt",      games: 44, wins: 25, losses: 18, draws: 1, winRate: 0.581, gamesBehind: 1,   streak: "2L" },
  { rank: 4, teamId: "ssg",     games: 45, wins: 22, losses: 22, draws: 1, winRate: 0.500, gamesBehind: 4.5, streak: "4L" },
  { rank: 4, teamId: "kia",     games: 45, wins: 22, losses: 22, draws: 1, winRate: 0.500, gamesBehind: 4.5, streak: "1L" },
  { rank: 4, teamId: "doosan",  games: 45, wins: 22, losses: 22, draws: 1, winRate: 0.500, gamesBehind: 4.5, streak: "4W" },
  { rank: 7, teamId: "hanwha",  games: 44, wins: 20, losses: 24, draws: 0, winRate: 0.455, gamesBehind: 6.5, streak: "3L" },
  { rank: 8, teamId: "lotte",   games: 43, wins: 18, losses: 24, draws: 1, winRate: 0.429, gamesBehind: 7.5, streak: "2W" },
  { rank: 9, teamId: "kiwoom",  games: 46, wins: 19, losses: 26, draws: 1, winRate: 0.422, gamesBehind: 8,   streak: "4W" },
  { rank: 10, teamId: "nc",     games: 44, wins: 18, losses: 25, draws: 1, winRate: 0.419, gamesBehind: 8,   streak: "3L" },
];

/** 승률을 .000 형식 문자열로 (".750", ".615") */
export function formatWinRate(r: number): string {
  return `.${Math.round(r * 1000)
    .toString()
    .padStart(3, "0")}`;
}

/** 게임차 표시 — 1위는 "—" (전각 대시), 0.5 단위까지. */
export function formatGamesBehind(gb: number): string {
  if (gb <= 0) return "—";
  return Number.isInteger(gb) ? `${gb}` : gb.toFixed(1);
}
