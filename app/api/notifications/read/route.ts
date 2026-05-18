import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveNotifyUserId } from "@/lib/notifyIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReadBody = {
  notificationIds?: string[];
  readAll?: boolean;
};

export async function POST(req: Request) {
  const userId = resolveNotifyUserId(req.headers.get("x-ground-user-id"));
  let body: ReadBody;
  try {
    body = (await req.json()) as ReadBody;
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const now = new Date();
  if (body.readAll) {
    const updated = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: now },
    });
    return NextResponse.json({ ok: true, updatedCount: updated.count });
  }

  const ids = (body.notificationIds ?? []).filter(Boolean);
  if (ids.length === 0) {
    return NextResponse.json(
      { ok: false, error: "notificationIds_required" },
      { status: 400 }
    );
  }

  const updated = await prisma.notification.updateMany({
    where: {
      userId,
      id: { in: ids },
    },
    data: { isRead: true, readAt: now },
  });
  return NextResponse.json({ ok: true, updatedCount: updated.count });
}
