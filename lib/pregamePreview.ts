import { findTeam } from "@/lib/teams";
import type { LiveGame } from "@/lib/kbo";

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

function resultMark(game: LiveGame, teamId: string): "W" | "L" | "D" | null {
  if (!game.result) return null;
  if (game.result.winnerId == null) return "D";
  return game.result.winnerId === teamId ? "W" : "L";
}

function buildRecentFormSummary(recentGames: LiveGame[], teamId: string): { form: string; scores: string[] } {
  const ordered = [...recentGames]
    .filter((g) => g.result)
    .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)))
    .slice(-5);
  const formTokens: string[] = [];
  const scoreLines: string[] = [];
  for (const game of ordered) {
    const myIsHome = game.homeId === teamId;
    const myTeam = findTeam(teamId).short;
    const oppId = myIsHome ? game.awayId : game.homeId;
    const oppTeam = findTeam(oppId).short;
    const myScore = myIsHome ? game.result?.homeScore ?? 0 : game.result?.awayScore ?? 0;
    const oppScore = myIsHome ? game.result?.awayScore ?? 0 : game.result?.homeScore ?? 0;
    const mark = resultMark(game, teamId);
    if (mark) formTokens.push(mark);
    scoreLines.push(`${myTeam} ${myScore}:${oppScore} ${oppTeam}`);
  }
  return {
    form: formTokens.length > 0 ? formTokens.join("") : "기록 없음",
    scores: scoreLines.slice(-5),
  };
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

function buildFallback(input: PregamePreviewInput): PregamePreviewOutput {
  const team = findTeam(input.teamId).short;
  const opp = findTeam(input.opponentTeamId).short;
  const recent = buildRecentFormSummary(input.recentGames, input.teamId);
  return {
    title: "🎙️ 오늘의 캐스터 관전 포인트",
    lines: [
      `${team} 최근 5경기 흐름 ${recent.form}입니다. 초반 이닝부터 기선 제압이 필요합니다.`,
      `오늘 선발 ${input.game.homeId === input.teamId ? input.game.homePitcher : input.game.awayPitcher} 투수, 최소 6이닝은 책임져줘야 합니다.`,
      `${opp} 상대로 ${input.game.time} 시작입니다. 초반에 점수를 내지 못하면 경기가 굉장히 답답해집니다.`,
      `오늘은 타선이 먼저 터뜨려야 합니다. ${team}, 충분히 할 수 있습니다!`,
    ].map((line) => clip(line)),
    context: {
      recentForm: recent.form,
      recentScores: recent.scores,
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
  const fallback = buildFallback(input);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  const team = findTeam(input.teamId).short;
  const opp = findTeam(input.opponentTeamId).short;
  const recent = buildRecentFormSummary(input.recentGames, input.teamId);
  const newsBlock = input.newsContext.slice(0, 5).join(" | ") || "없음";
  const starter = input.game.homeId === input.teamId ? input.game.homePitcher : input.game.awayPitcher;

  const system = `너는 KBO 전문 캐스터인데, ${team} 극성팬이기도 해. 두 정체성이 50:50이야.
존댓말(-습니다, -네요, -죠, -합니다)로 전문적으로 쓰되, 우리 팀 기대감과 팬심이 자연스럽게 배어나와야 해.
완전 중립 금지. 우리 팀 강점은 자신감 있게, 상대 약점은 날카롭게.
반드시 JSON만 출력:
{"title":"🎙️ 오늘의 캐스터 관전 포인트","lines":["문장1","문장2","문장3","문장4"]}

규칙:
- lines는 3~4개, 각 line 24~82자
- 반드시 존댓말 문체 (-습니다/-네요/-죠/-합니다)
- 유치한 반복 표현 금지
- "먹히다/먹힌다" 절대 금지
- 스코어·경기 결과 추론 금지 (경기 전이므로)
- 특정 날짜·특정 스코어(예: "14:0", "지난 화요일") 직접 언급 금지 — 최근 흐름(폼) 맥락으로만 활용

⚾ 야구 용어 절대 해석 규칙:
- 탈삼진: 투수가 타자를 삼진 아웃시킨 것 (투수의 성공)
- 볼넷: 볼 4개로 출루 (투수 실책)
- 병살타: 타구 하나로 2명 아웃 (공격팀 최악의 실패)
- [N회초/말]은 진행 중 이닝 — "N회 남았다"로 해석 금지`;

  const user = `팀:${team}
상대:${opp}
경기:${input.date} ${input.game.time} ${input.game.stadium}
우리 선발:${starter}
최근 5경기 흐름(W=승/L=패/D=무):${recent.form}
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
        .map((line) => clip(line))
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
      recentForm: recent.form,
      recentScores: recent.scores,
      newsSnippets: input.newsContext.slice(0, 4),
    },
    source: "llm",
  };
}
