import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveServerAppEnv } from "@/lib/appEnv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscribeBody = {
  token?: string;
  activityId?: string | null;
  gameId?: string;
  teamId?: string;
};

function normalizeToken(raw: string | undefined): string | null {
  const token = raw?.trim().toLowerCase();
  if (!token || token.length < 32 || !/^[0-9a-f]+$/.test(token)) return null;
  return token;
}

export async function POST(req: Request) {
  let body: SubscribeBody;
  try {
    body = (await req.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const token = normalizeToken(body.token);
  const gameId = body.gameId?.trim();
  const teamId = body.teamId?.trim().toLowerCase();
  const activityId = body.activityId?.trim() || null;

  if (!token) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 400 });
  }
  if (!gameId || !teamId) {
    return NextResponse.json({ ok: false, error: "gameId_teamId_required" }, { status: 400 });
  }

  const saved = await prisma.liveActivitySubscription.upsert({
    where: { token },
    update: {
      activityId,
      gameId,
      teamId,
      enabled: true,
      endedAt: null,
      appEnv: resolveServerAppEnv(),
      lastSeenAt: new Date(),
    },
    create: {
      token,
      activityId,
      gameId,
      teamId,
      enabled: true,
      appEnv: resolveServerAppEnv(),
      lastSeenAt: new Date(),
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: saved.id });
}
