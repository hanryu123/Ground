import { findTeam } from "@/lib/teams";
import type { LiveGame } from "@/lib/kbo";
import {
  buildTeamMomentumFromLiveGames,
  fetchTeamMomentum,
  type TeamMomentum,
} from "@/lib/teamMomentum";
import {
  buildCopyStyleBrief,
  buildVariedPregameFallback,
  sanitizeBoringFanCopy,
} from "@/lib/fanCopyVariety";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL =
  process.env.PREGAME_LLM_MODEL ??
  process.env.POSTGAME_LLM_MODEL ??
  process.env.PUSH_LLM_MODEL ??
  "claude-sonnet-4-6";
const NAVER_BASE = "https://api-gw.sports.naver.com";
const NAVER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 GroundBot/1.0";

export type PregamePreviewInput = {
  date: string;
  game: LiveGame;
  teamId: string;
  opponentTeamId: string;
  recentGames: LiveGame[];
  newsContext: string[];
};

export type PregamePreviewOutput = {
  title: string;
  lines: string[];
  context: {
    recentForm: string;
    recentRecord: string;
    recentSummary: string;
    currentStreak: string | null;
    lastGame: string | null;
    recentScores: string[];
    newsSnippets: string[];
  };
  source: "llm" | "fallback";
};

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clip(text: string, max = 88): string {
  const normalized = compact(text);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 2)}..`;
}

function collectTexts(root: unknown): string[] {
  const queue: unknown[] = [root];
  const out: string[] = [];
  const seen = new Set<unknown>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }
    if (typeof current !== "object") continue;
    const obj = current as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        const lower = key.toLowerCase();
        if (
          lower.includes("title") ||
          lower.includes("summary") ||
          lower.includes("text") ||
          lower.includes("content") ||
          lower.includes("news")
        ) {
          const t = compact(value);
          if (t.length >= 12) out.push(t);
        }
      } else if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }
  return out;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": NAVER_UA,
        accept: "application/json",
        referer: "https://m.sports.naver.com/",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchPregameNewsContext(input: {
  gameId: string;
  teamId: string;
  opponentTeamId: string;
}): Promise<string[]> {
  const endpoints = [
    `${NAVER_BASE}/schedule/games/${input.gameId}`,
    `${NAVER_BASE}/schedule/games/${input.gameId}/relayTexts`,
    `${NAVER_BASE}/news?upperCategoryId=kbaseball&categoryId=kbo&size=10`,
  ];
  const merged: string[] = [];
  for (const endpoint of endpoints) {
    const json = await fetchJsonWithTimeout(endpoint, 900);
    if (!json) continue;
    merged.push(...collectTexts(json));
  }
  const dedup = [...new Set(merged.map((line) => clip(line, 110)))];
  return dedup.slice(0, 8);
}

function buildFallback(input: PregamePreviewInput, momentum: TeamMomentum): PregamePreviewOutput {
  const team = findTeam(input.teamId).short;
  const opp = findTeam(input.opponentTeamId).short;
  const starter = input.game.homeId === input.teamId ? input.game.homePitcher : input.game.awayPitcher;
  const varied = buildVariedPregameFallback({
    seed: `${input.date}:${input.game.id}:${input.teamId}`,
    team,
    opp,
    starter,
    time: input.game.time,
    momentumSummary: momentum.summary,
    streakLabel: momentum.streak?.label ?? null,
    lastGameLine: momentum.lastGameLine,
  });
  return {
    title: varied.title,
    lines: varied.lines.map((line) => clip(line)),
    context: {
      recentForm: momentum.recentForm,
      recentRecord: momentum.recentRecord,
      recentSummary: momentum.summary,
      currentStreak: momentum.streak?.label ?? null,
      lastGame: momentum.lastGameLine,
      recentScores: momentum.recentScores,
      newsSnippets: input.newsContext.slice(0, 4),
    },
    source: "fallback",
  };
}

function parseStructuredResponse(text: string): { title?: string; lines?: string[] } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as { title?: string; lines?: string[] };
  } catch {
    return null;
  }
}

export async function generatePregamePreview(input: PregamePreviewInput): Promise<PregamePreviewOutput> {
  const localMomentum = buildTeamMomentumFromLiveGames({
    teamId: input.teamId,
    asOfDate: input.date,
    games: input.recentGames,
  });
  const momentum =
    (await fetchTeamMomentum({
      teamId: input.teamId,
      asOfDate: input.date,
      includeAsOfDate: false,
    })) ?? localMomentum;
  const fallback = buildFallback(input, momentum);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  const team = findTeam(input.teamId).short;
  const opp = findTeam(input.opponentTeamId).short;
  const newsBlock = input.newsContext.slice(0, 5).join(" | ") || "없음";
  const starter = input.game.homeId === input.teamId ? input.game.homePitcher : input.game.awayPitcher;
  const styleBrief = buildCopyStyleBrief({
    surface: "preview",
    seed: `${input.date}:${input.game.id}:${input.teamId}:${momentum.recentForm}`,
    teamShort: team,
    opponentShort: opp,
  });

  const system = `너는 ${team} 열성팬이야. 오늘 경기가 인생 전부인 것처럼 생사가 걸려있어. 딱 하나 — 직업이 KBO 캐스터라 존댓말은 나온다. 팬 95%, 캐스터 5%.
우리 팀 기대와 흥분이 문장 전체를 지배해야 해. 완전 중립 금지. 냉정한 척 금지. 오직 우리 팀 편.
완전 중립 금지. 우리 팀 강점은 자신감 있게, 상대 약점은 날카롭게.
반드시 JSON만 출력:
{"title":"🎙️ 오늘의 캐스터 관전 포인트","lines":["문장1","문장2","문장3","문장4"]}

규칙:
- lines는 3~4개, 각 line 24~82자
- 반드시 존댓말 문체 (-습니다/-네요/-죠/-합니다)
- 유치한 반복 표현 금지
- "먹히다/먹힌다" 절대 금지
- 비관적·부정적 조건문 절대 금지: "~하지 못하면", "~못 할 경우", "~힘들어집니다", "~걱정됩니다", "~불안합니다" 류 표현 사용 금지
- 불안감·걱정·압박감 조성 문구 금지: 오직 기대·흥분·자신감만
- 스코어·경기 결과 추론 금지 (경기 전이므로)
- 최근 흐름은 반드시 "최근 5경기", "직전 경기", "연승/연패"를 구분해서 해석
- 3연승/3연패 이상이면 반드시 언급. 8연패 이상이면 프리뷰의 핵심 서사로 삼아라
- 최근 5경기가 좋아도 직전 경기 패배면 "좋은 흐름"으로 단정 금지. "최근 5경기 4승 1패지만 직전 패배"처럼 균형 있게 써라
- 특정 스코어는 필요할 때만 한 번 자연스럽게 사용하고, 숫자 나열식 브리핑은 금지
- "타선 폭발 예감", "함께 응원합시다", "오늘 우리 팀 할 수 있습니다" 같은 앱 템플릿 느낌 문구 금지
- 각 line은 서로 다른 시작 방식으로 써라. 4개 line 중 같은 첫 단어 반복 금지
${styleBrief}

⚾ 야구 용어 절대 해석 규칙:
- 탈삼진: 투수가 타자를 삼진 아웃시킨 것 (투수의 성공)
- 볼넷: 볼 4개로 출루 (투수 실책)
- 병살타: 타구 하나로 2명 아웃 (공격팀 최악의 실패)
- [N회초/말]은 진행 중 이닝 — "N회 남았다"로 해석 금지`;

  const user = `팀:${team}
상대:${opp}
경기:${input.date} ${input.game.time} ${input.game.stadium}
우리 선발:${starter}
최근 흐름 요약:${momentum.summary}
최근 5경기:${momentum.recentRecord} / ${momentum.recentForm}
현재 연속 흐름:${momentum.streak?.label ?? "없음"}
직전 경기:${momentum.lastGameLine ?? "없음"}
최근 스코어:${momentum.recentScores.join(" | ") || "없음"}
프리뷰/뉴스 컨텍스트:${newsBlock}`;

  const callLlm = async (timeoutMs: number) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
          max_tokens: 340,
          temperature: 0.94,
          system,
          messages: [{ role: "user", content: user }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[pregame-llm] bad_response", res.status, body.slice(0, 280));
        return null;
      }
      const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
      const text =
        json.content
          ?.filter((item) => item.type === "text" && typeof item.text === "string")
          .map((item) => item.text ?? "")
          .join("\n") ?? "";
      const parsed = parseStructuredResponse(text);
      const title = clip(parsed?.title ?? "", 42);
      const lines = (parsed?.lines ?? [])
        .map((line, idx) => clip(sanitizeBoringFanCopy(line, `${input.date}:${input.game.id}:${input.teamId}:line${idx}`)))
        .filter((line) => line.length > 0)
        .slice(0, 4);
      if (!title || lines.length < 3) return null;
      return { title, lines };
    } catch (error) {
      console.error("[pregame-llm] request_failed", (error as Error).message);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  const first = await callLlm(8000);
  const second = first ? null : await callLlm(12000);
  const best = first ?? second;
  if (!best) return fallback;
  return {
    title: best.title,
    lines: best.lines,
    context: {
      recentForm: momentum.recentForm,
      recentRecord: momentum.recentRecord,
      recentSummary: momentum.summary,
      currentStreak: momentum.streak?.label ?? null,
      lastGame: momentum.lastGameLine,
      recentScores: momentum.recentScores,
      newsSnippets: input.newsContext.slice(0, 4),
    },
    source: "llm",
  };
}
