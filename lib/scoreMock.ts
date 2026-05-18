export type MockScoreGame = {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: "BEFORE" | "LIVE" | "RESULT" | "CANCEL";
  gameDate: Date;
};

/**
 * TODO: 추후 실제 스코어 API 연동으로 교체.
 * 현재는 크론 점검을 위한 mock 스냅샷을 분 단위로 가볍게 변형한다.
 */
export async function fetchMockScoreSnapshot(now: Date = new Date()): Promise<MockScoreGame[]> {
  const tick = Math.floor(now.getTime() / 60_000) % 4;
  const resolvedTick = tick;
  const scoreByTick: Array<{ home: number; away: number }> = [
    { home: 0, away: 0 },
    { home: 1, away: 0 },
    { home: 1, away: 1 },
    { home: 2, away: 1 },
  ];
  const score = scoreByTick[resolvedTick];
  const gameDate = new Date(now);
  gameDate.setHours(18, 30, 0, 0);

  return [
    {
      externalId: "mock-2026-lg-doosan",
      homeTeam: "doosan",
      awayTeam: "lg",
      homeScore: score.home,
      awayScore: score.away,
      status: "LIVE",
      gameDate,
    },
  ];
}

export async function fetchMockScoreSnapshotByTick(
  tickOverride: number,
  now: Date = new Date()
): Promise<MockScoreGame[]> {
  const scoreByTick: Array<{ home: number; away: number }> = [
    { home: 0, away: 0 },
    { home: 1, away: 0 },
    { home: 1, away: 1 },
    { home: 2, away: 1 },
  ];
  const normalized = Math.abs(Math.floor(tickOverride)) % scoreByTick.length;
  const score = scoreByTick[normalized];
  const gameDate = new Date(now);
  gameDate.setHours(18, 30, 0, 0);

  return [
    {
      externalId: "mock-2026-lg-doosan",
      homeTeam: "doosan",
      awayTeam: "lg",
      homeScore: score.home,
      awayScore: score.away,
      status: "LIVE",
      gameDate,
    },
  ];
}
