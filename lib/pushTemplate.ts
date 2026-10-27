import type { CasterStyle } from "@/lib/notifications/casterStyle";
import { buildStyledScoreLines, type ScoreSituation } from "@/lib/score/casterLines";

export type PushPulseState = "lead" | "trail" | "tie" | "comeback";
export type ScoreTone = "for" | "against";

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickBySeed<T>(seed: string, items: readonly T[]): T {
  return items[hashSeed(seed) % items.length] ?? items[0];
}

function extractInning(latestPlayText?: string): number | null {
  const m = latestPlayText?.match(/(\d{1,2})회(?:초|말)?/);
  if (!m) return null;
  const inning = Number.parseInt(m[1], 10);
  return Number.isFinite(inning) ? inning : null;
}

function normalizeForSimilarity(text: string): string {
  return compactText(text)
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/^[가-힣A-Za-z]+\s+\d+:\d+\s+[가-힣A-Za-z]+\s*\|\s*/, "")
    .replace(/\d+/g, "N")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  const aSet = new Set(a.split(" ").filter((token) => token.length > 1));
  const bSet = new Set(b.split(" ").filter((token) => token.length > 1));
  if (aSet.size === 0 || bSet.size === 0) return 0;
  let inter = 0;
  for (const token of aSet) {
    if (bSet.has(token)) inter += 1;
  }
  const union = aSet.size + bSet.size - inter;
  return union <= 0 ? 0 : inter / union;
}

function isNearRecentCopy(candidate: string, recentBodies: readonly string[] = []): boolean {
  const normalizedCandidate = normalizeForSimilarity(candidate);
  if (!normalizedCandidate) return false;
  return recentBodies.some((body) => {
    const normalizedBody = normalizeForSimilarity(body);
    if (!normalizedBody) return false;
    if (normalizedBody === normalizedCandidate) return true;
    return tokenOverlap(normalizedCandidate, normalizedBody) >= 0.58;
  });
}

function pickNovelBySeed(
  seed: string,
  candidates: readonly string[],
  recentBodies?: readonly string[]
): string {
  const normalized = candidates.map(compactText).filter(Boolean);
  if (normalized.length === 0) return "";
  const start = hashSeed(seed) % normalized.length;
  for (let i = 0; i < normalized.length; i += 1) {
    const candidate = normalized[(start + i) % normalized.length];
    if (!isNearRecentCopy(candidate, recentBodies)) return candidate;
  }
  return normalized[start];
}

export function computePulseState(
  previousMyScore: number | null,
  previousOppScore: number | null,
  myScore: number,
  oppScore: number
): PushPulseState {
  if (
    previousMyScore != null &&
    previousOppScore != null &&
    previousMyScore < previousOppScore &&
    myScore > oppScore
  ) {
    return "comeback";
  }
  if (myScore > oppScore) return "lead";
  if (myScore < oppScore) return "trail";
  return "tie";
}

export function buildBiasedScoreCopy(input: {
  teamShort: string;
  oppShort: string;
  myScore: number;
  oppScore: number;
  tone: ScoreTone;
  state: PushPulseState;
  latestPlayText?: string;
  recentBodies?: readonly string[];
  /** 직전 점수 — 있으면 선취점·역전 허용 같은 장면을 구분한다 */
  prevMyScore?: number;
  prevOppScore?: number;
  /** 유저가 고른 말투 — 없으면 담백한 해설위원 */
  style?: CasterStyle;
}): { title: string; body: string } {
  const { teamShort, oppShort, myScore, oppScore, tone, state, latestPlayText, recentBodies } = input;
  const scene = resolveScoreScene(input);
  const gap = Math.abs(myScore - oppScore);
  const inning = extractInning(latestPlayText);
  const phase = inning == null ? "mid" : inning >= 7 ? "late" : inning >= 4 ? "mid" : "early";
  const seed = [
    teamShort,
    oppShort,
    myScore,
    oppScore,
    tone,
    state,
    latestPlayText ?? "",
    recentBodies?.slice(0, 3).join("|") ?? "",
  ].join(":");

  const title = pickBySeed(`${seed}:title`, buildScoreTitleCandidates(teamShort, tone, state, gap));
  const ctx: ScoreBodyContext = { teamShort, oppShort, myScore, oppScore, tone, state, gap, inning, phase, scene };
  const body = pickNovelBySeed(
    `${seed}:body`,
    buildStyledScoreLines(input.style ?? "analyst", resolveScoreSituation(ctx), gap, teamShort),
    recentBodies
  );
  return { title, body };
}

function buildScoreTitleCandidates(
  teamShort: string,
  tone: ScoreTone,
  state: PushPulseState,
  gap: number
): string[] {
  if (tone === "for") {
    if (state === "comeback") {
      return [
        `🔥 ${teamShort} 역전`,
        `💥 ${teamShort} 판 뒤집음`,
        `🚨 ${teamShort} 역전 알림`,
        `📣 ${teamShort} 응원석 폭발`,
        `⚾ ${teamShort} 흐름 전환`,
        `🧨 ${teamShort} 뒤집었다`,
        `🔥 ${teamShort} 경기 흔든다`,
        `💫 ${teamShort} 타선 응답`,
      ];
    }
    if (state === "tie") {
      return [
        `⚾ ${teamShort} 동점`,
        `🔥 ${teamShort} 균형 맞춤`,
        `📣 ${teamShort} 다시 원점`,
        `💥 ${teamShort} 따라잡았다`,
        `🫀 ${teamShort} 심장 재가동`,
        `🚨 ${teamShort} 동점 알림`,
        `🥁 ${teamShort} 경기 재점화`,
        `⚾ ${teamShort} 원점 복귀`,
      ];
    }
    if (state === "trail") {
      return [
        `🔥 ${teamShort} 추격`,
        `📣 ${teamShort} 따라붙음`,
        `⚾ ${teamShort} 반격 시작`,
        `🚨 ${teamShort} 불씨 점화`,
        `🫀 ${teamShort} 불씨 살림`,
        `💥 ${teamShort} 공격 응답`,
        `🥁 ${teamShort} 다시 붙는다`,
        `🔥 ${teamShort} 알림창 가동`,
      ];
    }
    return [
      `🔥 ${teamShort} 득점`,
      `📣 ${teamShort} 앞선다`,
      `⚾ ${teamShort} 공격 성공`,
      gap === 1 ? `😬 ${teamShort} 한 점 앞섬` : `🚀 ${teamShort} 점수 벌림`,
      `💥 ${teamShort} 점수판 흔듦`,
      `🥁 ${teamShort} 응원석 반응`,
      `🫀 ${teamShort} 타이밍 득점`,
      `🧨 ${teamShort} 압박 성공`,
      `🔥 ${teamShort} 흐름 잡음`,
      `⚾ ${teamShort} 한 점의 온도`,
    ];
  }

  if (state === "tie") {
    return [
      `⚠️ ${teamShort} 동점 허용`,
      `😮‍💨 ${teamShort} 다시 원점`,
      `🚨 ${teamShort} 흐름 경고`,
      `🧯 ${teamShort} 불씨 조심`,
      `😬 ${teamShort} 살얼음판`,
      `📉 ${teamShort} 리드 삭제`,
      `⚾ ${teamShort} 바로 응답 필요`,
      `🔒 ${teamShort} 다시 잠가야`,
    ];
  }
  if (state === "lead") {
    return [
      `⚠️ ${teamShort} 실점`,
      `😮‍💨 ${teamShort} 불씨 조심`,
      gap === 1 ? `😬 ${teamShort} 한 점 차` : `🚨 ${teamShort} 간격 좁혀짐`,
      `🧯 ${teamShort} 바로 진화`,
      `🔒 ${teamShort} 다시 잠가야`,
      `📉 ${teamShort} 흐름 경고`,
      `⚾ ${teamShort} 수비 집중`,
      `🫠 ${teamShort} 아픈 실점`,
    ];
  }
  return [
    `🚨 ${teamShort} 실점`,
    `⚠️ ${teamShort} 위기`,
    `😮‍💨 ${teamShort} 점수 허용`,
    `📉 ${teamShort} 흐름 밀림`,
    `🧯 ${teamShort} 급한 불`,
    `😬 ${teamShort} 답 필요`,
    `⚾ ${teamShort} 바로 끊어야`,
    `🔒 ${teamShort} 수비 재정비`,
  ];
}

type ScoreBodyContext = {
  teamShort: string;
  oppShort: string;
  myScore: number;
  oppScore: number;
  tone: ScoreTone;
  state: PushPulseState;
  gap: number;
  inning: number | null;
  phase: "early" | "mid" | "late";
  scene: ScoreScene;
};

/** 상태(state)만으로는 구분이 안 되는 장면 */
type ScoreScene = "first-run" | "conceded-first" | "lost-lead" | "went-behind" | null;

function resolveScoreScene(input: {
  myScore: number;
  oppScore: number;
  tone: ScoreTone;
  prevMyScore?: number;
  prevOppScore?: number;
}): ScoreScene {
  const { prevMyScore: pm, prevOppScore: po, myScore: m, oppScore: o } = input;
  if (pm == null || po == null) return null;
  if (input.tone === "for") return pm === 0 && po === 0 ? "first-run" : null;
  if (m >= o) return null;
  if (pm > po) return "lost-lead";
  if (pm === po) return pm === 0 ? "conceded-first" : "went-behind";
  return null;
}

/** 말투별 문장 목록(casterLines)을 고르는 장면 — 위에서부터 먼저 맞는 것 */
function resolveScoreSituation(ctx: ScoreBodyContext): ScoreSituation {
  if (ctx.tone === "for") {
    if (ctx.state === "comeback") return "for-comeback";
    if (ctx.state === "tie") return "for-tie";
    if (ctx.state === "trail") return "for-trail";
    if (ctx.scene === "first-run") return "for-first";
    if (ctx.gap === 1) return "for-lead1";
    return ctx.phase === "late" ? "for-late" : "for-lead";
  }
  if (ctx.scene === "lost-lead") return "against-lost-lead";
  if (ctx.scene === "conceded-first") return "against-first";
  if (ctx.scene === "went-behind") return "against-went-behind";
  if (ctx.state === "tie") return "against-tie";
  if (ctx.state === "lead") return ctx.gap === 1 ? "against-lead1" : "against-lead";
  return ctx.gap >= 5 ? "against-big" : "against-trail";
}

export function buildBiasedLineupCopy(input: {
  teamShort: string;
  starter: string;
  state: PushPulseState;
}): { title: string; body: string } {
  const { teamShort, starter, state } = input;
  const title = pickRandom([
    `${teamShort} 오늘 선발 라인업 확정! ⚾️`,
    `🚨 ${teamShort} 라인업 떴다`,
    `🔥 ${teamShort} 선발 공개`,
  ]);
  const byState: Record<PushPulseState, string[]> = {
    lead: [
      `오늘 선발투수는 ${starter}. 기세 이어서 끝까지 밀어붙이자.`,
      `${starter} 출격. 지금 분위기면 그냥 찢는다.`,
    ],
    trail: [
      `오늘 선발투수는 ${starter}. 지금부터 반격 시나리오 쓴다.`,
      `${starter} 나온다. 오늘 판 뒤집자.`,
    ],
    tie: [
      `오늘 선발투수는 ${starter}. 라인업 보러 가자 🔥`,
      `${starter} 확정. 편파 중계 시작한다.`,
    ],
    comeback: [
      `${starter} 출격. 역전각 제대로 잡혔다.`,
      `오늘은 ${starter}. 역전 드라마 찍으러 간다.`,
    ],
  };
  return { title, body: pickRandom(byState[state]) };
}
