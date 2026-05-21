"use server";

import { prisma } from "@/lib/prisma";
import { sendWebPush } from "@/lib/webPushServer";
import { mapWithConcurrency } from "@/lib/concurrency";
import { headers } from "next/headers";

export async function testClaude(): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const secret = process.env.ADMIN_SECRET ?? process.env.ADMIN_PASSWORD;
  const headersList = await headers();
  const host = headersList.get("host") ?? "ground-alpha.vercel.app";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const res = await fetch(`${origin}/api/admin/test-claude`, {
    headers: secret ? { "x-admin-secret": secret } : {},
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: JSON.stringify(json) };
  return { ok: true, result: json };
}

export async function forceCron(path: "preview" | "postgame" | "game-start" | "check-score" | "live-events"): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const cronSecret = process.env.CRON_SECRET;
  const headersList = await headers();
  const host = headersList.get("host") ?? "ground-alpha.vercel.app";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const url = `${origin}/api/cron/${path}?force=1`;
  const res = await fetch(url, {
    headers: cronSecret ? { authorization: `Bearer ${cronSecret}` } : {},
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: JSON.stringify(json) };
  return { ok: true, result: json };
}

export type SendPushResult =
  | { ok: true; sentCount: number; total: number; id: string }
  | { ok: false; error: string };

export async function sendMarketingPush(input: {
  title: string;
  body: string;
  url: string;
  targetTeamId: string | null;
  testOnly: boolean;
}): Promise<SendPushResult> {
  const secret = process.env.ADMIN_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!secret) return { ok: false, error: "서버 설정 오류: ADMIN 키 미설정" };

  const { title, body: msgBody, url, targetTeamId, testOnly } = input;
  if (!title?.trim() || !msgBody?.trim() || !url?.trim()) {
    return { ok: false, error: "필수 항목 누락" };
  }

  const record = await prisma.marketingPush.create({
    data: { title, body: msgBody, url, targetTeamId: targetTeamId || null, testOnly, sentCount: 0, clickCount: 0 },
  });

  const headersList = await headers();
  const host = headersList.get("host") ?? "ground-alpha.vercel.app";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;
  const clickUrl = `${origin}/api/push/click?n=${record.id}&u=${encodeURIComponent(url)}`;

  let subs: Array<{ endpoint: string; p256dh: string; auth: string; userId: string }> = [];

  if (testOnly) {
    const adminEmail = process.env.ADMIN_TEST_EMAIL;
    if (!adminEmail) {
      await prisma.marketingPush.delete({ where: { id: record.id } });
      return { ok: false, error: "ADMIN_TEST_EMAIL 미설정" };
    }
    subs = await prisma.pushSubscription.findMany({
      where: { enabled: true, user: { email: adminEmail } },
      select: { endpoint: true, p256dh: true, auth: true, userId: true },
    });
  } else {
    subs = await prisma.pushSubscription.findMany({
      where: {
        enabled: true,
        ...(targetTeamId ? { user: { favoriteTeam: targetTeamId } } : {}),
      },
      select: { endpoint: true, p256dh: true, auth: true, userId: true },
    });
  }

  if (subs.length === 0) {
    await prisma.marketingPush.delete({ where: { id: record.id } });
    return { ok: false, error: "해당 구독자 없음" };
  }

  const results = await mapWithConcurrency(subs, 12, (sub) =>
    sendWebPush(
      { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { title, body: msgBody, url: clickUrl, teamId: targetTeamId ?? "all" },
      { favoriteTeam: targetTeamId ?? undefined, origin }
    )
  );

  const sentCount = results.filter((r) => r.ok).length;
  await prisma.marketingPush.update({ where: { id: record.id }, data: { sentCount } });

  return { ok: true, id: record.id, sentCount, total: subs.length };
}
