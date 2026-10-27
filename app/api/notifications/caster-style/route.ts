import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveNotifyUserId } from "@/lib/notifyIdentity";
import { CASTER_STYLES, type CasterStyle } from "@/lib/notifications/casterStyle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withStyle(topics: unknown, casterStyle: CasterStyle): Prisma.InputJsonValue {
  const base = topics && typeof topics === "object" && !Array.isArray(topics) ? (topics as Record<string, unknown>) : {};
  return { ...base, casterStyle } as Prisma.InputJsonValue;
}

/**
 * POST /api/notifications/caster-style
 * 알림 설정에서 득점 알림 말투를 바꾸면 그 유저의 웹·앱 구독 전부에 저장한다.
 */
export async function POST(req: Request) {
  const userId = resolveNotifyUserId(req.headers.get("x-ground-user-id"));
  if (userId === "anonymous-web" || userId === "anonymous") {
    return NextResponse.json({ ok: false, error: "missing_user" }, { status: 400 });
  }

  let body: { casterStyle?: unknown };
  try {
    body = (await req.json()) as { casterStyle?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const casterStyle = CASTER_STYLES.find((style) => style.id === body.casterStyle)?.id;
  if (!casterStyle) {
    return NextResponse.json({ ok: false, error: "unknown_style" }, { status: 400 });
  }

  const [subs, tokens] = await Promise.all([
    prisma.pushSubscription.findMany({ where: { userId }, select: { id: true, topics: true } }),
    prisma.nativePushToken.findMany({ where: { userId }, select: { id: true, topics: true } }),
  ]);
  await Promise.all([
    ...subs.map((row) =>
      prisma.pushSubscription.update({ where: { id: row.id }, data: { topics: withStyle(row.topics, casterStyle) } })
    ),
    ...tokens.map((row) =>
      prisma.nativePushToken.update({ where: { id: row.id }, data: { topics: withStyle(row.topics, casterStyle) } })
    ),
  ]);

  return NextResponse.json({ ok: true, updated: subs.length + tokens.length });
}
