import { findTeam } from "@/lib/teams";
import type { TodayFeedStatus } from "@/lib/kbo";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = process.env.PUSH_LLM_MODEL ?? "claude-sonnet-4-6";

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clip(text: string): string {
  const t = compact(text);
  if (t.length <= 56) return t;
  return `${t.slice(0, 54)}..`;
}

function buildStatusPrompt(status: "MONDAY_OFF" | "RAIN_CANCELLED", teamId?: string | null): string {
  const team = teamId ? findTeam(teamId).short : "우리 팀";
  const context =
    status === "MONDAY_OFF"
      ? "오늘은 월요일 정기 휴식일이라 KBO 경기가 없다."
      : "오늘 경기는 우천취소로 진행되지 않는다.";
  return `상황: ${context}
응원팀: ${team}

요구사항:
- 한국어 한 줄만 출력
- 20~42자
- 야구팬 톤으로 재치있고 약간 편파적
- 이모지 1~2개만 사용
- 따옴표/설명/줄바꿈 금지`;
}

export async function generateTodayStatusMessageWithLlm(input: {
  status: TodayFeedStatus;
  fallback: string;
  teamId?: string | null;
  timeoutMs?: number;
}): Promise<string> {
  if (input.status !== "MONDAY_OFF" && input.status !== "RAIN_CANCELLED") {
    return input.fallback;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return input.fallback;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 900);
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
        max_tokens: 64,
        temperature: 0.9,
        system:
          "너는 한국 야구 앱 카피라이터다. 오직 한 줄 카피만 출력한다. 설명/불릿/따옴표 금지.",
        messages: [
          {
            role: "user",
            content: buildStatusPrompt(input.status, input.teamId),
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return input.fallback;
    const json = (await res.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text =
      json.content
        ?.filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => item.text ?? "")
        .join(" ") ?? "";
    const normalized = clip(text);
    return normalized.length > 0 ? normalized : input.fallback;
  } catch {
    return input.fallback;
  } finally {
    clearTimeout(timeout);
  }
}
