import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveNotifyUserId } from "@/lib/notifyIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const userId = resolveNotifyUserId(req.headers.get("x-ground-user-id"));
  let body: { endpoint?: string };
  try {
    body = (await req.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim();
  if (!endpoint) {
    return NextResponse.json({ ok: false, error: "endpoint_required" }, { status: 400 });
  }

  // userId가 바뀐 세션에서도 endpoint 기준 해지가 되도록 완화한다.
  // (동일 브라우저 endpoint는 유일해야 하므로 안전)
  await prisma.pushSubscription.updateMany({
    where: { endpoint },
    data: { enabled: false },
  });

  return NextResponse.json({ ok: true, userId });
}
