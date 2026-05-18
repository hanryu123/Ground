import path from "node:path";
import dotenv from "dotenv";
import { generateScorePushCopy } from "@/lib/pushLlm";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config();

async function main() {
  const result = await generateScorePushCopy({
    favoriteTeam: "lg",
    opponentTeam: "doosan",
    myScore: 5,
    oppScore: 3,
    latestPlayText: "8회말 LG 오스틴 벼락같은 역전 쓰리런 홈런!",
    fallbackTitle: "⚾️ LG 실시간",
    fallbackBody: "오스틴 역전포! 오늘 경기 뒤집었다 🔥",
  });

  // 사용자 요청: 콘솔에 결과 문자열 하나만 출력
  console.log(result.body);
}

main().catch(() => {
  console.log("LLM 호출 실패: fallback");
  process.exit(1);
});
