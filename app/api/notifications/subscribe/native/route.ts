import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureNotifyUser, resolveNotifyUserId } from "@/lib/notifyIdentity";
import { resolveServerAppEnv } from "@/lib/appEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NativeSubscribeBody = {
  token?: string;
  platform?: "ios" | "android" | string;
  favoriteTeam?: string;
  topics?: {
    pitcher?: boolean;
    preGame?: boolean;
    postGame?: boolean;
    highlight?: boolean;
    score?: boolean;
    livePitcherChange?: boolean;
    liveStrikeout?: boolean;
    liveHomeRun?: boolean;
  };
};

type PushTopicFlags = {
  pitcher: boolean;
  preGame: boolean;
  postGame: boolean;
  highlight: boolean;
  score: boolean;
  livePitcherChange: boolean;
  liveStrikeout: boolean;
  liveHomeRun: boolean;
  appEnv: "production" | "alpha" | "development";
};

function normalizeTopics(input: NativeSubscribeBody["topics"]): PushTopicFlags {
  const on = (v: boolean | undefined) => v !== false;
  return {
    pitcher: on(input?.pitcher),
    preGame: on(input?.preGame),
    postGame: on(input?.postGame),
    highlight: on(input?.highlight),
    score: on(input?.score),
    livePitcherChange: on(input?.livePitcherChange),
    liveStrikeout: on(input?.liveStrikeout),
    liveHomeRun: on(input?.liveHomeRun),
    appEnv: resolveServerAppEnv(),
  };
}

/**
 * POST /api/notifications/subscribe/native
 * Capacitor 네이티브 앱에서 FCM/APNs 토큰을 서버에 등록.
 */
export async function POST(req: Request) {
  const userId = resolveNotifyUserId(req.headers.get("x-ground-user-id"));

  let body: NativeSubscribeBody;
  try {
    body = (await req.json()) as NativeSubscribeBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const token = body.token?.trim();
  const platform = body.platform ?? "android";
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }

  await ensureNotifyUser(userId, { favoriteTeam: body.favoriteTeam ?? null });

  const topics = normalizeTopics(body.topics);
  const appEnv = resolveServerAppEnv();

  const saved = await prisma.nativePushToken.upsert({
    where: { token },
    update: {
      userId,
      platform,
      enabled: true,
      favoriteTeam: body.favoriteTeam ?? null,
      topics,
      appEnv,
      lastSeenAt: new Date(),
    },
    create: {
      userId,
      token,
      platform,
      enabled: true,
      favoriteTeam: body.favoriteTeam ?? null,
      topics,
      appEnv,
      lastSeenAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, tokenId: saved.id });
}

/**
 * DELETE /api/notifications/subscribe/native
 * 알림 수신 거부 시 토큰 비활성화.
 */
export async function DELETE(req: Request) {
  let body: { token?: string };
  try {
    body = (await req.json()) as { token?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const token = body.token?.trim();
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
  }
  await prisma.nativePushToken.updateMany({
    where: { token },
    data: { enabled: false },
  });
  return NextResponse.json({ ok: true });
}
