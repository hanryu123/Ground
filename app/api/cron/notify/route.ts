import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendWebPush } from "@/lib/webPushServer";
import { findTeam } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MESSAGE_TITLE = "KBO TODAY";
const MESSAGE_BODY = "곧 시작이다. 오늘 경기 같이 달리자 ⚾️";

type ActiveSubscription = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  topics: unknown;
  user: {
    favoriteTeam: string | null;
  };
};

type SubscriptionTopics = {
  preGame?: boolean;
  postGame?: boolean;
  gameEnd?: boolean;
};

type NotifyKind = "preGame" | "gameEnd";
type GameResultTone = "win" | "loss" | "draw";

function isNotifyEnabled(topics: unknown, kind: NotifyKind): boolean {
  if (!topics || typeof topics !== "object") return false;
  const parsed = topics as SubscriptionTopics;
  if (kind === "preGame") return Boolean(parsed.preGame);
  // Backward compatibility: legacy postGame 토글도 종료 알림으로 인정.
  return Boolean(parsed.gameEnd || parsed.postGame);
}

function hashString(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickDeterministic<T>(items: readonly T[], seed: string): T {
  return items[hashString(seed) % items.length];
}

function buildPreGameCopy(teamId: string, dateSeed: string) {
  const team = findTeam(teamId);
  const samples = [
    `${team.short} 잠시 후 시작한다. 오늘은 우리가 먼저 때린다.`,
    `곧 플레이볼. ${team.short} 오늘도 찢어버리자.`,
    `경기 15분 전, 심장 뜀? ${team.short} 달려간다.`,
    `${team.short} 출근 완료. 이제 상대 멘탈 부수러 간다.`,
  ] as const;
  const body = pickDeterministic(samples, `${teamId}:${dateSeed}`);
  return {
    title: `${team.short} 곧 경기 시작! ⚾️`,
    body,
  };
}

function buildGameEndCopy(teamId: string, tone: GameResultTone, myScore?: number, oppScore?: number) {
  const team = findTeam(teamId);
  const scoreText =
    typeof myScore === "number" && typeof oppScore === "number"
      ? ` (${myScore}:${oppScore})`
      : "";
  if (tone === "win") {
    return {
      title: `${team.short} 이겼다 ㅋㅋ`,
      body: `오늘도 증명했다. ${team.short} 승리${scoreText}. 하이라이트 보러 가자.`,
    };
  }
  if (tone === "draw") {
    return {
      title: `${team.short} 오늘은 무승부`,
      body: `아쉽지만 안 졌다. ${team.short}${scoreText}. 다음 경기에서 끝내자.`,
    };
  }
  return {
    title: `${team.short} 오늘은 졌다`,
    body: `아 ㅅㅂ 오늘은 여기까지${scoreText}. 다음 판에서 바로 갚아준다.`,
  };
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 로컬 개발 편의
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const kindParam = url.searchParams.get("kind");
  const kind: NotifyKind = kindParam === "gameEnd" ? "gameEnd" : "preGame";
  const teamId = url.searchParams.get("teamId")?.trim().toLowerCase() || null;
  const resultParam = url.searchParams.get("result");
  const resultTone: GameResultTone =
    resultParam === "win" || resultParam === "loss" || resultParam === "draw"
      ? resultParam
      : "win";
  const myScore = Number.parseInt(url.searchParams.get("myScore") ?? "", 10);
  const oppScore = Number.parseInt(url.searchParams.get("oppScore") ?? "", 10);
  const dateSeed = new Date().toISOString().slice(0, 10);

  const generated =
    teamId == null
      ? { title: MESSAGE_TITLE, body: MESSAGE_BODY }
      : kind === "preGame"
        ? buildPreGameCopy(teamId, dateSeed)
        : buildGameEndCopy(
            teamId,
            resultTone,
            Number.isFinite(myScore) ? myScore : undefined,
            Number.isFinite(oppScore) ? oppScore : undefined
          );

  const title = url.searchParams.get("title")?.trim() || generated.title;
  const body = url.searchParams.get("body")?.trim() || generated.body;

  const activeSubs: ActiveSubscription[] = await prisma.pushSubscription.findMany({
    where: {
      enabled: true,
      ...(teamId ? { user: { is: { favoriteTeam: teamId } } } : {}),
    },
    select: {
      id: true,
      userId: true,
      endpoint: true,
      p256dh: true,
      auth: true,
      topics: true,
      user: {
        select: {
          favoriteTeam: true,
        },
      },
    },
  });
  const filteredSubs = activeSubs.filter((sub) => isNotifyEnabled(sub.topics, kind));
  if (filteredSubs.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      disabled: 0,
      notificationsCreated: 0,
      message: `no ${kind} subscriptions`,
    });
  }

  const targetUserIds = Array.from(new Set(filteredSubs.map((s) => s.userId)));
  await prisma.notification.createMany({
    data: targetUserIds.map((userId) => ({
      userId,
      type: kind === "preGame" ? "PREDICTION_REMINDER" : "GAME_RESULT",
      title,
      body,
      deeplinkUrl: "/today",
      sentAt: new Date(),
    })),
  });

  let sent = 0;
  let disabled = 0;
  for (const sub of filteredSubs) {
    const result = await sendWebPush(
      {
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
      {
        title,
        body,
        url: "/today",
        ...(sub.user.favoriteTeam ?? teamId
          ? { teamId: sub.user.favoriteTeam ?? teamId ?? undefined }
          : {}),
      },
      { favoriteTeam: sub.user.favoriteTeam, origin: url.origin }
    );
    if (result.ok) {
      sent += 1;
      continue;
    }
    if (
      result.statusCode === 401 ||
      result.statusCode === 403 ||
      result.statusCode === 404 ||
      result.statusCode === 410
    ) {
      await prisma.pushSubscription.update({
        where: { id: sub.id },
        data: { enabled: false },
      });
      disabled += 1;
    }
  }

  await prisma.user.updateMany({
    where: { id: { in: targetUserIds } },
    data: { lastNotifiedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    kind,
    teamId,
    sent,
    disabled,
    notificationsCreated: targetUserIds.length,
  });
}
