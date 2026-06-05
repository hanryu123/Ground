import { NextResponse } from "next/server";
import { getApnsConfigStatus, sendApnsDebug } from "@/lib/apns";
import { isAlphaServerEnv, resolveServerAppEnv } from "@/lib/appEnv";
import { prisma } from "@/lib/prisma";
import {
  isTopicEnabled,
  matchesCurrentPushEnv,
  TOPIC_KEYS,
  type TopicKey,
} from "@/lib/notifications/topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type NativeTokenRow = {
  id: string;
  userId: string;
  token: string;
  platform: string;
  enabled: boolean;
  favoriteTeam: string | null;
  topics: unknown;
  appEnv: string;
  updatedAt: Date;
  lastSeenAt: Date | null;
};

function authSecret(): string | undefined {
  return process.env.ADMIN_SECRET ?? process.env.ADMIN_PASSWORD ?? process.env.CRON_SECRET;
}

function isAuthorized(req: Request, url: URL): boolean {
  const secret = authSecret();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}` || url.searchParams.get("key") === secret || url.searchParams.get("secret") === secret;
}

function parseTopic(raw: string | null): TopicKey {
  const topic = raw?.trim() as TopicKey | undefined;
  return topic && TOPIC_KEYS.includes(topic) ? topic : "score";
}

function topicAppEnv(topics: unknown): unknown {
  return topics && typeof topics === "object"
    ? (topics as Record<string, unknown>).appEnv
    : undefined;
}

function matchesNativePushEnv(topics: unknown, appEnv: string | null): boolean {
  if (matchesCurrentPushEnv(topics)) return true;
  if (!topics || typeof topics !== "object") {
    return matchesCurrentPushEnv({ appEnv });
  }
  return matchesCurrentPushEnv({ ...(topics as Record<string, unknown>), appEnv });
}

function maskToken(token: string): string {
  if (token.length <= 14) return `${token.slice(0, 4)}...`;
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

function describeToken(row: NativeTokenRow, topic: TopicKey) {
  return {
    id: row.id,
    userId: row.userId,
    token: maskToken(row.token),
    platform: row.platform,
    enabled: row.enabled,
    favoriteTeam: row.favoriteTeam,
    appEnv: row.appEnv,
    topicsAppEnv: topicAppEnv(row.topics),
    topicEnabled: isTopicEnabled(row.topics, topic),
    envMatches: matchesNativePushEnv(row.topics, row.appEnv),
    deliverable:
      row.enabled &&
      row.platform.toLowerCase() === "ios" &&
      isTopicEnabled(row.topics, topic) &&
      matchesNativePushEnv(row.topics, row.appEnv),
    updatedAt: row.updatedAt,
    lastSeenAt: row.lastSeenAt,
  };
}

async function latestNativeRows(teamId: string | null): Promise<NativeTokenRow[]> {
  return prisma.nativePushToken.findMany({
    where: teamId ? { favoriteTeam: teamId } : undefined,
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: {
      id: true,
      userId: true,
      token: true,
      platform: true,
      enabled: true,
      favoriteTeam: true,
      topics: true,
      appEnv: true,
      updatedAt: true,
      lastSeenAt: true,
    },
  }) as Promise<NativeTokenRow[]>;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!isAuthorized(req, url)) {
    return NextResponse.json({
      ok: false,
      error: "unauthorized",
      hasAuthSecret: Boolean(authSecret()),
    }, { status: 401 });
  }

  const teamId = (url.searchParams.get("teamId") ?? "").trim().toLowerCase() || null;
  const topic = parseTopic(url.searchParams.get("topic"));
  const rows = await latestNativeRows(teamId);
  const [nativeTotal, nativeEnabled, iosEnabled, webEnabled] = await Promise.all([
    prisma.nativePushToken.count(),
    prisma.nativePushToken.count({ where: { enabled: true } }),
    prisma.nativePushToken.count({ where: { enabled: true, platform: "ios" } }),
    prisma.pushSubscription.count({ where: { enabled: true } }),
  ]);

  const described = rows.map((row) => describeToken(row, topic));

  return NextResponse.json({
    ok: true,
    server: {
      appEnv: resolveServerAppEnv(),
      alpha: isAlphaServerEnv(),
    },
    apns: getApnsConfigStatus(),
    query: { teamId, topic },
    counts: {
      nativeTotal,
      nativeEnabled,
      iosEnabled,
      webEnabled,
      queryRows: described.length,
      queryDeliverableIos: described.filter((row) => row.deliverable).length,
    },
    latestNativeTokens: described,
  });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!isAuthorized(req, url)) {
    return NextResponse.json({
      ok: false,
      error: "unauthorized",
      hasAuthSecret: Boolean(authSecret()),
    }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as {
    teamId?: string;
    topic?: TopicKey;
    tokenId?: string;
    title?: string;
    body?: string;
  };
  const teamId = (body.teamId ?? url.searchParams.get("teamId") ?? "lg").trim().toLowerCase();
  const topic = parseTopic(body.topic ?? url.searchParams.get("topic"));
  const tokenId = (body.tokenId ?? url.searchParams.get("tokenId") ?? "").trim();

  const row = await prisma.nativePushToken.findFirst({
    where: tokenId
      ? { id: tokenId, platform: "ios", enabled: true }
      : { favoriteTeam: teamId, platform: "ios", enabled: true },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      userId: true,
      token: true,
      platform: true,
      enabled: true,
      favoriteTeam: true,
      topics: true,
      appEnv: true,
      updatedAt: true,
      lastSeenAt: true,
    },
  }) as NativeTokenRow | null;

  if (!row) {
    return NextResponse.json({
      ok: false,
      error: "ios_token_not_found",
      teamId,
      topic,
      apns: getApnsConfigStatus(),
    }, { status: 404 });
  }

  const token = describeToken(row, topic);
  if (!token.deliverable) {
    return NextResponse.json({
      ok: false,
      error: "token_not_deliverable_for_current_filters",
      teamId,
      topic,
      token,
      apns: getApnsConfigStatus(),
    }, { status: 409 });
  }

  try {
    const result = await sendApnsDebug({
      token: row.token,
      title: body.title?.trim() || "Ground 알림 테스트",
      body: body.body?.trim() || "APNs 직접 발송 테스트입니다.",
      url: "/today",
      data: { teamId, topicKey: topic, source: "push-diagnostics" },
    });

    return NextResponse.json({
      ok: result.ok,
      teamId,
      topic,
      token,
      apns: getApnsConfigStatus(),
      result,
    }, { status: result.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: "apns_send_failed",
      message: (err as Error).message,
      teamId,
      topic,
      token,
      apns: getApnsConfigStatus(),
    }, { status: 500 });
  }
}
