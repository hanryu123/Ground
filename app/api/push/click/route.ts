import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/push/click?n=MARKETING_PUSH_ID&u=ENCODED_REDIRECT_URL
 *
 * 1) MarketingPush.clickCount += 1
 * 2) 301 redirect → 원래 URL
 */
export async function GET(req: Request) {
  const reqUrl = new URL(req.url);
  const { searchParams } = reqUrl;
  const notificationId = searchParams.get("n");
  const redirectUrl = searchParams.get("u");

  if (notificationId) {
    prisma.marketingPush
      .update({ where: { id: notificationId }, data: { clickCount: { increment: 1 } } })
      .catch(() => {});
  }

  const raw = redirectUrl ? decodeURIComponent(redirectUrl) : "/today";
  // 절대 URL이 아니면 현재 origin 기준으로 변환
  const destination = raw.startsWith("http://") || raw.startsWith("https://")
    ? raw
    : `${reqUrl.origin}${raw.startsWith("/") ? raw : `/${raw}`}`;

  return NextResponse.redirect(destination, 302);
}
