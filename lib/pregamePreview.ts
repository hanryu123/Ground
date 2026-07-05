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
  hasForbiddenFanCliche,
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
const PREGAME_LLM_TEMPERATURE = 1.0;

const PREVIEW_TEAM_DNA: Record<string, string> = {
  lg: "잠실, 유광점퍼, 서울 라이벌리, 오래 기다린 우승 눈높이",
  doosan: "잠실, 왕조 기억, 끈질긴 베어스 야구, 서울 라이벌리",
  kia: "광주 챔필, 타이거즈 왕조, V12 자부심, 원정 팬 화력",
  samsung: "대구 라팍, 푸른 피, 왕조 기억, 라이온즈 자존심",
  lotte: "부산 사직, 갈매기 응원, 오래 끓는 팬심, 롯데 특유의 화력",
  ssg: "인천 문학, 랜더스필드, 홈런 한 방 기대감, 붉은 응원석",
  nc: "창원 NC파크, 공룡 군단, 신흥 강팀 기억, 빠른 야구 감각",
  hanwha: "대전, 이글스의 기다림, 불꽃 응원, 오래 버틴 팬심",
  kt: "수원 위즈파크, 마법사 콘셉트, 막내 반란과 우승 기억",
  kiwoom: "고척돔, 히어로즈식 악바리 야구, 육성의 집요함",
};

const PREVIEW_RIVALRY: Record<string, string> = {
  "lg:doosan": "잠실 더비라 말투에 서울 라이벌 감정이 살아야 함",
  "doosan:lg": "잠실 더비라 말투에 서울 라이벌 감정이 살아야 함",
  "lotte:nc": "부산-창원 구도라 남해안 자존심 싸움 느낌을 살림",
  "nc:lotte": "창원-부산 구도라 남해안 자존심 싸움 느낌을 살림",
  "kia:samsung": "오래된 강팀 자존심이 부딪히는 매치업으로 다룸",
  "samsung:kia": "오래된 강팀 자존심이 부딪히는 매치업으로 다룸",
  "lg:kiwoom": "서울권 야구 감정과 고척 원정의 까다로움을 살림",
  "kiwoom:lg": "서울권 야구 감정과 고척 원정의 까다로움을 살림",
};

const PREVIEW_CLICHE_PATTERNS = [
  /응원석\s*파도까지\s*조용해진\s*느낌입니다/,
  /조용해진\s*느낌입니다/,
  /오늘\s*장면은\s*좀\s*다르게\s*기억되겠습니다/,
  /다르게\s*기억되겠습니다/,
  /경기\s*공기가\s*달라집니다/,
  /분위기를\s*직접\s*반전시켜야\s*합니다/,
  /현재\s*\d+연승\s*흐름입니다[^.。!?]*반전/,
  /초반\s*제구가\s*오늘\s*응원석\s*온도를\s*정할\s*겁니다/,
  /마운드의\s*첫\s*표정은\s*[^.。!?]+에게\s*달려\s*있습니다/,
  /오늘\s*마운드의\s*첫\s*표정/,
  /첫\s*이닝부터\s*[^.。!?]+타선을\s*조용하게/,
  /초구부터\s*스트라이크를\s*꽂으면/,
  /타자들이\s*배트\s*고쳐\s*잡게/,
  /알림창도\s*자세를\s*고칩니다/,
  /더그아웃\s*표정부터\s*바뀝니다/,
  /첫\s*타자부터\s*리듬을\s*뺏으면/,
  /프리뷰는\s*바로\s*예언/,
  /첫\s*출루부터\s*답답한\s*공기를\s*찢어야/,
  /기세라는\s*말을\s*아껴\s*쓸\s*이유/,
  /최근\s*체감은\s*이렇습니다/,
  /점수보다\s*먼저\s*표정\s*싸움/,
  /함성을\s*오래\s*붙잡는\s*쪽/,
  /덕아웃이\s*먼저\s*물\s*마시게/,
  /첫\s*이닝\s*놓치면\s*단톡방/,
  /초반\s*세\s*타석\s*안에\s*오늘\s*경기의\s*말투/,
  /새로고침\s*위에\s*올라가/,
  /연승\s*흐름입니다/,
  /연패\s*흐름입니다/,
  /타선\s*폭발\s*예감/,
  /함께\s*응원합시다/,
  /오늘\s*우리\s*팀\s*할\s*수\s*있습니다/,
  /오늘의\s*캐스터\s*관전\s*포인트/,
  /오늘의\s*편파\s*관전\s*포인트/,
  /경기\s*전\s*알림창\s*예열/,
] as const;

type PregameFallbackReason = "missing-anthropic-key" | "llm-unavailable-or-rejected";

export type PregamePreviewInput = {
  date: string;
  game: LiveGame;
  teamId: string;
  opponentTeamId: string;
  recentGames: LiveGame[];
  newsContext: string[];
  llmTimeoutMs?: number;
  llmRetryTimeoutMs?: number | null;
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
  fallbackReason?: PregameFallbackReason;
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

function buildFallback(
  input: PregamePreviewInput,
  momentum: TeamMomentum,
  fallbackReason: PregameFallbackReason
): PregamePreviewOutput {
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
  const normalizedLines =
    normalizePreviewLines(varied.lines, `${input.date}:${input.game.id}:${input.teamId}:fallback`) ??
    varied.lines.map((line) => clip(line)).filter(Boolean).slice(0, 4);
  return {
    title: varied.title,
    lines: normalizedLines,
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
    fallbackReason,
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

function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildPreviewFlavor(teamId: string, opponentTeamId: string): string {
  const teamKey = teamId.toLowerCase();
  const oppKey = opponentTeamId.toLowerCase();
  const dna = PREVIEW_TEAM_DNA[teamKey] ?? "구단 고유 응원 문화와 홈구장 감정";
  const rivalry = PREVIEW_RIVALRY[`${teamKey}:${oppKey}`] ?? "상대와의 오늘 매치업 감정은 과장하지 말고 데이터와 구단 색으로만 만든다";
  return `구단 DNA: ${dna}\n오늘 구도: ${rivalry}`;
}

function hasPreviewCliche(text: string): boolean {
  return (
    hasForbiddenFanCliche(text) ||
    PREVIEW_CLICHE_PATTERNS.some((pattern) => pattern.test(text))
  );
}

function sanitizePregameLine(text: string, seed: string): string | null {
  const sanitized = clip(
    sanitizeBoringFanCopy(text, seed, { clicheFallback: false })
  );
  if (!sanitized || hasPreviewCliche(sanitized)) return null;
  return sanitized;
}

function firstToken(text: string): string {
  return compact(text)
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .split(/\s+/)[0]
    ?.slice(0, 8) ?? "";
}

function normalizePreviewLines(lines: string[], seed: string): string[] | null {
  const out: string[] = [];
  const starts = new Set<string>();
  for (const [idx, line] of lines.entries()) {
    const clean = sanitizePregameLine(line, `${seed}:line${idx}`);
    if (!clean) continue;
    const start = firstToken(clean);
    if (start && starts.has(start)) continue;
    starts.add(start);
    out.push(clean);
  }
  return out.length >= 3 ? out.slice(0, 4) : null;
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
  const fallback = (reason: PregameFallbackReason) => buildFallback(input, momentum, reason);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback("missing-anthropic-key");

  const team = findTeam(input.teamId).short;
  const opp = findTeam(input.opponentTeamId).short;
  const newsBlock = input.newsContext.slice(0, 5).join(" | ") || "없음";
  const starter = input.game.homeId === input.teamId ? input.game.homePitcher : input.game.awayPitcher;
  const previewFlavor = buildPreviewFlavor(input.teamId, input.opponentTeamId);
  const styleBrief = buildCopyStyleBrief({
    surface: "preview",
    seed: `${input.date}:${input.game.id}:${input.teamId}:${momentum.recentForm}`,
    teamShort: team,
    opponentShort: opp,
  });

  const system = `너는 커뮤니티에서 13년 동안 굴러먹은 골수 야구 빠돌이이자 힙한 캐스터다.
	다만 앱 푸시로 나가므로 욕설·비하·반말은 금지하고, 존댓말 캐스터 문장으로 마무리한다.
	너의 정체성은 ${team} 편파 프리뷰다. 중립 브리핑이 아니라 ${team} 팬 단톡방에 올려도 "이 사람 야구 좀 보네" 소리 나와야 한다.

	${previewFlavor}

	창작 원칙:
	- 각 줄은 서로 다른 문장 구조여야 한다. 팀명/투수명만 갈아 끼운 문장은 실패다.
	- 절대로 특정 문장 구조, 같은 첫 이미지, 같은 접속사, 같은 어미 패턴을 반복하지 말고 경기마다 독립적인 문장 흐름을 새로 만든다.
	- 각 구단의 도시, 구장, 응원 문화, 역사적 자부심, 라이벌 구도를 한 줄 이상 자연스럽게 묻혀라.
	- 선발 투수를 언급할 때도 "초반 제구", "마운드의 첫 표정" 같은 흔한 방송 클리셰를 쓰지 말고 오늘 경기의 한 장면처럼 써라.
	- 팬들이 부르는 별명, 홈구장 감정, 천적 구도, 연승/연패 탈출, 구속·제구 회복 여부처럼 오늘의 진짜 관전 포인트를 가볍고 날카롭게 녹인다.
	- 최근 흐름은 데이터 그대로 해석한다. 연승이면 더 밀어붙이는 서사, 연패면 끊어내는 서사다. 연승에 "반전"이라는 단어를 붙이면 실패다.
	- 데이터에 없는 선수 부상, 사생활, 확정 라인업, 결과 예측은 지어내지 않는다.
	- 밈과 드립은 야구팬이 알아듣는 정도로만, 과한 조롱이나 상대 팬 비하는 금지다.

	부정 프롬프트 — 아래 뼈대는 한 글자라도 비슷하면 실패:
	- "현재 N연승 흐름입니다", "현재 N연패 흐름입니다"
	- "분위기를 직접 반전시켜야 합니다"
	- "초반 제구가 오늘 응원석 온도를 정할 겁니다"
	- "오늘 마운드의 첫 표정은 OOO에게 달려 있습니다"
	- "응원석 파도까지 조용해진 느낌입니다"
	- "오늘 장면은 좀 다르게 기억되겠습니다"
	- "경기 공기가 달라집니다"
	- "선발 OOO, 첫 이닝부터 OOO 타선을 조용하게 만들어야 합니다"
	- "OOO가 초구부터 스트라이크를 꽂으면"
	- "OOO가 첫 타자부터 리듬을 뺏으면"
	- "알림창도 자세를 고칩니다", "더그아웃 표정부터 바뀝니다"
	- "타선 폭발 예감", "함께 응원합시다", "오늘 우리 팀 할 수 있습니다"
	- 보고서 말투, 보도자료 말투, 누구에게나 붙는 앱 템플릿 말투
	- "[무언가]까지 [상태]진 느낌입니다. 오늘 장면은..."처럼 이미지 명사만 바꾸는 문장

	출력 규칙:
	- JSON object 하나만 출력한다. 다른 텍스트, 마크다운, 주석 금지
	- 필드: title은 string, lines는 string 배열
	- lines는 3~4개, 각 line 24~82자
	- title도 매번 다르게. 고정 제목 금지
	- 반드시 존댓말 문체 (-습니다/-네요/-죠/-합니다)
	- "먹히다/먹힌다" 절대 금지
	- 비관적 조건문 금지: "~하지 못하면", "~못 할 경우", "~힘들어집니다", "~걱정됩니다", "~불안합니다"
	- 스코어·경기 결과 추론 금지 (경기 전이므로)
	- 최근 5경기 전승/전패를 현재 5연승/5연패로 환산 금지
	- 3연승/3연패 이상이면 반드시 현재 연속 흐름으로 정확히 언급하되, 문장 뼈대는 매번 다르게 쓴다
	- 각 line의 첫 단어와 마지막 어미 구조가 겹치면 실패
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
현재 연속 흐름(연승/연패 정답):${momentum.streak?.label ?? "없음"}
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
          temperature: PREGAME_LLM_TEMPERATURE,
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
      const lines = normalizePreviewLines(
        parsed?.lines ?? [],
        `${input.date}:${input.game.id}:${input.teamId}:llm`
      );
      if (!title || hasPreviewCliche(title) || !lines) return null;
      return { title, lines };
    } catch (error) {
      console.error("[pregame-llm] request_failed", (error as Error).message);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  const firstTimeoutMs =
    input.llmTimeoutMs ??
    parsePositiveInt(process.env.PREGAME_LLM_TIMEOUT_MS) ??
    4500;
  const retryTimeoutMs =
    input.llmRetryTimeoutMs !== undefined
      ? input.llmRetryTimeoutMs
      : parsePositiveInt(process.env.PREGAME_LLM_RETRY_TIMEOUT_MS);

  const first = await callLlm(firstTimeoutMs);
  const second = first || !retryTimeoutMs ? null : await callLlm(retryTimeoutMs);
  const best = first ?? second;
  if (!best) return fallback("llm-unavailable-or-rejected");
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
