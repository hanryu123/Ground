import { Prisma } from "@prisma/client";
import { sendApnsSilentMulticast } from "@/lib/apns";
import { resolveServerAppEnv } from "@/lib/appEnv";
import { mapWithConcurrency } from "@/lib/concurrency";
import { isTopicEnabled, matchesCurrentPushEnv } from "@/lib/notifications/topics";
import { prisma } from "@/lib/prisma";
import type { LiveScoreGame } from "@/lib/score/types";
import { findTeam } from "@/lib/teams";
import { markDispatchOnce } from "@/services/notificationService";

type NativeLiveActivityStartToken = {
  token: string;
  topics: unknown;
  appEnv: string | null;
};

type LiveActivityStagePayload = {
  gameId: string;
  teamId: string;
  homeTeam: string;
  awayTeam: string;
  stadium: string | null;
  gameStartEpochMs: number | null;
  phase: "PRE" | "LIVE" | "FINAL" | "CANCEL";
  status: string;
  inning: string;
  homeScore: number;
  awayScore: number;
  resultLabel: string | null;
  winningPitcher: string | null;
  losingPitcher: string | null;
  updatedAtEpochMs: number;
  subscribeUrl: string;
};

type AutoStartResult = {
  sent: number;
  disabled: number;
  skipped: number;
  targets: number;
};

const MIN_PREGAME_MS = 30 * 60 * 1000;
const MAX_PREGAME_MS = 60 * 60 * 1000;

function matchesNativePushEnv(topics: unknown, appEnv: string | null): boolean {
  if (matchesCurrentPushEnv(topics)) return true;
  if (!topics || typeof topics !== "object") {
    return matchesCurrentPushEnv({ appEnv });
  }
  return matchesCurrentPushEnv({ ...(topics as Record<string, unknown>), appEnv });
}

function isPregameAutoStartWindow(game: LiveScoreGame, now: Date): boolean {
  if (game.status !== "BEFORE" || !game.gameDate) return false;
  const msUntilStart = game.gameDate.getTime() - now.getTime();
  return msUntilStart >= MIN_PREGAME_MS && msUntilStart <= MAX_PREGAME_MS;
}

function buildStagePayload(input: {
  game: LiveScoreGame;
  teamId: string;
  origin: string;
}): LiveActivityStagePayload {
  return {
    gameId: input.game.externalId,
    teamId: input.teamId,
    homeTeam: findTeam(input.game.homeTeam).short,
    awayTeam: findTeam(input.game.awayTeam).short,
    stadium: null,
    gameStartEpochMs: input.game.gameDate?.getTime() ?? null,
    phase: "PRE",
    status: "경기 전",
    inning: input.game.gameDate
      ? new Intl.DateTimeFormat("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Asia/Seoul",
        }).format(input.game.gameDate)
      : "경기 전",
    homeScore: input.game.homeScore,
    awayScore: input.game.awayScore,
    resultLabel: null,
    winningPitcher: null,
    losingPitcher: null,
    updatedAtEpochMs: Date.now(),
    subscribeUrl: new URL("/api/live-activity/subscribe", input.origin).toString(),
  };
}

async function fetchTargetTokens(teamId: string): Promise<NativeLiveActivityStartToken[]> {
  const rows = await prisma.nativePushToken.findMany({
    where: {
      enabled: true,
      platform: "ios",
      favoriteTeam: teamId,
      appEnv: resolveServerAppEnv(),
    },
    select: {
      token: true,
      topics: true,
      appEnv: true,
    },
  });
  return (rows as NativeLiveActivityStartToken[]).filter(
    (row) =>
      matchesNativePushEnv(row.topics, row.appEnv) &&
      isTopicEnabled(row.topics, "score")
  );
}

async function sendAutoStartForTeam(input: {
  game: LiveScoreGame;
  teamId: string;
  origin: string;
  targetDate: string;
}): Promise<AutoStartResult> {
  const tokens = await fetchTargetTokens(input.teamId);
  if (tokens.length === 0) {
    return { sent: 0, disabled: 0, skipped: 1, targets: 0 };
  }

  const locked = await markDispatchOnce({
    alertKind: "live-activity-start",
    teamScope: input.teamId,
    eventKey: `${input.targetDate}:${input.game.externalId}:live-activity-start`,
    gameExternalId: input.game.externalId,
    payload: {
      gameId: input.game.externalId,
      teamId: input.teamId,
      targetCount: tokens.length,
      appEnv: resolveServerAppEnv(),
    } as Prisma.InputJsonValue,
  });

  if (!locked) {
    return { sent: 0, disabled: 0, skipped: 1, targets: tokens.length };
  }

  const result = await sendApnsSilentMulticast({
    tokens: tokens.map((row) => row.token),
    payload: {
      ground: {
        kind: "live-activity-start",
        payload: buildStagePayload(input),
      },
    },
  });

  if (result.failed.length > 0) {
    await prisma.nativePushToken.updateMany({
      where: { token: { in: result.failed }, enabled: true },
      data: { enabled: false },
    });
  }

  return {
    sent: result.ok,
    disabled: result.failed.length,
    skipped: 0,
    targets: tokens.length,
  };
}

export async function sendPregameLiveActivityStarts(input: {
  games: LiveScoreGame[];
  origin: string;
  targetDate: string;
  now?: Date;
}): Promise<AutoStartResult> {
  const now = input.now ?? new Date();
  const jobs = input.games
    .filter((game) => isPregameAutoStartWindow(game, now))
    .flatMap((game) => [
      { game, teamId: game.homeTeam },
      { game, teamId: game.awayTeam },
    ]);

  if (jobs.length === 0) {
    return { sent: 0, disabled: 0, skipped: 0, targets: 0 };
  }

  const results = await mapWithConcurrency(jobs, 4, (job) =>
    sendAutoStartForTeam({
      ...job,
      origin: input.origin,
      targetDate: input.targetDate,
    })
  );

  return results.reduce<AutoStartResult>(
    (acc, item) => ({
      sent: acc.sent + item.sent,
      disabled: acc.disabled + item.disabled,
      skipped: acc.skipped + item.skipped,
      targets: acc.targets + item.targets,
    }),
    { sent: 0, disabled: 0, skipped: 0, targets: 0 }
  );
}
