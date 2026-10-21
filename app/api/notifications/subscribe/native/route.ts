import { NextResponse, after } from "next/server";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ensureNotifyUser, resolveNotifyUserId } from "@/lib/notifyIdentity";
import { resolveServerAppEnv } from "@/lib/appEnv";
import { sendWelcomeIfFirst } from "@/lib/notifications/welcome";

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

function isAnonymousUserId(userId: string): boolean {
  return userId === "anonymous" || userId === "anonymous-web";
}

function nativeTokenUserId(token: string): string {
  const hash = createHash("sha256").update(token).digest("hex").slice(0, 24);
  return `native-${hash}`;
}

/**
 * POST /api/notifications/subscribe/native
 * Capacitor 네이티브 앱에서 FCM/APNs 토큰을 서버에 등록.
 */
export async function POST(req: Request) {
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

  const headerUserId = resolveNotifyUserId(req.headers.get("x-ground-user-id"));
  const userId = isAnonymousUserId(headerUserId) ? nativeTokenUserId(token) : headerUserId;

  await ensureNotifyUser(userId, { favoriteTeam: body.favoriteTeam ?? null });

  const topics = normalizeTopics(body.topics);
  const appEnv = resolveServerAppEnv();

  // 앱을 켤 때마다 같은 토큰으로 다시 등록되므로, 처음 들어온 토큰일 때만 웰컴 알림 대상이다.
  const isNewToken = !(await prisma.nativePushToken.findUnique({
    where: { token },
    select: { id: true },
  }));

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

  if (isNewToken) {
    const favoriteTeam = body.favoriteTeam ?? null;
    after(() =>
      sendWelcomeIfFirst({ userId, token, platform, favoriteTeam }).catch((err) => {
        console.warn("[welcome] send failed:", (err as Error).message);
      })
    );
  }

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
