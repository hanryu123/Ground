import { prisma } from "@/lib/prisma";
import { sendApnsMulticast } from "@/lib/apns";
import { sendFcmMulticast } from "@/lib/firebaseAdmin";
import { TEAMS } from "@/lib/teams";

/**
 * 웰컴 알림 — 앱 설치 후 온보딩을 마치고 알림 권한까지 허용한 유저에게 한 번만 보낸다.
 * 인박스 Notification(payload.kind = "welcome")이 있으면 이미 보낸 것으로 본다.
 */

const WELCOME_KIND = "welcome";

function welcomeCopy(favoriteTeam: string | null): { title: string; body: string } {
  const team = favoriteTeam ? TEAMS.find((t) => t.id === favoriteTeam) : undefined;
  if (!team) {
    return {
      title: "알림 켜졌어요 ⚾",
      body: "경기 있는 날 선발부터 결과까지 제때 알려드릴게요.",
    };
  }
  return {
    title: `${team.short} 팬이시군요, 반가워요 ⚾`,
    body: `${team.short} 경기 있는 날 선발부터 결과까지 제때 알려드릴게요.`,
  };
}

export async function sendWelcomeIfFirst(input: {
  userId: string;
  token: string;
  platform: string;
  favoriteTeam: string | null;
}): Promise<void> {
  const already = await prisma.notification.findFirst({
    where: { userId: input.userId, payload: { path: ["kind"], equals: WELCOME_KIND } },
    select: { id: true },
  });
  if (already) return;

  const { title, body } = welcomeCopy(input.favoriteTeam);
  const send = input.platform.toLowerCase() === "ios" ? sendApnsMulticast : sendFcmMulticast;
  const result = await send({
    tokens: [input.token],
    title,
    body,
    url: "/",
    data: { source: WELCOME_KIND },
  });
  if (result.ok === 0) return;

  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: "SYSTEM",
      title,
      body,
      deeplinkUrl: "/",
      sentAt: new Date(),
      payload: { kind: WELCOME_KIND },
    },
  });
}
