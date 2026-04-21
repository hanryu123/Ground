/**
 * KBO 정규시즌 순위 — 목업 데이터.
 *
 *  - `teamId` 는 lib/teams.ts 의 id 와 1:1 매칭 (소문자, "lg", "doosan" …)
 *  - 추후 실시간 API 연동 시 이 모듈을 fetch wrapper 로 교체하면 된다.
 *  - 화면(드로어) 표시 항목: 순위 / 팀명 / W-L-D / 승률 / 게임차 / 최근 연승·연패
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
  /** 최근 5경기 흐름 — "5W" / "2L" / "1W4L" 등 자유 문자열 */
  streak: string;
};

/**
 * 2026 시즌 가상 순위 (디자인 검수용 목업).
 * 1위는 작년 우승팀 KIA, 그 다음으로 라이온즈/트윈스 강세 가정.
 */
export const STANDINGS: StandingRow[] = [
  {
    rank: 1,
    teamId: "kia",
    games: 12,
    wins: 9,
    losses: 3,
    draws: 0,
    winRate: 0.75,
    gamesBehind: 0,
    streak: "4W",
  },
  {
    rank: 2,
    teamId: "samsung",
    games: 12,
    wins: 8,
    losses: 4,
    draws: 0,
    winRate: 0.667,
    gamesBehind: 1,
    streak: "2W",
  },
  {
    rank: 3,
    teamId: "lg",
    games: 13,
    wins: 8,
    losses: 5,
    draws: 0,
    winRate: 0.615,
    gamesBehind: 1.5,
    streak: "1W",
  },
  {
    rank: 4,
    teamId: "doosan",
    games: 12,
    wins: 7,
    losses: 5,
    draws: 0,
    winRate: 0.583,
    gamesBehind: 2,
    streak: "3W",
  },
  {
    rank: 5,
    teamId: "kt",
    games: 12,
    wins: 6,
    losses: 5,
    draws: 1,
    winRate: 0.545,
    gamesBehind: 2.5,
    streak: "1L",
  },
  {
    rank: 6,
    teamId: "ssg",
    games: 13,
    wins: 6,
    losses: 7,
    draws: 0,
    winRate: 0.462,
    gamesBehind: 3.5,
    streak: "2L",
  },
  {
    rank: 7,
    teamId: "lotte",
    games: 12,
    wins: 5,
    losses: 7,
    draws: 0,
    winRate: 0.417,
    gamesBehind: 4,
    streak: "1W",
  },
  {
    rank: 8,
    teamId: "hanwha",
    games: 12,
    wins: 5,
    losses: 7,
    draws: 0,
    winRate: 0.417,
    gamesBehind: 4,
    streak: "1L",
  },
  {
    rank: 9,
    teamId: "nc",
    games: 12,
    wins: 4,
    losses: 7,
    draws: 1,
    winRate: 0.364,
    gamesBehind: 4.5,
    streak: "3L",
  },
  {
    rank: 10,
    teamId: "kiwoom",
    games: 12,
    wins: 4,
    losses: 8,
    draws: 0,
    winRate: 0.333,
    gamesBehind: 5,
    streak: "2L",
  },
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
