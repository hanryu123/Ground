import { findTeam } from "@/lib/teams";

type GenerateScorePushInput = {
  favoriteTeam: string;
  opponentTeam: string;
  myScore: number;
  oppScore: number;
  latestPlayText: string;
  fallbackTitle: string;
  fallbackBody: string;
};

type GenerateScorePushOptions = {
  apiKeyOverride?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = process.env.PUSH_LLM_MODEL ?? "claude-sonnet-4-6";

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clipForPush(text: string): string {
  const compact = compactText(text);
  if (compact.length <= 52) return compact;
  return `${compact.slice(0, 50)}..`;
}

function extractInningTag(latestPlayText: string): string {
  if (/경기\s*종료|경기종료|game\s*over/i.test(latestPlayText)) return "경기종료";
  const m = latestPlayText.match(/(\d{1,2}회(?:초|말)?)/);
  if (m?.[1]) return m[1];
  return "경기중";
}

function parseInningState(latestPlayText: string): { inning: number | null; half: "초" | "말" | null } {
  const m = latestPlayText.match(/(\d{1,2})회(초|말)/);
  if (!m) return { inning: null, half: null };
  const inning = Number.parseInt(m[1], 10);
  if (!Number.isFinite(inning)) return { inning: null, half: null };
  return { inning, half: m[2] as "초" | "말" };
}

function isWalkOffSituation(input: GenerateScorePushInput): boolean {
  const { inning, half } = parseInningState(input.latestPlayText);
  if (inning == null || half == null) return false;
  return half === "말" && inning >= 9 && input.myScore > input.oppScore;
}

function ensureInningPrefix(text: string, inningTag: string): string {
  const compact = compactText(text);
  if (/^\[[^\]]+\]/.test(compact)) return compact;
  if (compact.includes("[경기종료]")) return compact;
  return `[${inningTag}] ${compact}`;
}

function enforceBaseballConsistency(text: string, input: GenerateScorePushInput): string {
  let normalized = compactText(text);
  if (!isWalkOffSituation(input)) return normalized;

  normalized = normalized
    .replace(/끝내기\s*분위기/g, "끝내기")
    .replace(/분위기만|분위기/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!/(끝내기|승리|게임셋|경기\s*종료|끝났다|끝났다)/.test(normalized)) {
    normalized = `${normalized} 끝내기 끝🔥`;
  }
  return normalized;
}

function buildSystemPrompt(favoriteTeam: string): string {
  return `너는 생각할 시간이 없다. 무조건 30자 내외의 한 줄 문장으로 즉시 뱉어라. 인사말, 부연설명, 서론은 절대 금지하고 오직 푸시 알림 본문만 출력해.

너는 KBO 리그 ${favoriteTeam}의 30년 차 광팬이자, 세상에서 가장 편파적인 중계 캐스터야. 객관성, 중립성, 예의는 개나 줘버려. 오직 ${favoriteTeam}의 관점에서만 상황을 해석해.

득점/호수비 (선수 샤라웃): 세상을 다 가진 것처럼 환호해. '발생 이벤트'에 언급된 우리 선수의 이름을 반드시 부르며 신격화해. (예: 오스틴 홈런 -> '빛스틴 폼 미쳤다!!', 임찬규 삼진 -> '빛찬규 KKKKK!')

실점/위기: 심판의 스트라이크존을 의심하거나, 운이 없었다고 탓하거나, '어차피 역전한다'며 미친 듯이 희망회로를 돌려.

상대 팀 비하 (은어 허용): 상대 팀을 정식 명칭으로 부르지 말고 칭찬도 절대 금지야. 야구팬들이 쓰는 찰지고 유쾌한 은어(예: 옆집, 쟤네, 꼴등팀, 아랫마을 등)를 섞어서 마음껏 깎아내려.

형식: 모바일 푸시 알림에 맞게 30~50자 내외로 아주 짧고 타격감 있게 작성해.

꾸밈: 이모지(🔥, 😭, 🤬, 🚀, ⚾️)를 과하다 싶을 정도로 적극적으로 사용해.

[Few-Shot 예시 데이터]

상황: LG 팬, 실점 / 이벤트: "4회초 두산 양의지 1타점 적시타"
-> 대답: "아놔 심판 스트존 실화? 🤬 옆집한테 이런 어이없는 실점을.. 괜찮아 우리 타선이 5배로 갚아준다! 역전 가즈아!"

상황: 한화 팬, 역전 / 이벤트: "8회말 한화 노시환 좌중월 투런 홈런"
-> 대답: "미쳤다 미쳤어!!! 😭😭 빛시환 폼 미쳤다!!! 상대 투수 멘탈 털렸죠? 쟤네 이제 독수리만 보면 벌벌 떱니다 ㅋㅋㅋ"

상황: 롯데 팬, 병살타 / 이벤트: "6회초 롯데 전준우 유격수 병살타"
-> 대답: "아... 혈압... 또 찬물 끼얹네 🤦‍♂️ 그래도 아직 안 끝났다 마! 꼴등팀 애들 방심할 때 다음 이닝에 마 쎄리라!"

상황: KIA 팬, 탈삼진 / 이벤트: "9회초 KIA 네일 3구 삼진 아웃"
-> 대답: "🔥 캬~ 네일 폼 미쳤다! 윽박지르는 직구 보소!! KKKKK!! 오늘 쟤네 타선 숨도 못 쉬죠? 이대로 승리 가자!"

야구 상황 판정 규칙:
- 9회말(또는 연장 말)에서 우리 팀 점수가 앞서면 그 순간 끝내기/경기종료로 처리해. "분위기"라는 표현 금지.
- 모호하면 "발생 이벤트"와 "현재 스코어"를 우선 신뢰해.

반드시 한 줄 문장만 출력해. 따옴표 없이 결과 문장만 출력해.`;
}

function buildUserPrompt(input: GenerateScorePushInput): string {
  const favorite = findTeam(input.favoriteTeam);
  const opponent = findTeam(input.opponentTeam);
  const inningTag = extractInningTag(input.latestPlayText);
  return `현재 스코어: ${favorite.short} ${input.myScore} : ${input.oppScore} ${opponent.short}

이닝 태그: [${inningTag}]

발생 이벤트: ${input.latestPlayText}`;
}

function extractAnthropicText(payload: unknown): string | null {
  const root = payload as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text =
    root?.content
      ?.filter((item) => item?.type === "text" && typeof item.text === "string")
      .map((item) => item.text ?? "")
      .join(" ")
      .trim() ?? "";
  return text.length > 0 ? text : null;
}

export async function generateScorePushCopy(input: GenerateScorePushInput): Promise<{ title: string; body: string }> {
  return generateScorePushCopyWithOptions(input, {});
}

export async function generateScorePushCopyWithOptions(
  input: GenerateScorePushInput,
  options: GenerateScorePushOptions
): Promise<{ title: string; body: string }> {
  const apiKey = options.apiKeyOverride?.trim() || process.env.ANTHROPIC_API_KEY;
  const inningTag = extractInningTag(input.latestPlayText);
  if (!apiKey) {
    const consistent = enforceBaseballConsistency(input.fallbackBody, input);
    return {
      title: input.fallbackTitle,
      body: clipForPush(ensureInningPrefix(consistent, inningTag)),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 1000);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: options.maxTokens ?? 72,
        temperature: options.temperature ?? 0.85,
        system: buildSystemPrompt(findTeam(input.favoriteTeam).short),
        messages: [
          {
            role: "user",
            content: buildUserPrompt(input),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const consistent = enforceBaseballConsistency(input.fallbackBody, input);
      return {
        title: input.fallbackTitle,
        body: clipForPush(ensureInningPrefix(consistent, inningTag)),
      };
    }
    const json = await res.json();
    const generated = extractAnthropicText(json);
    if (!generated) {
      const consistent = enforceBaseballConsistency(input.fallbackBody, input);
      return {
        title: input.fallbackTitle,
        body: clipForPush(ensureInningPrefix(consistent, inningTag)),
      };
    }
    const team = findTeam(input.favoriteTeam);
    const consistent = enforceBaseballConsistency(generated, input);
    return {
      title: `⚾️ ${team.short} 실시간`,
      body: clipForPush(ensureInningPrefix(consistent, inningTag)),
    };
  } catch {
    const consistent = enforceBaseballConsistency(input.fallbackBody, input);
    return {
      title: input.fallbackTitle,
      body: clipForPush(ensureInningPrefix(consistent, inningTag)),
    };
  } finally {
    clearTimeout(timeout);
  }
}
