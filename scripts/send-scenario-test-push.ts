import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

type ScenarioStep = {
  latestPlayText: string;
  myScore: number;
  oppScore: number;
  fallbackBody: string;
};

const SCENARIO: ScenarioStep[] = [
  {
    latestPlayText: "9회초 2:2 상황, 손주영이 뜬공-삼진-땅볼로 삼자범퇴 처리",
    myScore: 2,
    oppScore: 2,
    fallbackBody: "[9회초] 손주영 삼자범퇴! 흐름 완전 우리 쪽 🔥",
  },
  {
    latestPlayText: "9회말 노아웃, 신민재 솔로 홈런",
    myScore: 3,
    oppScore: 2,
    fallbackBody: "[9회말] 신민재 솔로포! 끝내기 분위기 간다 🚀",
  },
  {
    latestPlayText: "경기 종료. LG 3:2 승리",
    myScore: 3,
    oppScore: 2,
    fallbackBody: "[경기종료] LG 승리! 오늘도 증명했다 ⚾️",
  },
];

async function main() {
  const [{ prisma }, { generateScorePushCopy }, { sendWebPush }] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/pushLlm"),
    import("@/lib/webPushServer"),
  ]);

  try {
    const sub = await prisma.pushSubscription.findFirst({
      where: {
        enabled: true,
        user: { favoriteTeam: "lg" },
      },
      orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
      select: {
        endpoint: true,
        p256dh: true,
        auth: true,
        user: { select: { id: true, favoriteTeam: true } },
      },
    });

    if (!sub) {
      console.log("LG 활성 구독 유저를 찾지 못했어.");
      process.exitCode = 1;
      return;
    }

    for (const [index, step] of SCENARIO.entries()) {
      const copy = await generateScorePushCopy({
        favoriteTeam: "lg",
        opponentTeam: "doosan",
        myScore: step.myScore,
        oppScore: step.oppScore,
        latestPlayText: step.latestPlayText,
        fallbackTitle: "⚾️ LG 실시간",
        fallbackBody: step.fallbackBody,
      });

      const result = await sendWebPush(
        {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
        {
          title: copy.title,
          body: copy.body,
          url: "/today",
          teamId: "lg",
          latestPlayText: step.latestPlayText,
        },
        {
          favoriteTeam: sub.user.favoriteTeam ?? "lg",
          origin: process.env.NEXT_PUBLIC_BASE_URL ?? null,
        }
      );

      if (!result.ok) {
        console.log(`STEP ${index + 1} FAIL: ${result.statusCode ?? "unknown"} ${result.body ?? ""}`);
        process.exitCode = 1;
        return;
      }

      await prisma.notification.create({
        data: {
          userId: sub.user.id,
          type: index === SCENARIO.length - 1 ? "GAME_RESULT" : "SCORE_UPDATE",
          title: copy.title,
          body: copy.body,
          deeplinkUrl: "/today",
          sentAt: new Date(),
          payload: {
            source: "manual_test",
            step: index + 1,
            latestPlayText: step.latestPlayText,
          },
        },
      });

      console.log(`STEP ${index + 1}: ${copy.body}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
