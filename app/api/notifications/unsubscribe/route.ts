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

  await prisma.pushSubscription.updateMany({
    where: { endpoint, userId },
    data: { enabled: false },
  });

  return NextResponse.json({ ok: true });
}
