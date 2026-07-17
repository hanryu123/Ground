export type ScorePair = {
  homeScore: number;
  awayScore: number;
};

export function isScoreRegression(
  current: ScorePair,
  previous: ScorePair | null | undefined,
): boolean {
  if (!previous) return false;
  return current.homeScore < previous.homeScore || current.awayScore < previous.awayScore;
}

export function mergeNonRegressingScore<T extends ScorePair>(
  current: T,
  previous: ScorePair | null | undefined,
): { score: T; didMerge: boolean } {
  if (!previous || !isScoreRegression(current, previous)) {
    return { score: current, didMerge: false };
  }

  return {
    score: {
      ...current,
      homeScore: Math.max(current.homeScore, previous.homeScore),
      awayScore: Math.max(current.awayScore, previous.awayScore),
    } as T,
    didMerge: true,
  };
}
