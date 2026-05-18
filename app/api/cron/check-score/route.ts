import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendWebPush } from "@/lib/webPushServer";
import {
  fetchMockScoreSnapshot,
  fetchMockScoreSnapshotByTick,
} from "@/lib/scoreMock";
import { findTeam } from "@/lib/teams";
import { todayKstDate } from "@/lib/kbo";
import { buildBiasedScoreCopy, computePulseState } from "@/lib/pushTemplate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type GameEndTone = "win" | "loss" | "draw";
type LiveScoreGame = {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: "BEFORE" | "LIVE" | "RESULT" | "CANCEL";
  gameDate: Date | null;
};

type SubscriptionTopics = {
  score?: boolean;
  postGame?: boolean;
  gameEnd?: boolean;
};

function isScoreAlertEnabled(topics: unknown): boolean {
  if (!topics || typeof topics !== "object") return false;
  return Boolean((topics as SubscriptionTopics).score);
}

function isGameEndAlertEnabled(topics: unknown): boolean {
  if (!topics || typeof topics !== "object") return false;
  const parsed = topics as SubscriptionTopics;
  return Boolean(parsed.postGame || parsed.gameEnd);
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

function buildGameEndCopy(game: LiveScoreGame, favoriteTeam: string, tone: GameEndTone) {
  const isHomeFan = favoriteTeam === game.homeTeam;
  const myScore = isHomeFan ? game.homeScore : game.awayScore;
  const oppScore = isHomeFan ? game.awayScore : game.homeScore;
  const myTeam = findTeam(favoriteTeam);
  const oppTeam = findTeam(isHomeFan ? game.awayTeam : game.homeTeam);

  if (tone === "win") {
    return {
      title: `✅ ${myTeam.short} 승리 확정`,
      body: `이겼다 ㅋㅋ ${myTeam.short} ${myScore}:${oppScore} ${oppTeam.short}. 하이라이트 보러 가자.`,
    };
  }
  if (tone === "draw") {
    return {
      title: `🤝 ${myTeam.short} 무승부`,
      body: `${myTeam.short} ${myScore}:${oppScore} ${oppTeam.short}. 안 졌다, 다음 경기에서 끝내자.`,
    };
  }
  return {
    title: `❌ ${myTeam.short} 패배`,
    body: `아 ㅅㅂ ${myTeam.short} ${myScore}:${oppScore} ${oppTeam.short}... 다음 판에서 바로 갚는다.`,
  };
}

const NAVER_BASE = "https://api-gw.sports.naver.com";
const NAVER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 GroundBot/1.0";

const NAVER_TEAM_MAP: Record<string, string> = {
  LG: "lg",
  OB: "doosan",
  HT: "kia",
  HH: "hanwha",
  WO: "kiwoom",
  LT: "lotte",
  NC: "nc",
  SK: "ssg",
  SS: "samsung",
  KT: "kt",
};

function normalizeStatus(code: string | undefined): LiveScoreGame["status"] {
  switch ((code ?? "").toUpperCase()) {
    case "BEFORE":
    case "READY":
      return "BEFORE";
    case "STARTED":
    case "PLAYING":
    case "LIVE":
      return "LIVE";
    case "RESULT":
    case "FINISH":
    case "ENDED":
      return "RESULT";
    case "CANCEL":
    case "POSTPONED":
    case "CANCELLED":
      return "CANCEL";
    default:
      return "BEFORE";
  }
}

function parseGameDate(gameDate?: string, gameDateTime?: string): Date | null {
  if (typeof gameDateTime === "string") {
    const ms = Date.parse(gameDateTime);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  if (typeof gameDate === "string" && gameDate.length === 8) {
    const iso = `${gameDate.slice(0, 4)}-${gameDate.slice(4, 6)}-${gameDate.slice(6, 8)}T00:00:00+09:00`;
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  return null;
}

async function fetchLiveScoreSnapshot(): Promise<LiveScoreGame[]> {
  const date = todayKstDate();
  const url =
    `${NAVER_BASE}/schedule/games` +
    `?fields=basic,statusInfo,score` +
    `&upperCategoryId=kbaseball&categoryId=kbo` +
    `&fromDate=${date}&toDate=${date}&size=200`;
  const res = await fetch(url, {
    headers: {
      "user-agent": NAVER_UA,
      accept: "application/json",
      referer: "https://m.sports.naver.com/",
    },
    next: { revalidate: 10 },
  });
  if (!res.ok) throw new Error(`naver score HTTP ${res.status}`);
  const json = (await res.json()) as {
    result?: {
      games?: Array<{
        gameId?: string;
        gameDate?: string;
        gameDateTime?: string;
        homeTeamCode?: string;
        awayTeamCode?: string;
        homeTeamScore?: number;
        awayTeamScore?: number;
        statusCode?: string;
      }>;
    };
  };
  const games = json?.result?.games ?? [];
  return games
    .map((g) => {
      const homeTeam = NAVER_TEAM_MAP[(g.homeTeamCode ?? "").toUpperCase()];
      const awayTeam = NAVER_TEAM_MAP[(g.awayTeamCode ?? "").toUpperCase()];
      if (!homeTeam || !awayTeam || !g.gameId) return null;
      return {
        externalId: g.gameId,
        homeTeam,
        awayTeam,
        homeScore: typeof g.homeTeamScore === "number" ? g.homeTeamScore : 0,
        awayScore: typeof g.awayTeamScore === "number" ? g.awayTeamScore : 0,
        status: normalizeStatus(g.statusCode),
        gameDate: parseGameDate(g.gameDate, g.gameDateTime),
      } as LiveScoreGame;
    })
    .filter((g): g is LiveScoreGame => Boolean(g));
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const tickRaw = url.searchParams.get("tick");
  const snapshot: LiveScoreGame[] =
    tickRaw != null && tickRaw !== ""
      ? (await fetchMockScoreSnapshotByTick(Number(tickRaw))).map((g) => ({
          externalId: g.externalId,
          homeTeam: g.homeTeam,
          awayTeam: g.awayTeam,
          homeScore: g.homeScore,
          awayScore: g.awayScore,
          status: g.status,
          gameDate: g.gameDate,
        }))
      : await fetchLiveScoreSnapshot();
  let checked = 0;
  let changed = 0;
  let pushSent = 0;
  let disabled = 0;
  let inboxCreated = 0;

  for (const game of snapshot) {
    checked += 1;
    const previous = await prisma.game.findUnique({
      where: { externalId: game.externalId },
    });

    const updated = await prisma.game.upsert({
      where: { externalId: game.externalId },
      update: {
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        status: game.status,
        gameDate: game.gameDate,
        lastSyncedAt: new Date(),
      },
      create: {
        externalId: game.externalId,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        status: game.status,
        gameDate: game.gameDate,
        lastSyncedAt: new Date(),
      },
    });

    if (!previous) continue;
    const homeDelta = game.homeScore - previous.homeScore;
    const awayDelta = game.awayScore - previous.awayScore;
    if (homeDelta <= 0 && awayDelta <= 0) continue;

    changed += 1;
    const activeSubs = await prisma.pushSubscription.findMany({
      where: {
        enabled: true,
        user: {
          favoriteTeam: {
            in: [game.homeTeam, game.awayTeam],
          },
        },
      },
      select: {
        endpoint: true,
        p256dh: true,
        auth: true,
        userId: true,
        topics: true,
        user: {
          select: {
            favoriteTeam: true,
          },
        },
      },
    });

    const inboxRows: Array<{
      userId: string;
      title: string;
      body: string;
      deeplinkUrl: string;
      sentAt: Date;
      type: "SCORE_UPDATE";
      payload: Prisma.InputJsonValue;
    }> = [];
    const inboxKey = new Set<string>();

    for (const sub of activeSubs) {
      if (!isScoreAlertEnabled(sub.topics)) continue;
      const favoriteTeam = sub.user.favoriteTeam;
      if (!favoriteTeam) continue;

      let tone: "for" | "against" | null = null;
      if (favoriteTeam === game.homeTeam) {
        if (homeDelta > 0) tone = "for";
        else if (awayDelta > 0) tone = "against";
      } else if (favoriteTeam === game.awayTeam) {
        if (awayDelta > 0) tone = "for";
        else if (homeDelta > 0) tone = "against";
      }
      if (!tone) continue;
      const isHomeFan = favoriteTeam === game.homeTeam;
      const prevMyScore = isHomeFan ? previous.homeScore : previous.awayScore;
      const prevOppScore = isHomeFan ? previous.awayScore : previous.homeScore;
      const myScore = isHomeFan ? game.homeScore : game.awayScore;
      const oppScore = isHomeFan ? game.awayScore : game.homeScore;
      const state = computePulseState(prevMyScore, prevOppScore, myScore, oppScore);
      const myTeam = findTeam(favoriteTeam);
      const oppTeam = findTeam(isHomeFan ? game.awayTeam : game.homeTeam);
      const copy = buildBiasedScoreCopy({
        teamShort: myTeam.short,
        oppShort: oppTeam.short,
        myScore,
        oppScore,
        tone,
        state,
      });
      const push = await sendWebPush(
        {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
        {
          title: copy.title,
          body: copy.body,
          url: "/today",
        }
      );
      if (push.ok) {
        pushSent += 1;
      } else if (
        push.statusCode === 401 ||
        push.statusCode === 403 ||
        push.statusCode === 404 ||
        push.statusCode === 410
      ) {
        await prisma.pushSubscription.updateMany({
          where: {
            userId: sub.userId,
            endpoint: sub.endpoint,
            enabled: true,
          },
          data: { enabled: false },
        });
        disabled += 1;
      }

      const key = `${sub.userId}:${copy.title}:${copy.body}`;
      if (inboxKey.has(key)) continue;
      inboxKey.add(key);
      inboxRows.push({
        userId: sub.userId,
        title: copy.title,
        body: copy.body,
        deeplinkUrl: "/today",
        sentAt: new Date(),
        type: "SCORE_UPDATE",
        payload: {
          gameId: updated.id,
          externalId: game.externalId,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          tone,
        },
      });
    }

    if (inboxRows.length > 0) {
      const result = await prisma.notification.createMany({ data: inboxRows });
      inboxCreated += result.count;
    }

    const justEnded = previous.status !== "RESULT" && game.status === "RESULT";
    if (!justEnded) continue;

    const endSubs = await prisma.pushSubscription.findMany({
      where: {
        enabled: true,
        user: {
          favoriteTeam: {
            in: [game.homeTeam, game.awayTeam],
          },
        },
      },
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
        userId: true,
        topics: true,
        user: {
          select: {
            favoriteTeam: true,
          },
        },
      },
    });

    const endInboxRows: Array<{
      userId: string;
      title: string;
      body: string;
      deeplinkUrl: string;
      sentAt: Date;
      type: "GAME_RESULT";
      payload: Prisma.InputJsonValue;
    }> = [];
    const endInboxKey = new Set<string>();

    for (const sub of endSubs) {
      if (!isGameEndAlertEnabled(sub.topics)) continue;
      const favoriteTeam = sub.user.favoriteTeam;
      if (!favoriteTeam) continue;

      let tone: GameEndTone | null = null;
      if (favoriteTeam === game.homeTeam) {
        if (game.homeScore > game.awayScore) tone = "win";
        else if (game.homeScore < game.awayScore) tone = "loss";
        else tone = "draw";
      } else if (favoriteTeam === game.awayTeam) {
        if (game.awayScore > game.homeScore) tone = "win";
        else if (game.awayScore < game.homeScore) tone = "loss";
        else tone = "draw";
      }
      if (!tone) continue;

      const copy = buildGameEndCopy(game, favoriteTeam, tone);
      const push = await sendWebPush(
        {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
        {
          title: copy.title,
          body: copy.body,
          url: "/today",
        }
      );
      if (push.ok) {
        pushSent += 1;
      } else if (
        push.statusCode === 401 ||
        push.statusCode === 403 ||
        push.statusCode === 404 ||
        push.statusCode === 410
      ) {
        await prisma.pushSubscription.updateMany({
          where: {
            userId: sub.userId,
            endpoint: sub.endpoint,
            enabled: true,
          },
          data: { enabled: false },
        });
        disabled += 1;
      }

      const key = `${sub.userId}:${copy.title}:${copy.body}`;
      if (endInboxKey.has(key)) continue;
      endInboxKey.add(key);
      endInboxRows.push({
        userId: sub.userId,
        title: copy.title,
        body: copy.body,
        deeplinkUrl: "/today",
        sentAt: new Date(),
        type: "GAME_RESULT",
        payload: {
          gameId: updated.id,
          externalId: game.externalId,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          tone,
        },
      });
    }

    if (endInboxRows.length > 0) {
      const result = await prisma.notification.createMany({ data: endInboxRows });
      inboxCreated += result.count;
    }
  }

  return NextResponse.json({
    ok: true,
    checked,
    changed,
    pushSent,
    disabled,
    inboxCreated,
  });
}
