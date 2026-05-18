import path from "node:path";
import dotenv from "dotenv";
import { generateScorePushCopyWithOptions } from "@/lib/pushLlm";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();
dotenv.config({ path: path.join(process.cwd(), ".env.vercel-test") });

// 보안상 키를 코드에 하드코딩하지 않고 테스트 전용 환경변수에서 주입한다.
const testKey = process.env.ANTHROPIC_API_KEY_TEST?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || "";

async function main() {
  if (!testKey) {
    throw new Error("ANTHROPIC_API_KEY_TEST (or ANTHROPIC_API_KEY) is missing.");
  }

  const lg = await generateScorePushCopyWithOptions(
    {
      favoriteTeam: "lg",
      opponentTeam: "ssg",
      myScore: 3,
      oppScore: 5,
      latestPlayText:
        "5회초 LG 오스틴 좌익수 뒤 홈런 (홈런거리:120M) 투수 김건우 119Km/h 커브, 3루주자 신민재 홈인, 2루주자 홍창기 홈인",
      fallbackTitle: "⚾️ LG 실시간",
      fallbackBody: "[5회초] 오스틴 쓰리런! 분위기 뒤집는다 🔥",
    },
    {
      apiKeyOverride: testKey,
      maxTokens: 72,
      temperature: 0.85,
      timeoutMs: 1400,
    }
  );

  const ssg = await generateScorePushCopyWithOptions(
    {
      favoriteTeam: "ssg",
      opponentTeam: "lg",
      myScore: 6,
      oppScore: 4,
      latestPlayText: "8회말 SSG 에레디아 좌중간 뒤 홈런 (홈런거리:125M) 투수 김영우 151Km/h 직구",
      fallbackTitle: "⚾️ SSG 실시간",
      fallbackBody: "[8회말] 에레디아 홈런! 승기 굳힌다 🚀",
    },
    {
      apiKeyOverride: testKey,
      maxTokens: 72,
      temperature: 0.85,
      timeoutMs: 1400,
    }
  );

  console.log("--- Scenario A (LG fan) ---");
  console.log(lg.body);
  console.log("--- Scenario B (SSG fan) ---");
  console.log(ssg.body);
}

main().catch((error) => {
  console.log(`LLM 호출 실패: ${error instanceof Error ? error.message : "unknown"}`);
  process.exit(1);
});
