import { findTeam, TEAMS } from "@/lib/teams";

const NAVER_BASE = "https://api-gw.sports.naver.com";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = process.env.POSTGAME_LLM_MODEL ?? "claude-sonnet-4-6";

/** 팀 ID로 홈구장(도시) 반환. 정보 없으면 null. */
function homeCity(teamId: string): string | null {
  return TEAMS.find((t) => t.id === teamId.toLowerCase())?.city ?? null;
}

/** 경기가 열린 구장 도시 이름 */
function stadiumCity(mySide: "home" | "away", myTeamId: string, oppTeamId: string): string | null {
  return mySide === "home" ? homeCity(myTeamId) : homeCity(oppTeamId);
}

type Tone = "win" | "loss" | "draw";

export type PostGameFacts = {
  externalId: string;
  myTeam: string;
  oppTeam: string;
  myScore: number;
  oppScore: number;
  myHits: number | null;
  oppHits: number | null;
  myErrors: number | null;
  oppErrors: number | null;
  myHomeRuns: number | null;
  oppHomeRuns: number | null;
  winningPitcher?: string | null;
  losingPitcher?: string | null;
  savePitcher?: string | null;
  clutchHit?: string | null;
  homeRun?: string | null;
  error?: string | null;
  notable?: string[];
  /** 경기 도중 우천 중단이 있었던 경우 true */
  wasRainSuspended?: boolean;
};

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clip(text: string, limit = 86): string {
  const normalized = compact(text);
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 2)}..`;
}

function readString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = compact(v);
  return t.length > 0 ? t : null;
}

function readNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function sanitizeTextValue(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = compact(v);
  if (!t) return null;
  if (/^(확인\s*중|tbd|미정|unknown|null|n\/a|-|없음)$/i.test(t)) return null;
  return t;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickBySeed<T>(seed: string, list: readonly T[]): T {
  return list[hashSeed(seed) % list.length];
}

function collectTexts(root: unknown): string[] {
  const out: string[] = [];
  const queue: unknown[] = [root];
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
          lower.includes("text") ||
          lower.includes("relay") ||
          lower.includes("comment") ||
          lower.includes("summary") ||
          lower.includes("record") ||
          lower.includes("play")
        ) {
          const text = readString(value);
          if (text) out.push(text);
        }
      } else if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }
  return out;
}

function firstByKeyword(texts: string[], regex: RegExp): string | null {
  const found = texts.find((line) => regex.test(line));
  return found ? clip(found) : null;
}

function extractPitcherName(detail: unknown, keys: string[]): string | null {
  const queue: unknown[] = [detail];
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
      if (typeof value === "string" && keys.some((candidate) => key.toLowerCase().includes(candidate))) {
        const text = sanitizeTextValue(readString(value));
        if (text) return text;
      } else if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }
  return null;
}

type Side = "home" | "away";

type ParsedBoxStats = {
  homeHits: number | null;
  awayHits: number | null;
  homeErrors: number | null;
  awayErrors: number | null;
  homeHomeRuns: number | null;
  awayHomeRuns: number | null;
};

type ParsedPitchingResult = {
  winningPitcher: string | null;
  losingPitcher: string | null;
  savePitcher: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function sumTeamHr(list: unknown): number | null {
  if (!Array.isArray(list)) return null;
  let total = 0;
  let found = false;
  for (const row of list) {
    const obj = asRecord(row);
    if (!obj) continue;
    const hr = readNumber(obj.hr);
    if (hr == null || hr < 0) continue;
    found = true;
    total += Math.round(hr);
  }
  return found ? total : null;
}

function parseBoxStats(recordResponse: unknown): ParsedBoxStats {
  const result = asRecord(recordResponse)?.result;
  const recordData = asRecord(result)?.recordData;
  const scoreBoard = asRecord(recordData && asRecord(recordData)?.scoreBoard);
  const rheb = asRecord(scoreBoard && asRecord(scoreBoard)?.rheb);
  const rhebHome = asRecord(rheb && asRecord(rheb)?.home);
  const rhebAway = asRecord(rheb && asRecord(rheb)?.away);
  const battersBoxscore = asRecord(recordData && asRecord(recordData)?.battersBoxscore);

  const homeHits = readNumber(rhebHome?.h) ?? readNumber(asRecord(battersBoxscore?.homeTotal)?.hit);
  const awayHits = readNumber(rhebAway?.h) ?? readNumber(asRecord(battersBoxscore?.awayTotal)?.hit);
  const homeErrors = readNumber(rhebHome?.e);
  const awayErrors = readNumber(rhebAway?.e);
  const homeHomeRuns = sumTeamHr(battersBoxscore?.home);
  const awayHomeRuns = sumTeamHr(battersBoxscore?.away);

  return {
    homeHits,
    awayHits,
    homeErrors,
    awayErrors,
    homeHomeRuns,
    awayHomeRuns,
  };
}

function parsePitchingResult(recordResponse: unknown): ParsedPitchingResult {
  const result = asRecord(recordResponse)?.result;
  const recordData = asRecord(result)?.recordData;
  const rows = asRecord(recordData)?.pitchingResult;
  if (!Array.isArray(rows)) {
    return { winningPitcher: null, losingPitcher: null, savePitcher: null };
  }
  let winningPitcher: string | null = null;
  let losingPitcher: string | null = null;
  let savePitcher: string | null = null;
  for (const item of rows) {
    const row = asRecord(item);
    if (!row) continue;
    const wls = readString(row.wls)?.toUpperCase() ?? "";
    const name = sanitizeTextValue(readString(row.name));
    if (!name) continue;
    if (wls === "W" || wls === "승") winningPitcher = winningPitcher ?? name;
    else if (wls === "L" || wls === "패") losingPitcher = losingPitcher ?? name;
    else if (wls === "S" || wls === "세") savePitcher = savePitcher ?? name;
  }
  return { winningPitcher, losingPitcher, savePitcher };
}

function countTeamKeyword(texts: string[], teamShort: string, regex: RegExp): number | null {
  const safe = teamShort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = new RegExp(`${safe}[\\s\\S]{0,18}${regex.source}`, "i");
  const around = texts.filter((line) => exact.test(line)).length;
  return around > 0 ? around : null;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 GroundBot/1.0",
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

function buildFallbackReport(input: { facts: PostGameFacts; tone: Tone }): { headline: string; content: string } {
  const { facts, tone } = input;
  const seedBase = `${facts.externalId}:${facts.myTeam}:${facts.myScore}:${facts.oppScore}`;
  const gap = facts.myScore - facts.oppScore;
  const scoreLine = `${facts.myScore}:${facts.oppScore}`;

  const winHeads = [
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 오늘은 거의 흠잡을 데가 없었습니다.`,
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 승부처에서 전혀 흔들리지 않았습니다.`,
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 오늘 완성도가 한 수 위였습니다.`,
  ] as const;
  const lossHeads = [
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 이건 솔직히 변명이 없는 경기였습니다.`,
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 오늘은 패배해야 마땅한 흐름이었습니다.`,
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 이 결과 누구도 억울하다 할 수 없습니다.`,
  ] as const;
  const drawHeads = [
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 이길 경기를 결국 가져오지 못했습니다.`,
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 비겼지만 속은 편하지 않은 1점입니다.`,
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 결정적 순간 결정력이 끝내 터지지 않았습니다.`,
  ] as const;

  if (tone === "win") {
    const headline = pickBySeed(`${seedBase}:win:head`, winHeads);
    const opener = gap >= 5
      ? `${facts.myTeam}가 ${facts.oppTeam}를 ${scoreLine}으로 완파했습니다.`
      : `${facts.myTeam}가 ${facts.oppTeam}를 ${scoreLine}으로 잡아냈습니다.`;
    const heroPart = facts.winningPitcher
      ? `오늘의 핵심은 ${facts.winningPitcher}, 마운드에서 흐름을 완전히 주도했습니다.`
      : facts.clutchHit
        ? `결승타 장면 — "${clip(facts.clutchHit, 40)}" — 이 한 방이 경기를 결정지었습니다.`
        : `승부처마다 ${facts.myTeam}가 먼저 치고 나갔고, 상대는 끝내 따라오지 못했습니다.`;
    const closerPart = facts.savePitcher
      ? `${facts.savePitcher}가 뒷문을 철저히 잠갔습니다.`
      : facts.clutchHit && facts.winningPitcher
        ? `결승타 장면, "${clip(facts.clutchHit, 36)}" — 이것만으로 오늘 경기가 설명됩니다.`
        : `다음 경기도 이 흐름 그대로 가져가야 합니다.`;
    return {
      headline,
      content: `${opener} ${heroPart} ${closerPart} 다음 경기도 기대가 됩니다.`,
    };
  }

  if (tone === "draw") {
    const headline = pickBySeed(`${seedBase}:draw:head`, drawHeads);
    const bodyPart = facts.losingPitcher
      ? `${facts.losingPitcher}에게 패전이 붙지 않은 게 그나마 다행이지만, 내용은 좋지 않았습니다.`
      : facts.clutchHit
        ? `"${clip(facts.clutchHit, 36)}" — 이 장면 하나를 막지 못한 게 오늘의 핵심입니다.`
        : `결정적인 순간마다 ${facts.myTeam} 쪽이 한 발씩 느렸습니다.`;
    return {
      headline,
      content: `${facts.myTeam}와 ${facts.oppTeam}가 ${scoreLine}으로 나눴지만, 이 결과가 딱히 반갑지만은 않습니다. ${bodyPart} 승리를 손에 쥘 수 있었던 경기였는데, 결국 1점으로 마무리됐습니다.`,
    };
  }

  // loss
  const headline = pickBySeed(`${seedBase}:loss:head`, lossHeads);
  const opener = gap <= -8
    ? `${facts.myTeam}가 ${facts.oppTeam}에 ${scoreLine}으로 완패했습니다.`
    : `${facts.myTeam}가 ${facts.oppTeam}에 ${scoreLine}으로 졌습니다.`;
  const corePart = facts.clutchHit
    ? `"${clip(facts.clutchHit, 36)}" — 이 장면이 오늘 경기를 결정지었습니다.`
    : facts.losingPitcher
      ? `${facts.losingPitcher}가 패전 투수로 이름을 남겼지만, 한 명의 문제가 아니었습니다.`
      : `승부처에서 번번이 무너지는 패턴이 오늘도 반복됐습니다.`;
  const tailPart = facts.losingPitcher && facts.clutchHit
    ? `${facts.losingPitcher}를 포함해 팀 전체가 복기해야 할 경기입니다.`
    : `다음 경기, 반드시 되갚아야 합니다.`;
  return {
    headline,
    content: `${opener} ${corePart} ${tailPart} 팬들도 오늘만큼은 할 말이 없습니다.`,
  };
}

function parseJsonBlock(text: string): { headline?: string; content?: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as { headline?: string; content?: string };
  } catch {
    return null;
  }
}

export async function fetchPostGameFacts(input: {
  externalId: string;
  teamId: string;
  opponentTeamId: string;
  myScore: number;
  oppScore: number;
  mySide: Side;
}): Promise<PostGameFacts> {
  const detail = await fetchJsonWithTimeout(`${NAVER_BASE}/schedule/games/${input.externalId}`, 900);
  const box = await fetchJsonWithTimeout(`${NAVER_BASE}/schedule/games/${input.externalId}/record`, 900);
  const relay = await fetchJsonWithTimeout(`${NAVER_BASE}/schedule/games/${input.externalId}/relayTexts`, 900);
  const texts = [...collectTexts(detail), ...collectTexts(relay)].map((line) => clip(line, 100));
  const side: Side = input.mySide;
  const opposite: Side = side === "home" ? "away" : "home";
  const stats = parseBoxStats(box);
  const pitching = parsePitchingResult(box);

  const myHits = side === "home" ? stats.homeHits : stats.awayHits;
  const oppHits = side === "home" ? stats.awayHits : stats.homeHits;
  const myErrors = side === "home" ? stats.homeErrors : stats.awayErrors;
  const oppErrors = side === "home" ? stats.awayErrors : stats.homeErrors;
  const myHomeRuns =
    (side === "home" ? stats.homeHomeRuns : stats.awayHomeRuns) ??
    countTeamKeyword(texts, findTeam(input.teamId).short, /(홈런|솔로포|투런|스리런)/);
  const oppHomeRuns =
    (side === "home" ? stats.awayHomeRuns : stats.homeHomeRuns) ??
    countTeamKeyword(texts, findTeam(input.opponentTeamId).short, /(홈런|솔로포|투런|스리런)/);

  return {
    externalId: input.externalId,
    myTeam: findTeam(input.teamId).short,
    oppTeam: findTeam(input.opponentTeamId).short,
    myScore: input.myScore,
    oppScore: input.oppScore,
    myHits,
    oppHits,
    myErrors,
    oppErrors,
    myHomeRuns,
    oppHomeRuns,
    winningPitcher:
      pitching.winningPitcher ??
      sanitizeTextValue(extractPitcherName(detail, ["winningpitcher", "winning_pitcher", "winner"])),
    losingPitcher:
      pitching.losingPitcher ??
      sanitizeTextValue(extractPitcherName(detail, ["losingpitcher", "losing_pitcher", "loser"])),
    savePitcher:
      pitching.savePitcher ??
      sanitizeTextValue(extractPitcherName(detail, ["savepitcher", "save_pitcher"])),
    clutchHit: firstByKeyword(texts, /(결승타|역전타|적시타|결정타)/),
    homeRun: firstByKeyword(texts, /(홈런|솔로포|투런|스리런)/),
    error: firstByKeyword(texts, /(실책|에러|E\d)/i),
    notable: texts.slice(0, 5),
  };
}

export async function generatePostGameReport(input: {
  teamId: string;
  opponentTeamId: string;
  mySide: "home" | "away";
  tone: Tone;
  facts: PostGameFacts;
  strictLlm?: boolean;
}): Promise<{ headline: string; content: string }> {
  const fallback = buildFallbackReport({ facts: input.facts, tone: input.tone });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    if (input.strictLlm) throw new Error("ANTHROPIC_API_KEY is missing (strictLlm mode)");
    return fallback;
  }

  const team = findTeam(input.teamId).short;
  const stadium = stadiumCity(input.mySide, input.teamId, input.opponentTeamId);
  const locationLine = stadium
    ? `경기장: ${stadium} (${input.mySide === "home" ? "홈" : "원정"} 경기)`
    : `경기: ${input.mySide === "home" ? "홈" : "원정"} 경기`;

  const system = `너는 ${team} 전담 편파 캐스터야. 직업적 품격(존댓말, 방송 어체)은 지키지만, 감정은 완전히 ${team} 편이야.
경기 직후 단 하나의 한줄평을 날리는 순간이야 — 통계 브리핑이 아니라, 이 경기를 하나의 문장으로 정의하는 거야.
중립 절대 금지. 오직 ${team} 팬의 눈으로 이 경기의 본질을 꿰뚫어라.

작성 원칙:
- 결승타·승리/패전투수·세이브처럼 명확한 주인공이 있으면 그 이름을 반드시 써라
- 안타/실책/홈런 수를 나열하는 브리핑 절대 금지 — 숫자는 문장 흐름에 녹이거나 생략
- 이 경기를 단 하나의 각도(영웅/패인/장면)로 날카롭게 잘라라
- 칭찬할 때는 아낌없이, 비판할 때는 직설적으로 — "아쉽다" 한마디로 때우는 결론 금지

반드시 JSON만 출력:
{"headline":"🎙️ [캐스터 한줄평] ...","content":"3~4문장 단락"}

규칙:
- headline: 18~56자, 존댓말
- content: 3~4문장 한 단락(줄바꿈 없이, 문장마다 어휘를 다르게), 존댓말
- 우리 팀 관점 고정, 상대팀과 똑같은 내용 재사용 금지
- "먹히다/먹힌다" 절대 금지
- 아래 금칙어 금지: "확인 중", "정보 없음", "탓할 수 없는"
- 데이터가 비어도 추측 금지하고 자연스러운 축약 표현 사용
- 경기장/구장 언급 시 반드시 아래 제공된 실제 경기장 위치를 사용할 것

⚾ 야구 용어 절대 해석 규칙:
- 탈삼진: 투수가 타자를 삼진 아웃시킨 것 (투수의 성공)
- 볼넷: 볼 4개로 출루 (투수 실책)
- 병살타: 타구 하나로 2명 아웃 (공격팀 최악)
- 희생플라이: 타자 아웃 대신 주자 득점, 실제 희생 아님`;
  const rainLine = input.facts.wasRainSuspended ? "경기 특이사항: 우천 중단 후 속개된 경기. 빗속에서 끝낸 긴장감을 한 문장에 녹여줘." : "";
  const narrativeLines = [
    input.facts.winningPitcher ? `승리투수: ${input.facts.winningPitcher}` : null,
    input.facts.losingPitcher ? `패전투수: ${input.facts.losingPitcher}` : null,
    input.facts.savePitcher ? `세이브: ${input.facts.savePitcher}` : null,
    input.facts.clutchHit ? `결승타 장면: ${input.facts.clutchHit}` : null,
    input.facts.homeRun && !input.facts.clutchHit ? `홈런 장면: ${input.facts.homeRun}` : null,
  ].filter(Boolean).join("\n");
  const prompt = `팀:${input.facts.myTeam}
상대:${input.facts.oppTeam}
${locationLine}
결과:${input.tone} | 스코어:${input.facts.myScore}:${input.facts.oppScore}
${rainLine ? `${rainLine}\n` : ""}
▶ 핵심 내러티브 (한줄평의 중심으로 활용할 것):
${narrativeLines || "투수/결승타 정보 없음"}

▶ 참고 수치 (숫자 나열 금지, 필요시 맥락으로만 활용):
안타:${input.facts.myHits ?? "?"}:${input.facts.oppHits ?? "?"}
실책:${input.facts.myErrors ?? "?"}:${input.facts.oppErrors ?? "?"}
홈런:${input.facts.myHomeRuns ?? "?"}:${input.facts.oppHomeRuns ?? "?"}
주요 장면:${(input.facts.notable ?? []).join(" | ") || "없음"}`;

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
          max_tokens: 360,
          temperature: 0.98,
          system,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[postgame-llm] bad_response", res.status, body.slice(0, 280));
        return null;
      }
      const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
      const text =
        json.content
          ?.filter((item) => item.type === "text" && typeof item.text === "string")
          .map((item) => item.text ?? "")
          .join("\n") ?? "";
      const parsed = parseJsonBlock(text);
      const headline = clip(parsed?.headline ?? "", 62);
      const content = clip(parsed?.content ?? "", 320);
      if (!headline || !content) return null;
      if (/확인\s*중|정보\s*없음|탓할 수 없는/i.test(`${headline} ${content}`)) return null;
      return { headline, content };
    } catch (error) {
      console.error("[postgame-llm] request_failed", (error as Error).message);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  const first = await callLlm(12000);
  if (first) return first;

  const second = await callLlm(18000);
  if (second) return second;

  if (input.strictLlm) {
    throw new Error("Claude generation failed after retries (strictLlm mode)");
  }

  return fallback;
}
