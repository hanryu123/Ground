import { NextResponse } from "next/server";
import { recordPushOpen } from "@/lib/pushMetrics";
import { parseCasterStyle } from "@/lib/notifications/casterStyle";

export const runtime = "nodejs";

/** POST { batchId, userId, casterStyle } — 알림을 눌러 앱을 열었다 (묶음당 사람 한 번만 센다) */
export async function POST(req: Request) {
  let body: { batchId?: unknown; userId?: unknown; casterStyle?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const batchId = typeof body.batchId === "string" ? body.batchId : "";
  const userId = typeof body.userId === "string" ? body.userId : "";
  if (!/^[a-f0-9]{16}$/.test(batchId) || !userId || userId.length > 120) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const recorded = await recordPushOpen({
    batchId,
    userId,
    casterStyle: body.casterStyle == null ? null : parseCasterStyle(body.casterStyle),
  });
  return NextResponse.json({ ok: true, recorded });
}
