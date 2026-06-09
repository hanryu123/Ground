/**
 * `check-score` cron 파이프라인에서 공유하는 타입 정의.
 */

export type LiveScoreStatus = "BEFORE" | "LIVE" | "SUSPENDED" | "RESULT" | "CANCEL";
export type CancelReason = "RAIN" | "OTHER";

export type LiveScoreGame = {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  /** 네이버 statusInfo/currentInning 기반 현재 이닝. 알림 fallback 에서 회차 누락 방지용. */
  currentInning?: number | null;
  currentInningHalf?: "초" | "말" | null;
  currentInningLabel?: string | null;
  status: LiveScoreStatus;
  cancelReason: CancelReason | null;
  gameDate: Date | null;
};
