import { findTeam } from "@/lib/teams";
import { mapWithConcurrency } from "@/lib/concurrency";
import {
  markDispatchOnce,
  sendTeamTopicNotification,
} from "@/services/notificationService";
import type { LiveScoreGame } from "@/lib/score/types";

/**
 * 게임이 BEFORE/LIVE/SUSPENDED → CANCEL 로 바뀌었거나, 스냅샷에서 처음 CANCEL 로 들어온 경우
 * 양 팀 팬에게 우천/취소 알림을 1회 발송한다.
 *
 * wasMidGame=true 이면 경기 중 중단 후 취소된 케이스 — 스코어를 포함하고 다른 본문을 사용한다.
 */
export async function sendCancelAlerts(input: {
  game: LiveScoreGame;
  targetDate: string;
  origin: string;
  wasMidGame?: boolean;
}): Promise<{ sent: number; disabled: number; inboxCreated: number; skipped: number }> {
  const teamIds: string[] = [input.game.homeTeam, input.game.awayTeam];
  let sent = 0;
  let disabled = 0;
  let inboxCreated = 0;
  let skipped = 0;

  await mapWithConcurrency(teamIds, 2, async (teamId) => {
    const lock = await markDispatchOnce({
      alertKind: "cancel",
      teamScope: teamId,
      eventKey: `${input.targetDate}:${input.game.externalId}:cancel`,
      gameExternalId: input.game.externalId,
    });
    if (!lock) {
      skipped += 1;
      return;
    }
    const isHomeFan = teamId === input.game.homeTeam;
    const myTeam = findTeam(teamId);
    const oppTeam = findTeam(isHomeFan ? input.game.awayTeam : input.game.homeTeam);
    const myScore = isHomeFan ? input.game.homeScore : input.game.awayScore;
    const oppScore = isHomeFan ? input.game.awayScore : input.game.homeScore;
    const cancelLabel = input.game.cancelReason === "RAIN" ? "우천취소" : "경기 취소";

    let title: string;
    let body: string;
    if (input.wasMidGame) {
      // 경기 진행 중 중단 → 최종 취소
      title = `🌧️ ${myTeam.short} 경기 우천 취소`;
      body =
        input.game.cancelReason === "RAIN"
          ? `중단 시점 ${myTeam.short} ${myScore}:${oppScore} ${oppTeam.short}. 우천으로 경기가 취소되었습니다. 다음 경기를 기약합시다.`
          : `중단 시점 ${myTeam.short} ${myScore}:${oppScore} ${oppTeam.short}. 오늘 경기가 취소되었습니다.`;
    } else {
      title = `🌧️ ${myTeam.short} ${cancelLabel}`;
      body =
        input.game.cancelReason === "RAIN"
          ? `오늘 ${oppTeam.short}전 우천취소. 로테이션은 아끼고 내일 제대로 가자.`
          : `오늘 ${oppTeam.short}전 취소.`;
    }

    const result = await sendTeamTopicNotification({
      teamId,
      topicKey: "pitcher",
      title,
      body,
      url: "/today",
      payload: {
        kind: "game-cancel",
        externalId: input.game.externalId,
        homeTeam: input.game.homeTeam,
        awayTeam: input.game.awayTeam,
        teamId,
        cancelReason: input.game.cancelReason ?? "OTHER",
      },
      type: "SYSTEM",
      origin: input.origin,
    });
    sent += result.sent;
    disabled += result.disabled;
    inboxCreated += result.inboxCreated;
  });

  return { sent, disabled, inboxCreated, skipped };
}
