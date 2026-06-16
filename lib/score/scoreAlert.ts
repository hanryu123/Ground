import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendApnsMulticast } from "@/lib/apns";
import { sendFcmMulticast } from "@/lib/firebaseAdmin";
import { sendWebPush } from "@/lib/webPushServer";
import { findTeam } from "@/lib/teams";
import { buildBiasedScoreCopy, computePulseState } from "@/lib/pushTemplate";
import { generateScorePushCopyWithOptions } from "@/lib/pushLlm";
import { mapWithConcurrency } from "@/lib/concurrency";
import {
  isTopicEnabled,
  matchesCurrentPushEnv,
} from "@/lib/notifications/topics";
import type { LiveScoreGame } from "@/lib/score/types";

/**
 * 점수 변동 알림 발송.
 * - 활성 구독자 (`score` 토픽 ON + 현재 푸시 환경 매칭) 만 타겟
 * - 한 게임에 양 팀 팬이 섞여 있으므로 favoriteTeam 에 따라 응원/실점 tone 을 분기
 * - LLM 호출은 `(team, score, tone, playText)` 캐시로 1회로 묶어 비용 절감
 * - alpha 환경에서는 `ALPHA_ALLOW_REAL_PUSH=1` 없이는 실제 발송을 차단
 */

type ScoreSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
  userId: string;
  topics: unknown;
  updatedAt: Date;
  user: { favoriteTeam: string | null };
};

type ScoreNativeToken = {
  token: string;
  platform: string;
  userId: string;
  favoriteTeam: string | null;
  topics: unknown;
  appEnv: string | null;
};

const PUSH_FAIL_DISABLE_STATUSES = new Set([401, 403, 404, 410]);

function uniqueLatestSubByUser(subs: ScoreSubscription[]): ScoreSubscription[] {
  const map = new Map<string, ScoreSubscription>();
  for (const sub of subs) {
    const prev = map.get(sub.userId);
    if (!prev || sub.updatedAt.getTime() > prev.updatedAt.getTime()) {
      map.set(sub.userId, sub);
    }
  }
  return [...map.values()];
}

function matchesNativePushEnv(topics: unknown, appEnv: string | null): boolean {
  if (matchesCurrentPushEnv(topics)) return true;
  if (!topics || typeof topics !== "object") {
    return matchesCurrentPushEnv({ appEnv });
  }
  return matchesCurrentPushEnv({ ...(topics as Record<string, unknown>), appEnv });
}

async function fetchRecentBodiesByTeam(teamIds: string[]): Promise<Map<string, string[]>> {
  const unique = [...new Set(teamIds.filter(Boolean))];
  const out = new Map<string, string[]>();
  if (unique.length === 0) return out;
  await Promise.all(
    unique.map(async (teamId) => {
      const rows = await prisma.notification.findMany({
        where: {
          type: "SCORE_UPDATE",
          createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
          payload: { path: ["teamId"], equals: teamId },
        },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { body: true },
      });
      out.set(
        teamId,
        rows
          .map((row) => row.body)
          .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
      );
    })
  );
  return out;
}

export async function dispatchScoreAlertsForGame(input: {
  game: LiveScoreGame;
  /** 직전 DB 스냅샷의 점수 */
  previousHomeScore: number;
  previousAwayScore: number;
  /** 1차로 라우트에서 업데이트한 Game.id (inbox payload 에 박힘) */
  dbGameId: string;
  latestPlayText: string;
  fastMode: boolean;
  llmTimeoutMs?: number;
  llmRetryTimeoutMs?: number | null;
  pushTimeoutMs?: number;
  origin: string;
}): Promise<{ sent: number; disabled: number; inboxCreated: number; llmCalls: number }> {
  const homeDelta = input.game.homeScore - input.previousHomeScore;
  const awayDelta = input.game.awayScore - input.previousAwayScore;

  const rawSubs = await prisma.pushSubscription.findMany({
    where: {
      enabled: true,
      user: {
        favoriteTeam: { in: [input.game.homeTeam, input.game.awayTeam] },
      },
    },
    select: {
      endpoint: true,
      p256dh: true,
      auth: true,
      userId: true,
      topics: true,
      updatedAt: true,
      user: { select: { favoriteTeam: true } },
    },
  });
  const activeSubs = uniqueLatestSubByUser(rawSubs as ScoreSubscription[]).filter(
    (sub) => matchesCurrentPushEnv(sub.topics) && isTopicEnabled(sub.topics, "score")
  );

  const rawNativeTokens = await prisma.nativePushToken.findMany({
    where: {
      enabled: true,
      favoriteTeam: { in: [input.game.homeTeam, input.game.awayTeam] },
    },
    select: {
      token: true,
      platform: true,
      userId: true,
      favoriteTeam: true,
      topics: true,
      appEnv: true,
    },
  });
  const activeNativeTokens = (rawNativeTokens as ScoreNativeToken[]).filter(
    (row) =>
      matchesNativePushEnv(row.topics, row.appEnv) &&
      isTopicEnabled(row.topics, "score")
  );

  if (activeSubs.length === 0 && activeNativeTokens.length === 0) {
    return { sent: 0, disabled: 0, inboxCreated: 0, llmCalls: 0 };
  }

  const recentBodies = await fetchRecentBodiesByTeam(
    [
      ...activeSubs.map((sub) => sub.user.favoriteTeam),
      ...activeNativeTokens.map((row) => row.favoriteTeam),
    ]
      .filter((teamId): teamId is string => Boolean(teamId))
  );

  const copyCache = new Map<string, Promise<{ title: string; body: string }>>();
  let llmCalls = 0;

  const buildAlertForTeam = async (favoriteTeam: string | null) => {
    if (!favoriteTeam) return null;

    let tone: "for" | "against" | null = null;
    if (favoriteTeam === input.game.homeTeam) {
      if (homeDelta > 0) tone = "for";
      else if (awayDelta > 0) tone = "against";
    } else if (favoriteTeam === input.game.awayTeam) {
      if (awayDelta > 0) tone = "for";
      else if (homeDelta > 0) tone = "against";
    }
    if (!tone) return null;

    const isHomeFan = favoriteTeam === input.game.homeTeam;
    const prevMyScore = isHomeFan ? input.previousHomeScore : input.previousAwayScore;
    const prevOppScore = isHomeFan ? input.previousAwayScore : input.previousHomeScore;
    const myScore = isHomeFan ? input.game.homeScore : input.game.awayScore;
    const oppScore = isHomeFan ? input.game.awayScore : input.game.homeScore;
    const state = computePulseState(prevMyScore, prevOppScore, myScore, oppScore);
    const myTeam = findTeam(favoriteTeam);
    const oppTeamId = isHomeFan ? input.game.awayTeam : input.game.homeTeam;
    const oppTeam = findTeam(oppTeamId);
    const teamRecentBodies = recentBodies.get(favoriteTeam) ?? [];
    const fallback = buildBiasedScoreCopy({
      teamShort: myTeam.short,
      oppShort: oppTeam.short,
      myScore,
      oppScore,
      tone,
      state,
      latestPlayText: input.latestPlayText,
      recentBodies: teamRecentBodies,
    });

    const cacheKey = `${favoriteTeam}:${myScore}:${oppScore}:${tone}:${input.latestPlayText}`;
    let copyPromise = copyCache.get(cacheKey);
    if (!copyPromise) {
      const copyInput = {
        favoriteTeam,
        opponentTeam: oppTeamId,
        myScore,
        oppScore,
        mySide: isHomeFan ? "home" as const : "away" as const,
        tone,
        latestPlayText: input.latestPlayText,
        fallbackTitle: fallback.title,
        fallbackBody: fallback.body,
        recentBodies: teamRecentBodies,
        prevMyScore,
        prevOppScore,
      };
      if (input.fastMode) {
        copyPromise = generateScorePushCopyWithOptions(copyInput, { apiKeyOverride: "" });
      } else {
        llmCalls += 1;
        copyPromise = generateScorePushCopyWithOptions(
          copyInput,
          {
            timeoutMs: input.llmTimeoutMs ?? 2500,
            retryTimeoutMs: input.llmRetryTimeoutMs ?? null,
            maxTokens: 80,
          }
        );
      }
      copyCache.set(cacheKey, copyPromise);
    }
    const aiCopy = await copyPromise;

    return {
      favoriteTeam,
      tone,
      aiCopy,
      payload: {
        dedupeKey: `score:${input.game.externalId}:${input.game.homeScore}:${input.game.awayScore}`,
        gameId: input.dbGameId,
        externalId: input.game.externalId,
        homeTeam: input.game.homeTeam,
        awayTeam: input.game.awayTeam,
        homeScore: input.game.homeScore,
        awayScore: input.game.awayScore,
        teamId: favoriteTeam,
        tone,
        latestPlayText: input.latestPlayText,
      } as Prisma.InputJsonValue,
    };
  };

  const pushResults = await mapWithConcurrency(activeSubs, 12, async (sub) => {
    const alert = await buildAlertForTeam(sub.user.favoriteTeam);
    if (!alert) return null;

    const push = await sendWebPush(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      {
        title: alert.aiCopy.title,
        body: alert.aiCopy.body,
        url: "/today",
        latestPlayText: input.latestPlayText,
        teamId: alert.favoriteTeam,
      },
      { favoriteTeam: alert.favoriteTeam, origin: input.origin, timeoutMs: input.pushTimeoutMs ?? 2500 }
    );

    return {
      sub,
      aiCopy: alert.aiCopy,
      push,
      payload: alert.payload,
    };
  });

  const nativeResults = await mapWithConcurrency(activeNativeTokens, 12, async (row) => {
    const alert = await buildAlertForTeam(row.favoriteTeam);
    if (!alert) return null;

    try {
      const platform = row.platform.toLowerCase();
      if (platform === "ios") {
        const result = await sendApnsMulticast({
          tokens: [row.token],
          title: alert.aiCopy.title,
          body: alert.aiCopy.body,
          url: "/today",
          data: { teamId: alert.favoriteTeam, topicKey: "score" },
        });
        return {
          row,
          aiCopy: alert.aiCopy,
          payload: alert.payload,
          ok: result.ok > 0,
          failed: result.failed.includes(row.token),
        };
      }

      const result = await sendFcmMulticast({
        tokens: [row.token],
        title: alert.aiCopy.title,
        body: alert.aiCopy.body,
        url: "/today",
        data: { teamId: alert.favoriteTeam, topicKey: "score" },
      });
      return {
        row,
        aiCopy: alert.aiCopy,
        payload: alert.payload,
        ok: result.ok > 0,
        failed: result.failed.includes(row.token),
      };
    } catch (err) {
      console.warn("[scoreAlert] native score push failed:", (err as Error).message);
      return {
        row,
        aiCopy: alert.aiCopy,
        payload: alert.payload,
        ok: false,
        failed: false,
      };
    };
  });

  const disableTargets = pushResults
    .filter(
      (row): row is NonNullable<typeof row> =>
        row != null && Boolean(row.push.statusCode) && PUSH_FAIL_DISABLE_STATUSES.has(row.push.statusCode!)
    )
    .map((row) => row.sub);

  let disabled = 0;
  if (disableTargets.length > 0) {
    const rows = await mapWithConcurrency(disableTargets, 8, (sub) =>
      prisma.pushSubscription.updateMany({
        where: { userId: sub.userId, endpoint: sub.endpoint, enabled: true },
        data: { enabled: false },
      })
    );
    disabled = rows.reduce((acc, row) => acc + row.count, 0);
  }

  const failedNativeTokens = nativeResults
    .filter((row): row is NonNullable<typeof row> => row != null && row.failed)
    .map((row) => row.row.token);
  if (failedNativeTokens.length > 0) {
    const disabledNative = await prisma.nativePushToken.updateMany({
      where: { token: { in: failedNativeTokens }, enabled: true },
      data: { enabled: false },
    });
    disabled += disabledNative.count;
  }

  const sentRows = pushResults.filter(
    (row): row is NonNullable<typeof row> => row != null && row.push.ok
  );
  const nativeSentRows = nativeResults.filter(
    (row): row is NonNullable<typeof row> => row != null && row.ok
  );
  let inboxCreated = 0;

  if (sentRows.length > 0 || nativeSentRows.length > 0) {
    const dedupKeys = new Set<string>();
    const inboxRows: Array<{
      userId: string;
      title: string;
      body: string;
      deeplinkUrl: string;
      sentAt: Date;
      type: "SCORE_UPDATE";
      payload: Prisma.InputJsonValue;
    }> = [];
    for (const row of sentRows) {
      const key = `${row.sub.userId}:${row.aiCopy.title}:${row.aiCopy.body}`;
      if (dedupKeys.has(key)) continue;
      dedupKeys.add(key);
      inboxRows.push({
        userId: row.sub.userId,
        title: row.aiCopy.title,
        body: row.aiCopy.body,
        deeplinkUrl: "/today",
        sentAt: new Date(),
        type: "SCORE_UPDATE",
        payload: row.payload,
      });
    }
    for (const row of nativeSentRows) {
      const key = `${row.row.userId}:${row.aiCopy.title}:${row.aiCopy.body}`;
      if (dedupKeys.has(key)) continue;
      dedupKeys.add(key);
      inboxRows.push({
        userId: row.row.userId,
        title: row.aiCopy.title,
        body: row.aiCopy.body,
        deeplinkUrl: "/today",
        sentAt: new Date(),
        type: "SCORE_UPDATE",
        payload: row.payload,
      });
    }
    if (inboxRows.length > 0) {
      const created = await prisma.notification.createMany({ data: inboxRows });
      inboxCreated = created.count;
    }
  }

  return { sent: sentRows.length + nativeSentRows.length, disabled, inboxCreated, llmCalls };
}
