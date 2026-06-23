"use server";

import { prisma } from "@/lib/prisma";
import { sendApnsMulticast } from "@/lib/apns";
import { sendWebPush } from "@/lib/webPushServer";
import { mapWithConcurrency } from "@/lib/concurrency";
import { headers } from "next/headers";
import { writeAdminAuditLog } from "@/lib/adminAudit";
import { resolveServerAppEnv } from "@/lib/appEnv";

async function readActionResponse(res: Response): Promise<{ parsed: unknown; text: string }> {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return { parsed: null, text: "" };
  try {
    return { parsed: JSON.parse(text), text };
  } catch {
    return { parsed: null, text };
  }
}

function summarizeActionError(path: string, status: number, body: { parsed: unknown; text: string }): string {
  const parsed = body.parsed;
  if (parsed && typeof parsed === "object") {
    const error = (parsed as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim()) {
      return `cron:${path} HTTP ${status} · ${error.slice(0, 260)}`;
    }
    return `cron:${path} HTTP ${status} · ${JSON.stringify(parsed).slice(0, 260)}`;
  }
  const snippet = body.text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
  return `cron:${path} HTTP ${status}${snippet ? ` · ${snippet}` : " · empty response"}`;
}

export async function testClaude(): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY not set in Vercel env" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 50,
        messages: [{ role: "user", content: "한화이글스 팬처럼 삼진 잡았을 때 단톡방 리액션 한 줄만 써줘." }],
      }),
    });
    const status = res.status;
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, error: `HTTP ${status}: ${body.slice(0, 300)}` };
    }
    const json = JSON.parse(body);
    const text = json?.content?.[0]?.text ?? null;
    return { ok: true, result: { status, text, keyPrefix: apiKey.slice(0, 12) + "..." } };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function previewInactiveUsers(): Promise<{ ok: boolean; noSub?: number; stale?: number; error?: string }> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [noSub, stale] = await Promise.all([
      // 구독 자체 없는 유저
      prisma.user.count({
        where: {
          email: null,
          pushSubscriptions: { none: { enabled: true } },
        },
      }),
      // 구독은 있지만 30일 이상 미활동 (앱 삭제 추정)
      prisma.user.count({
        where: {
          email: null,
          pushSubscriptions: {
            every: {
              OR: [
                { enabled: false },
                {
                  enabled: true,
                  lastSeenAt: { lt: thirtyDaysAgo },
                  createdAt: { lt: thirtyDaysAgo },
                },
              ],
            },
          },
        },
      }),
    ]);
    return { ok: true, noSub, stale };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

export async function cleanInactiveUsers(includeStale: boolean): Promise<{ ok: boolean; deleted?: number; error?: string }> {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const whereClause = includeStale
      ? {
          email: null,
          pushSubscriptions: {
            every: {
              OR: [
                { enabled: false },
                {
                  enabled: true,
                  lastSeenAt: { lt: thirtyDaysAgo },
                  createdAt: { lt: thirtyDaysAgo },
                },
              ],
            },
          },
        }
      : {
          email: null,
          pushSubscriptions: { none: { enabled: true } },
        };
    const result = await prisma.user.deleteMany({ where: whereClause });
    await writeAdminAuditLog({
      action: "clean-inactive-users",
      targetType: "user",
      payload: { includeStale },
      result: "success",
    });
    return { ok: true, deleted: result.count };
  } catch (e) {
    const error = String(e).slice(0, 200);
    await writeAdminAuditLog({
      action: "clean-inactive-users",
      targetType: "user",
      payload: { includeStale },
      result: "error",
      error,
    });
    return { ok: false, error };
  }
}

export async function forceCron(
  path: "preview" | "postgame" | "game-start" | "check-score" | "live-events" | "check-highlight",
  teamId?: string,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const cronSecret = process.env.CRON_SECRET;
  const headersList = await headers();
  const host = headersList.get("host") ?? "ground-alpha.vercel.app";
  const proto = host.includes("localhost") ? "http" : "https";
  const origin = `${proto}://${host}`;

  const qs = new URLSearchParams({ force: "1" });
  if (teamId) qs.set("teamId", teamId);
  const url = `${origin}/api/cron/${path}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: cronSecret ? { authorization: `Bearer ${cronSecret}` } : {},
    cache: "no-store",
  });
  const responseBody = await readActionResponse(res);
  const result = responseBody.parsed ?? {
    nonJson: true,
    body: responseBody.text.slice(0, 1000),
  };
  const error = res.ok ? null : summarizeActionError(path, res.status, responseBody);
  await writeAdminAuditLog({
    action: `force-cron:${path}`,
    targetType: "cron",
    targetId: path,
    payload: { teamId: teamId ?? null, status: res.status, result },
    result: res.ok ? "success" : "error",
    error,
  });
  if (!res.ok) return { ok: false, error: error ?? `cron:${path} HTTP ${res.status}` };
  return { ok: true, result };
}

export type SendPushResult =
  | { ok: true; sentCount: number; total: number; id: string }
  | { ok: false; error: string };

export async function estimateMarketingPushTargets(input: {
  targetTeamId: string | null;
  testOnly: boolean;
  testNativeTokenId?: string | null;
}): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const appEnv = resolveServerAppEnv();
    if (input.testOnly) {
      const adminEmail = process.env.ADMIN_TEST_EMAIL;
      const [webCount, nativeCount] = await Promise.all([
        adminEmail
          ? prisma.pushSubscription.count({
              where: { enabled: true, user: { email: adminEmail } },
            })
          : Promise.resolve(0),
        input.testNativeTokenId
          ? prisma.nativePushToken.count({
              where: {
                id: input.testNativeTokenId,
                enabled: true,
                platform: "ios",
                appEnv,
              },
            })
          : Promise.resolve(0),
      ]);
      return { ok: true, count: webCount + nativeCount };
    }

    const [webCount, nativeCount] = await Promise.all([
      prisma.pushSubscription.count({
        where: {
          enabled: true,
          ...(input.targetTeamId ? { user: { favoriteTeam: input.targetTeamId } } : {}),
        },
      }),
      prisma.nativePushToken.count({
        where: {
          enabled: true,
          appEnv,
          ...(input.targetTeamId ? { favoriteTeam: input.targetTeamId } : {}),
        },
      }),
    ]);
    return { ok: true, count: webCount + nativeCount };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

export async function sendMarketingPush(input: {
  title: string;
  body: string;
  url: string;
  targetTeamId: string | null;
  testOnly: boolean;
  testNativeTokenId?: string | null;
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
  const appEnv = resolveServerAppEnv();

  let subs: Array<{ endpoint: string; p256dh: string; auth: string; userId: string }> = [];
  let nativeTokens: Array<{ token: string; userId: string; platform: string }> = [];

  if (testOnly) {
    const adminEmail = process.env.ADMIN_TEST_EMAIL;
    const [webTargets, nativeTarget] = await Promise.all([
      adminEmail
        ? prisma.pushSubscription.findMany({
            where: { enabled: true, user: { email: adminEmail } },
            select: { endpoint: true, p256dh: true, auth: true, userId: true },
          })
        : Promise.resolve([]),
      prisma.nativePushToken.findFirst({
        where: {
          id: input.testNativeTokenId ?? "__missing_test_native_token_id__",
          enabled: true,
          platform: "ios",
          appEnv,
        },
        select: { token: true, userId: true, platform: true },
      }),
    ]);
    subs = webTargets;
    nativeTokens = nativeTarget ? [nativeTarget] : [];
  } else {
    [subs, nativeTokens] = await Promise.all([
      prisma.pushSubscription.findMany({
        where: {
          enabled: true,
          ...(targetTeamId ? { user: { favoriteTeam: targetTeamId } } : {}),
        },
        select: { endpoint: true, p256dh: true, auth: true, userId: true },
      }),
      prisma.nativePushToken.findMany({
        where: {
          enabled: true,
          appEnv,
          ...(targetTeamId ? { favoriteTeam: targetTeamId } : {}),
        },
        select: { token: true, userId: true, platform: true },
      }),
    ]);
  }

  if (subs.length === 0 && nativeTokens.length === 0) {
    await prisma.marketingPush.delete({ where: { id: record.id } });
    await writeAdminAuditLog({
      action: testOnly ? "send-test-marketing-push" : "send-marketing-push",
      targetType: "marketingPush",
      targetId: record.id,
      payload: { title, targetTeamId, testOnly },
      result: "blocked",
      error: "해당 구독자 없음",
    });
    return { ok: false, error: "해당 구독자 없음" };
  }

  const results = subs.length > 0
    ? await mapWithConcurrency(subs, 12, (sub) =>
        sendWebPush(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          { title, body: msgBody, url: clickUrl, teamId: targetTeamId ?? "all" },
          { favoriteTeam: targetTeamId ?? undefined, origin }
        )
      )
    : [];

  let nativeSentCount = 0;
  const iosTokens = nativeTokens.filter((row) => row.platform.toLowerCase() === "ios");
  if (iosTokens.length > 0) {
    const apnsResult = await sendApnsMulticast({
      tokens: iosTokens.map((row) => row.token),
      title,
      body: msgBody,
      url: clickUrl,
      data: { teamId: targetTeamId ?? "all", source: "admin-marketing-push" },
    });
    nativeSentCount += apnsResult.ok;

    if (apnsResult.failed.length > 0) {
      await prisma.nativePushToken.updateMany({
        where: { token: { in: apnsResult.failed } },
        data: { enabled: false },
      });
    }
  }

  const webSentCount = results.filter((r) => r.ok).length;
  const sentCount = webSentCount + nativeSentCount;
  const total = subs.length + nativeTokens.length;
  await prisma.marketingPush.update({ where: { id: record.id }, data: { sentCount } });
  await writeAdminAuditLog({
    action: testOnly ? "send-test-marketing-push" : "send-marketing-push",
    targetType: "marketingPush",
    targetId: record.id,
    payload: { title, body: msgBody, url, targetTeamId, testOnly, total, web: subs.length, native: nativeTokens.length },
    result: "success",
  });

  return { ok: true, id: record.id, sentCount, total };
}
