import { prisma } from "@/lib/prisma";
import { sendApnsMulticast } from "@/lib/apns";
import { sendFcmMulticast } from "@/lib/firebaseAdmin";
import { TEAMS } from "@/lib/teams";
import type { CasterStyle } from "@/lib/notifications/casterStyle";

/**
 * 웰컴 알림 — 앱 설치 후 온보딩을 마치고 알림 권한까지 허용한 유저에게 한 번만 보낸다.
 * 인박스 Notification(payload.kind = "welcome")이 있으면 이미 보낸 것으로 본다.
 */

const WELCOME_KIND = "welcome";

/** 온보딩에서 고른 득점 알림 말투로 첫인사 */
function welcomeCopy(favoriteTeam: string | null, style: CasterStyle): { title: string; body: string } {
  const team = favoriteTeam ? TEAMS.find((t) => t.id === favoriteTeam) : undefined;
  if (!team) {
    return {
      title: "알림 켜졌어요 ⚾",
      body: "경기 있는 날 선발부터 결과까지 제때 알려드릴게요.",
    };
  }
  const t = team.short;
  switch (style) {
    case "diehard":
      return {
        title: `${t} 팬 만났다ㅠㅠ 반가워`,
        body: `오늘부터 우리 같이 울고 웃는 거다ㅠㅠ ${t} 점수 나면 제일 먼저 소리 지르러 갈게`,
      };
    case "caster":
      return {
        title: "편파 중계석 오픈!!!",
        body: `${t} 전담 캐스터 마이크 잡았습니다!!! 점수 나면 목이 터져라 외쳐 드립니다!!! 실점하면… (삐-) 각오하십시오!!!`,
      };
    case "tiger":
      return {
        title: "신입 들어왔나",
        body: `${t} 경기 있는 날은 다 챙겨 본다. 점수 나면 바로 보고한다. 알림 끄는 놈은 2군이다.`,
      };
    case "elon":
      return {
        title: "발사 준비 완료 🚀",
        body: `${t} 시즌 궤도 진입. 점수 나면 바로 쏴 준다. 최종 목적지는 우승, 그다음은 화성.`,
      };
    case "analyst":
      return {
        title: `${t} 팬 여러분, 반갑습니다`,
        body: `${t} 경기 있는 날, 선발부터 결과까지 차분하게 정리해 드리겠습니다.`,
      };
  }
}

export async function sendWelcomeIfFirst(input: {
  userId: string;
  token: string;
  platform: string;
  favoriteTeam: string | null;
  casterStyle: CasterStyle;
}): Promise<void> {
  const already = await prisma.notification.findFirst({
    where: { userId: input.userId, payload: { path: ["kind"], equals: WELCOME_KIND } },
    select: { id: true },
  });
  if (already) return;

  const { title, body } = welcomeCopy(input.favoriteTeam, input.casterStyle);
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
