import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

async function main() {
  const [{ prisma }, { generateScorePushCopy }, { sendWebPush }] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/pushLlm"),
    import("@/lib/webPushServer"),
  ]);

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
    return;
  }

  const copy = await generateScorePushCopy({
    favoriteTeam: "lg",
    opponentTeam: "doosan",
    myScore: 2,
    oppScore: 2,
    latestPlayText: "8회말 2:0으로 이기고 있었는데 우강훈이 올라와 투런포 허용",
    fallbackTitle: "⚾️ LG 실시간",
    fallbackBody: "우강훈 투런 허용... 2:2 됐다. 바로 다시 뒤집자 🔥",
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
    },
    {
      favoriteTeam: sub.user.favoriteTeam,
      origin: process.env.NEXT_PUBLIC_BASE_URL ?? null,
    }
  );

  if (result.ok) {
    await prisma.notification.create({
      data: {
        userId: sub.user.id,
        type: "SCORE_UPDATE",
        title: copy.title,
        body: copy.body,
        deeplinkUrl: "/today",
        sentAt: new Date(),
        payload: {
          source: "manual_test",
          scenario: "live_one_shot",
        },
      },
    });
    console.log(`발송 성공: ${copy.body}`);
  } else {
    console.log(`발송 실패: ${result.statusCode ?? "unknown"} ${result.body ?? ""}`);
  }

  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
