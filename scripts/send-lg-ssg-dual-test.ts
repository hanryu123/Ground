import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env.vercel-test") });
dotenv.config();

type Step = {
  label: string;
  favoriteTeam: "lg" | "ssg";
  opponentTeam: "lg" | "ssg";
  myScore: number;
  oppScore: number;
  latestPlayText: string;
  fallbackBody: string;
};

const STEPS: Step[] = [
  {
    label: "LG fan viewpoint",
    favoriteTeam: "lg",
    opponentTeam: "ssg",
    myScore: 3,
    oppScore: 5,
    latestPlayText:
      "5회초 LG 오스틴 좌익수 뒤 홈런 (홈런거리:120M) 투수 김건우 119Km/h 커브, 3루주자 신민재 홈인, 2루주자 홍창기 홈인",
    fallbackBody: "[5회초] 오스틴 쓰리런! 이제 흐름 우리 쪽 🔥",
  },
  {
    label: "SSG fan viewpoint",
    favoriteTeam: "ssg",
    opponentTeam: "lg",
    myScore: 6,
    oppScore: 4,
    latestPlayText: "8회말 SSG 에레디아 좌중간 뒤 홈런 (홈런거리:125M) 투수 김영우 151Km/h 직구",
    fallbackBody: "[8회말] 에레디아 대포! 승기 굳혔다 🚀",
  },
];

async function main() {
  const [{ prisma }, { generateScorePushCopyWithOptions }, { sendWebPush }] = await Promise.all([
    import("@/lib/prisma"),
    import("@/lib/pushLlm"),
    import("@/lib/webPushServer"),
  ]);

  const testKey = process.env.ANTHROPIC_API_KEY_TEST?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || "";

  try {
    const sub = await prisma.pushSubscription.findFirst({
      where: { enabled: true },
      orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        userId: true,
        endpoint: true,
        p256dh: true,
        auth: true,
      },
    });

    if (!sub) {
      console.log("활성 구독 유저를 찾지 못했어.");
      process.exitCode = 1;
      return;
    }

    for (const step of STEPS) {
      const copy = await generateScorePushCopyWithOptions(
        {
          favoriteTeam: step.favoriteTeam,
          opponentTeam: step.opponentTeam,
          myScore: step.myScore,
          oppScore: step.oppScore,
          latestPlayText: step.latestPlayText,
          fallbackTitle: "⚾️ TEST 실시간",
          fallbackBody: step.fallbackBody,
        },
        {
          apiKeyOverride: testKey || undefined,
          maxTokens: 72,
          temperature: 0.85,
          timeoutMs: 3200,
        }
      );

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
          teamId: step.favoriteTeam,
          latestPlayText: step.latestPlayText,
        },
        {
          favoriteTeam: step.favoriteTeam,
          origin: process.env.NEXT_PUBLIC_BASE_URL ?? null,
        }
      );

      if (!result.ok) {
        console.log(`${step.label}: FAIL ${result.statusCode ?? "unknown"} ${result.body ?? ""}`);
        process.exitCode = 1;
        continue;
      }

      await prisma.notification.create({
        data: {
          userId: sub.userId,
          type: "SCORE_UPDATE",
          title: copy.title,
          body: copy.body,
          deeplinkUrl: "/today",
          sentAt: new Date(),
          payload: {
            source: "manual_test",
            scenario: "lg_ssg_dual_viewpoint",
            viewpoint: step.favoriteTeam,
            latestPlayText: step.latestPlayText,
          },
        },
      });

      console.log(`${step.label}: ${copy.body}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
