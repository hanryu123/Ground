import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { shouldSkipCronInAlpha } from "@/lib/appEnv";
import { todayKstDate } from "@/lib/kbo";
import {
  fetchOfficialHighlightEntries,
  pickMatchingHighlightForGame,
} from "@/lib/highlightFeed";
import { fetchLiveScoreSnapshot } from "@/lib/score/snapshot";
import type { LiveScoreGame } from "@/lib/score/types";
import { authorizeCron, markDispatchOnce, sendTeamTopicNotification } from "@/services/notificationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LOSE_MESSAGES = [
  "오늘 야구 기억 삭제하고 싶지만... 그래도 봐야겠다면 여기 클릭.",
  "오늘 경기는 액땜입니다. 대인배의 마음으로 하이라이트 슥- 훑어주고 내일 준비하죠.",
  "오늘 야구는 우천 취소된 겁니다. 아무튼 그런 겁니다. 그래도... 하이라이트는 여기.",
  "오늘 자 우리 팀 경기 결과는 유해 매체로 지정되었습니다. 시청 주의.",
] as const;

const WIN_MESSAGES = [
  "오늘 역대급 명경기! 안 본 사람 없게 해라. 지금 바로 확인!",
  "이게 야구고 이게 내 팀입니다! 짜릿하다 못해 지려버린 오늘 경기 요약 배달 완료.",
  "승리의 스멜 가득한 명경기 하이라이트 보면서 꿀잠 주무세요.",
  "오늘 하이라이트는 우리가 독식합니다. 정주행 렛츠고",
  "오늘 야구 왜 이렇게 재밌냐? 타 팀 팬들도 부러워서 훔쳐본다는 우리 팀 찢어버린 경기 하이라이트",
] as const;

const DRAW_MESSAGES = [
  "비겼지만 핵심 장면은 다시 봐야 한다. 요약 영상 확인.",
] as const;

function pickRandomMessage(messages: readonly string[]): string {
  return messages[Math.floor(Math.random() * messages.length)] ?? messages[0] ?? "";
}

function buildHighlightMessage(input: {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  fanTeamId: string;
}) {
  const isHomeFan = input.fanTeamId === input.homeTeam;
  const myScore = isHomeFan ? input.homeScore : input.awayScore;
  const oppScore = isHomeFan ? input.awayScore : input.homeScore;
  if (myScore > oppScore) {
    return {
      title: "🔥 [승리 요약]",
      body: pickRandomMessage(WIN_MESSAGES),
    };
  }
  if (myScore < oppScore) {
    return {
      title: "😱 [하이라이트]",
      body: pickRandomMessage(LOSE_MESSAGES),
    };
  }
  return {
    title: "🎬 [하이라이트]",
    body: pickRandomMessage(DRAW_MESSAGES),
  };
}

type HighlightCandidate = {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  gameDate: Date | null;
  dbId: string | null;
  highlightNotifiedAt: Date | null;
  lastHighlightCheckedAt: Date | null;
  source: "naver" | "db";
};

function dayRangeKst(date: string) {
  const start = new Date(`${date}T00:00:00+09:00`);
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
}

function matchesTeamFilter(game: Pick<HighlightCandidate, "homeTeam" | "awayTeam">, teamId?: string) {
  if (!teamId) return true;
  return game.homeTeam === teamId || game.awayTeam === teamId;
}

async function syncSnapshotGames(snapshotGames: LiveScoreGame[], now: Date) {
  const resultGames = snapshotGames.filter((game) => game.status === "RESULT");
  const externalIds = resultGames.map((game) => game.externalId);
  if (externalIds.length === 0) return new Map<string, Awaited<ReturnType<typeof prisma.game.findUnique>>>();

  const existingRows = await prisma.game.findMany({
    where: { externalId: { in: externalIds } },
    select: {
      id: true,
      externalId: true,
      gameDate: true,
      endedAt: true,
      highlightNotifiedAt: true,
      lastHighlightCheckedAt: true,
    },
  });
  const existingByExternalId = new Map(existingRows.map((row) => [row.externalId, row]));

  const rows = await Promise.all(
    resultGames.map((game) => {
      const existing = existingByExternalId.get(game.externalId);
      return prisma.game.upsert({
        where: { externalId: game.externalId },
        create: {
          externalId: game.externalId,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          status: "RESULT",
          gameDate: game.gameDate,
          endedAt: now,
          lastSyncedAt: now,
        },
        update: {
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          status: "RESULT",
          gameDate: game.gameDate ?? existing?.gameDate ?? null,
          endedAt: existing?.endedAt ?? now,
          lastSyncedAt: now,
        },
      });
    }),
  );

  return new Map(rows.map((row) => [row.externalId, row]));
}

async function loadHighlightCandidates(input: {
  targetDate: string;
  now: Date;
  force: boolean;
  teamId?: string;
  allowResend: boolean;
  minEndedAt: Date;
  highlightPollThreshold: Date;
}): Promise<{ candidates: HighlightCandidate[]; snapshotGames: number; source: "naver" | "db"; snapshotError: string | null }> {
  try {
    const snapshot = await fetchLiveScoreSnapshot(input.targetDate);
    const resultSnapshot = snapshot.filter((game) => game.status === "RESULT");
    const syncedRows = await syncSnapshotGames(resultSnapshot, input.now);
    const candidates = resultSnapshot
      .map((game) => {
        const row = syncedRows.get(game.externalId);
        return {
          externalId: game.externalId,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          gameDate: game.gameDate,
          dbId: row?.id ?? null,
          highlightNotifiedAt: row?.highlightNotifiedAt ?? null,
          lastHighlightCheckedAt: row?.lastHighlightCheckedAt ?? null,
          source: "naver" as const,
        };
      })
      .filter((game) => matchesTeamFilter(game, input.teamId))
      .filter((game) => input.allowResend || !game.highlightNotifiedAt)
      .filter(
        (game) =>
          input.force ||
          !game.lastHighlightCheckedAt ||
          game.lastHighlightCheckedAt <= input.highlightPollThreshold,
      )
      .slice(0, 16);

    return {
      candidates,
      snapshotGames: resultSnapshot.length,
      source: "naver",
      snapshotError: null,
    };
  } catch (error) {
    const range = dayRangeKst(input.targetDate);
    const teamFilter = input.teamId
      ? { OR: [{ homeTeam: input.teamId }, { awayTeam: input.teamId }] }
      : {};
    const candidates = await prisma.game.findMany({
      where: {
        status: "RESULT",
        endedAt: { gte: range.start, lt: range.end, lte: input.minEndedAt },
        ...(input.allowResend ? {} : { highlightNotifiedAt: null }),
        ...(input.force
          ? {}
          : {
              OR: [
                { lastHighlightCheckedAt: null },
                { lastHighlightCheckedAt: { lte: input.highlightPollThreshold } },
              ],
            }),
        ...teamFilter,
      },
      orderBy: [{ endedAt: "desc" }],
      take: 16,
    });

    return {
      candidates: candidates.map((game) => ({
        externalId: game.externalId,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        gameDate: game.gameDate,
        dbId: game.id,
        highlightNotifiedAt: game.highlightNotifiedAt,
        lastHighlightCheckedAt: game.lastHighlightCheckedAt,
        source: "db" as const,
      })),
      snapshotGames: 0,
      source: "db",
      snapshotError: String(error).slice(0, 200),
    };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = authorizeCron(req, url);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (shouldSkipCronInAlpha(url)) return NextResponse.json({ ok: true, skipped: "ALPHA_ENV_CRON_DISABLED" });

  const now = new Date();
  const force = url.searchParams.get("force") === "1";
  const teamId = url.searchParams.get("teamId") ?? undefined;
  const targetDate = url.searchParams.get("date") ?? todayKstDate(now);
  const allowResend = force && Boolean(teamId);
  const minEndedAt = new Date(now.getTime() - 30 * 60 * 1000);
  const highlightPollThreshold = new Date(now.getTime() - 5 * 60 * 1000);

  const candidateResult = await loadHighlightCandidates({
    targetDate,
    now,
    force,
    teamId,
    allowResend,
    minEndedAt,
    highlightPollThreshold,
  });
  const candidates = candidateResult.candidates;

  const entries = await fetchOfficialHighlightEntries(16);
  let checked = 0;
  let sent = 0;
  let matched = 0;

  for (const game of candidates) {
    checked += 1;
    await prisma.game.update({
      where: { externalId: game.externalId },
      data: { lastHighlightCheckedAt: new Date() },
    });
    const hit = pickMatchingHighlightForGame(entries, {
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
    });
    if (!hit) continue;
    matched += 1;

    // teamId가 지정된 경우 해당 팀에만 발송
    const teamsToNotify = teamId
      ? [game.homeTeam, game.awayTeam].filter((t) => t === teamId)
      : [game.homeTeam, game.awayTeam];

    for (const notifyTeamId of teamsToNotify) {
      const dispatchEventKey = allowResend
        ? `${game.externalId}:${hit.videoId}:force:${now.getTime()}`
        : `${game.externalId}:${hit.videoId}`;
      const lock = await markDispatchOnce({
        alertKind: "highlight",
        teamScope: notifyTeamId,
        eventKey: dispatchEventKey,
        gameExternalId: game.externalId,
      });
      if (!lock) continue;
      const copy = buildHighlightMessage({
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        fanTeamId: notifyTeamId,
      });
      const result = await sendTeamTopicNotification({
        teamId: notifyTeamId,
        topicKey: "highlight",
        title: copy.title,
        body: copy.body,
        url: `${url.origin}/`,
        payload: {
          kind: "highlight",
          gameExternalId: game.externalId,
          highlightVideoId: hit.videoId,
          highlightVideoUrl: hit.url,
          highlightTitle: hit.title,
          channelId: hit.channelId,
          channelLabel: hit.channelLabel,
        },
        type: "GAME_RESULT",
        origin: url.origin,
      });
      sent += result.sent;
    }

    await prisma.game.update({
      where: { externalId: game.externalId },
      data: {
        highlightNotifiedAt: new Date(),
        highlightVideoUrl: hit.url,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    date: targetDate,
    checked,
    matched,
    sent,
    candidates: candidates.length,
    snapshotGames: candidateResult.snapshotGames,
    source: candidateResult.source,
    snapshotError: candidateResult.snapshotError,
  });
}
