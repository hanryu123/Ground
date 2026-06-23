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

function authSecrets(): string[] {
  return [
    process.env.ADMIN_SECRET,
    process.env.ADMIN_PASSWORD,
    process.env.CRON_SECRET,
  ].filter((value): value is string => Boolean(value));
}

function isAuthorized(req: Request, url: URL): boolean {
  const auth = req.headers.get("authorization");
  const querySecret = url.searchParams.get("key") ?? url.searchParams.get("secret");
  return authSecrets().some((secret) => auth === `Bearer ${secret}` || querySecret === secret);
}

function diagnosticServerStatus() {
  return {
    appEnv: resolveServerAppEnv(),
    alpha: isAlphaServerEnv(),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL?.trim()),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

async function sendDiagnosticPush(input: {
  teamId: string;
  topic: TopicKey;
  tokenId?: string;
  title?: string;
  body?: string;
}) {
  const tokenId = input.tokenId?.trim() ?? "";
  const row = await prisma.nativePushToken.findFirst({
    where: tokenId
      ? { id: tokenId, platform: "ios", enabled: true }
      : { favoriteTeam: input.teamId, platform: "ios", enabled: true },
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
      teamId: input.teamId,
      topic: input.topic,
      apns: getApnsConfigStatus(),
    }, { status: 404 });
  }

  const token = describeToken(row, input.topic);
  if (!token.deliverable) {
    return NextResponse.json({
      ok: false,
      error: "token_not_deliverable_for_current_filters",
      teamId: input.teamId,
      topic: input.topic,
      token,
      apns: getApnsConfigStatus(),
    }, { status: 409 });
  }

  try {
    const result = await sendApnsDebug({
      token: row.token,
      title: input.title?.trim() || "Ground 알림 테스트",
      body: input.body?.trim() || "APNs 직접 발송 테스트입니다.",
      url: "/today",
      data: { teamId: input.teamId, topicKey: input.topic, source: "push-diagnostics" },
    });

    return NextResponse.json({
      ok: result.ok,
      teamId: input.teamId,
      topic: input.topic,
      token,
      apns: getApnsConfigStatus(),
      result,
    }, { status: result.ok ? 200 : 502 });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: "apns_send_failed",
      message: (err as Error).message,
      teamId: input.teamId,
      topic: input.topic,
      token,
      apns: getApnsConfigStatus(),
    }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!isAuthorized(req, url)) {
    return NextResponse.json({
      ok: false,
      error: "unauthorized",
      hasAuthSecret: authSecrets().length > 0,
    }, { status: 401 });
  }

  const teamId = (url.searchParams.get("teamId") ?? "").trim().toLowerCase() || null;
  const topic = parseTopic(url.searchParams.get("topic"));
  if (url.searchParams.get("send") === "1") {
    return sendDiagnosticPush({
      teamId: teamId ?? "lg",
      topic,
      tokenId: url.searchParams.get("tokenId") ?? undefined,
      title: url.searchParams.get("title") ?? undefined,
      body: url.searchParams.get("body") ?? undefined,
    });
  }

  let rows: NativeTokenRow[];
  let nativeTotal: number;
  let nativeEnabled: number;
  let iosEnabled: number;
  let webEnabled: number;
  try {
    rows = await latestNativeRows(teamId);
    [nativeTotal, nativeEnabled, iosEnabled, webEnabled] = await Promise.all([
      prisma.nativePushToken.count(),
      prisma.nativePushToken.count({ where: { enabled: true } }),
      prisma.nativePushToken.count({ where: { enabled: true, platform: "ios" } }),
      prisma.pushSubscription.count({ where: { enabled: true } }),
    ]);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: "database_unavailable",
      message: errorMessage(error),
      server: diagnosticServerStatus(),
      apns: getApnsConfigStatus(),
      query: { teamId, topic },
    }, { status: 503 });
  }

  const described = rows.map((row) => describeToken(row, topic));

  return NextResponse.json({
    ok: true,
    server: diagnosticServerStatus(),
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
      hasAuthSecret: authSecrets().length > 0,
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
  return sendDiagnosticPush({
    teamId,
    topic,
    tokenId: body.tokenId ?? url.searchParams.get("tokenId") ?? undefined,
    title: body.title,
    body: body.body,
  });
}
