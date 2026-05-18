import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveNotifyUserId } from "@/lib/notifyIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatusBody = {
  endpoint?: string;
};

export async function POST(req: Request) {
  const userId = resolveNotifyUserId(req.headers.get("x-ground-user-id"));
  let body: StatusBody;
  try {
    body = (await req.json()) as StatusBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim();
  if (!endpoint) {
    return NextResponse.json({ ok: true, status: "unsubscribed" as const });
  }

  const row = await prisma.pushSubscription.findFirst({
    where: {
      userId,
      endpoint,
      enabled: true,
    },
    select: { id: true },
  });

  return NextResponse.json({
    ok: true,
    status: row ? ("subscribed" as const) : ("unsubscribed" as const),
  });
}
