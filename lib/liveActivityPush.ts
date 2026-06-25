import { prisma } from "@/lib/prisma";
import {
  sendLiveActivityUpdate,
  type LiveActivityContentState,
} from "@/lib/apns";
import { resolveServerAppEnv } from "@/lib/appEnv";
import type { LiveScoreGame } from "@/lib/score/types";

type PushLiveActivityResult = {
  sent: number;
  failed: number;
  ended: number;
  subscriptions: number;
};

type LiveActivitySubscriptionRow = {
  id: string;
  token: string;
  teamId: string;
};

function resolvePhase(game: LiveScoreGame): LiveActivityContentState["phase"] {
  if (game.status === "RESULT") return "FINAL";
  if (game.status === "CANCEL") return "CANCEL";
  if (game.status === "BEFORE") return "PRE";
  return "LIVE";
}

function resolveStatus(game: LiveScoreGame): string {
  if (game.status === "RESULT") return "경기 종료";
  if (game.status === "CANCEL") return game.cancelReason === "RAIN" ? "우천 취소" : "경기 취소";
  if (game.status === "SUSPENDED") return "경기 중단";
  if (game.status === "BEFORE") return "경기 전";
  return "LIVE";
}

function resolveInning(game: LiveScoreGame): string {
  if (game.status === "RESULT") return "FINAL";
  if (game.status === "CANCEL") return game.cancelReason === "RAIN" ? "우천 취소" : "취소";
  if (game.status === "SUSPENDED") return game.currentInningLabel ?? "중단";
  if (game.status === "BEFORE") return "경기 전";
  return game.currentInningLabel ?? "LIVE";
}

function resolveResultLabel(game: LiveScoreGame, teamId: string): string | null {
  if (game.status !== "RESULT") return null;
  if (game.homeScore === game.awayScore) return "무";
  const winner = game.homeScore > game.awayScore ? game.homeTeam : game.awayTeam;
  return winner === teamId ? "승" : "패";
}

function buildContentState(game: LiveScoreGame, teamId: string): LiveActivityContentState {
  return {
    phase: resolvePhase(game),
    status: resolveStatus(game),
    inning: resolveInning(game),
    homeScore: game.homeScore,
    awayScore: game.awayScore,
    resultLabel: resolveResultLabel(game, teamId),
    winningPitcher: null,
    losingPitcher: null,
    updatedAtEpochMs: Date.now(),
  };
}

function groupByTeam(rows: LiveActivitySubscriptionRow[]): Map<string, LiveActivitySubscriptionRow[]> {
  const grouped = new Map<string, LiveActivitySubscriptionRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.teamId) ?? [];
    list.push(row);
    grouped.set(row.teamId, list);
  }
  return grouped;
}

export async function pushLiveActivityForGame(
  game: LiveScoreGame
): Promise<PushLiveActivityResult> {
  const event = game.status === "RESULT" || game.status === "CANCEL" ? "end" : "update";
  const rows = await prisma.liveActivitySubscription.findMany({
    where: {
      enabled: true,
      endedAt: null,
      gameId: game.externalId,
      teamId: { in: [game.homeTeam, game.awayTeam] },
      appEnv: resolveServerAppEnv(),
    },
    select: {
      id: true,
      token: true,
      teamId: true,
    },
  }) as LiveActivitySubscriptionRow[];

  if (rows.length === 0) {
    return { sent: 0, failed: 0, ended: 0, subscriptions: 0 };
  }

  let sent = 0;
  let failed = 0;
  const failedTokens: string[] = [];
  const grouped = groupByTeam(rows);

  for (const [teamId, teamRows] of grouped.entries()) {
    const result = await sendLiveActivityUpdate({
      tokens: teamRows.map((row) => row.token),
      event,
      contentState: buildContentState(game, teamId),
      staleDateMs: event === "update" ? Date.now() + 60_000 : null,
      dismissalDateMs: event === "end" ? Date.now() + 30 * 60_000 : null,
    });
    sent += result.ok;
    failed += result.failed.length;
    failedTokens.push(...result.failed);
  }

  if (failedTokens.length > 0) {
    await prisma.liveActivitySubscription.updateMany({
      where: { token: { in: failedTokens } },
      data: { enabled: false, endedAt: new Date() },
    });
  }

  let ended = 0;
  if (event === "end") {
    const updated = await prisma.liveActivitySubscription.updateMany({
      where: { id: { in: rows.map((row) => row.id) } },
      data: { enabled: false, endedAt: new Date() },
    });
    ended = updated.count;
  }

  return { sent, failed, ended, subscriptions: rows.length };
}
