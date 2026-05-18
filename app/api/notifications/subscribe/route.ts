import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureNotifyUser, resolveNotifyUserId } from "@/lib/notifyIdentity";
import { getVapidPublicKey } from "@/lib/webPushServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscribeBody = {
  subscription?: {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
  topics?: {
    pitcher?: boolean;
    preGame?: boolean;
    postGame?: boolean;
    score?: boolean;
  };
  favoriteTeam?: string;
};

type PushTopicFlags = {
  pitcher: boolean;
  preGame: boolean;
  postGame: boolean;
  score: boolean;
};

function normalizeTopics(input: SubscribeBody["topics"]): PushTopicFlags {
  return {
    pitcher: Boolean(input?.pitcher),
    preGame: Boolean(input?.preGame),
    postGame: Boolean(input?.postGame),
    score: Boolean(input?.score),
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    vapidPublicKey: getVapidPublicKey(),
  });
}

export async function POST(req: Request) {
  const userId = resolveNotifyUserId(req.headers.get("x-ground-user-id"));

  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const sub = body.subscription;
  const endpoint = sub?.endpoint?.trim();
  const p256dh = sub?.keys?.p256dh?.trim();
  const auth = sub?.keys?.auth?.trim();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { ok: false, error: "invalid_subscription" },
      { status: 400 }
    );
  }

  await ensureNotifyUser(userId, { favoriteTeam: body.favoriteTeam ?? null });
  const expiration =
    typeof sub?.expirationTime === "number" && Number.isFinite(sub.expirationTime)
      ? new Date(sub.expirationTime)
      : null;

  const topics = normalizeTopics(body.topics);

  const userAgent = req.headers.get("user-agent") ?? undefined;
  const saved = await prisma.$transaction(async (tx) => {
    // 내 유저/현재 기기(user-agent)/같은 endpoint 로 남아있는 낡은 레코드를 전부 지우고
    // 현재 구독 한 건만 새로 생성한다.
    await tx.pushSubscription.deleteMany({
      where: {
        OR: [
          { userId },
          ...(userAgent ? [{ userAgent }] : []),
          { endpoint },
        ],
      },
    });

    return tx.pushSubscription.create({
      data: {
        userId,
        endpoint,
        p256dh,
        auth,
        expirationTime: expiration,
        enabled: true,
        topics,
        userAgent,
        lastSeenAt: new Date(),
      },
    });
  });

  return NextResponse.json({
    ok: true,
    subscriptionId: saved.id,
  });
}
