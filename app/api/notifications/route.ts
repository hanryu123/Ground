import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureNotifyUser, resolveNotifyUserId } from "@/lib/notifyIdentity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = resolveNotifyUserId(req.headers.get("x-ground-user-id"));
  await ensureNotifyUser(userId);
  const url = new URL(req.url);
  const take = Math.min(50, Math.max(1, Number(url.searchParams.get("take") ?? 20)));

  const items = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });

  return NextResponse.json({
    ok: true,
    items,
  });
}
