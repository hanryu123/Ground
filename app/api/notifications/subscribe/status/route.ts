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

  const exactMatch = await prisma.pushSubscription.findFirst({
    where: {
      userId,
      endpoint,
      enabled: true,
    },
    select: { id: true },
  });

  if (exactMatch) {
    return NextResponse.json({
      ok: true,
      status: "subscribed" as const,
      staleIdentity: false,
    });
  }

  // 브라우저 localStorage 초기화 등으로 userId가 바뀌어도
  // 같은 endpoint 구독이 살아있으면 "구독됨"으로 간주한다.
  const endpointOnlyMatch = await prisma.pushSubscription.findFirst({
    where: {
      endpoint,
      enabled: true,
    },
    select: { id: true },
  });

  return NextResponse.json({
    ok: true,
    status: endpointOnlyMatch ? ("subscribed" as const) : ("unsubscribed" as const),
    staleIdentity: Boolean(endpointOnlyMatch),
  });
}
