import path from "node:path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env.vercel-test") });
dotenv.config();

type Step = {
  label: string;
  myScore: number;
  oppScore: number;
  latestPlayText: string;
  fallbackBody: string;
  type: "GAME_START" | "SCORE_UPDATE" | "GAME_RESULT";
};

const STEPS: Step[] = [
  {
    label: "경기 시작",
    myScore: 0,
    oppScore: 0,
    latestPlayText: "1회초 경기 시작, LG 선공",
    fallbackBody: "[1회초] 플레이볼! 오늘 인천 원정 바로 찢자 ⚾️",
    type: "GAME_START",
  },
  {
    label: "2회초 문정빈 홈런",
    myScore: 2,
    oppScore: 0,
    latestPlayText:
      "2회초 LG 문정빈 좌익수 뒤 홈런 (홈런거리:125M) 투수 김건우 134Km/h 슬라이더, 1루주자 박동원 홈인",
    fallbackBody: "[2회초] 문정빈 투런포! 시작부터 박살낸다 🔥",
    type: "SCORE_UPDATE",
  },
  {
    label: "2회말 실점",
    myScore: 2,
    oppScore: 1,
    latestPlayText: "2회말 SSG 김재환 우중간 뒤 홈런 (홈런거리:135M) 투수 임찬규 142Km/h 직구",
    fallbackBody: "[2회말] 한 점 줬네. 바로 되갚아주자 🤬",
    type: "SCORE_UPDATE",
  },
  {
    label: "5회초 오스틴 3점 홈런",
    myScore: 5,
    oppScore: 1,
    latestPlayText:
      "5회초 LG 오스틴 좌익수 뒤 홈런 (홈런거리:120M) 투수 김건우 119Km/h 커브, 3루주자 신민재 홈인, 2루주자 홍창기 홈인",
    fallbackBody: "[5회초] 오스틴 쓰리런! 오늘은 우리가 찢는다 🚀",
    type: "SCORE_UPDATE",
  },
  {
    label: "5회말 오태곤 홈런",
    myScore: 5,
    oppScore: 2,
    latestPlayText: "5회말 SSG 오태곤 좌중간 뒤 홈런 (홈런거리:120M) 투수 임찬규 112Km/h 커브",
    fallbackBody: "[5회말] 아쉽다. 아직 넉넉하게 앞선다 😤",
    type: "SCORE_UPDATE",
  },
  {
    label: "5회말 박성한 적시타",
    myScore: 5,
    oppScore: 3,
    latestPlayText:
      "5회말 SSG 박성한 좌중간 1루타, 2루주자 안상현 홈인 (투수 임찬규 133Km/h 슬라이더)",
    fallbackBody: "[5회말] 또 한 점 허용. 바로 흐름 끊자 🤬",
    type: "SCORE_UPDATE",
  },
  {
    label: "8회초 오스틴 홈런",
    myScore: 6,
    oppScore: 3,
    latestPlayText: "8회초 LG 오스틴 좌익수 뒤 홈런 (홈런거리:115M) 투수 노경은 138Km/h 포크",
    fallbackBody: "[8회초] 빛스틴 또 넘겼다! 승기 굳힌다 🔥",
    type: "SCORE_UPDATE",
  },
  {
    label: "8회말 에레디아 홈런",
    myScore: 6,
    oppScore: 4,
    latestPlayText: "8회말 SSG 에레디아 좌중간 뒤 홈런 (홈런거리:125M) 투수 김영우 151Km/h 직구",
    fallbackBody: "[8회말] 한 점 더 내줬지만 아직 리드다 😤",
    type: "SCORE_UPDATE",
  },
  {
    label: "경기 종료",
    myScore: 6,
    oppScore: 4,
    latestPlayText: "경기 종료. LG 6:4 승리",
    fallbackBody: "[경기종료] 이겼다! 오늘도 LG가 증명했다 🏆",
    type: "GAME_RESULT",
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
      where: {
        enabled: true,
        user: { favoriteTeam: "lg" },
      },
      orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
      select: {
        endpoint: true,
        p256dh: true,
        auth: true,
        userId: true,
      },
    });

    if (!sub) {
      console.log("LG 활성 구독 유저를 찾지 못했어.");
      process.exitCode = 1;
      return;
    }

    for (const [i, step] of STEPS.entries()) {
      const copy = await generateScorePushCopyWithOptions(
        {
          favoriteTeam: "lg",
          opponentTeam: "ssg",
          myScore: step.myScore,
          oppScore: step.oppScore,
          latestPlayText: step.latestPlayText,
          fallbackTitle: "⚾️ LG 실시간",
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
          teamId: "lg",
          latestPlayText: step.latestPlayText,
        },
        {
          favoriteTeam: "lg",
          origin: process.env.NEXT_PUBLIC_BASE_URL ?? null,
        }
      );

      if (!result.ok) {
        console.log(`STEP ${i + 1} FAIL(${step.label}): ${result.statusCode ?? "unknown"} ${result.body ?? ""}`);
        continue;
      }

      await prisma.notification.create({
        data: {
          userId: sub.userId,
          type: step.type,
          title: copy.title,
          body: copy.body,
          deeplinkUrl: "/today",
          sentAt: new Date(),
          payload: {
            source: "manual_test",
            scenario: "lg_yesterday_full_sim",
            step: i + 1,
            label: step.label,
            latestPlayText: step.latestPlayText,
          },
        },
      });

      console.log(`STEP ${i + 1} (${step.label}): ${copy.body}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
