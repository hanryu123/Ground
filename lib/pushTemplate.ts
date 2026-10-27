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
  const body = pickNovelBySeed(
    `${seed}:body`,
    buildScoreBodyCandidates({ teamShort, oppShort, myScore, oppScore, tone, state, gap, inning, phase, scene }),
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

function buildScoreBodyCandidates(ctx: ScoreBodyContext): string[] {
  if (ctx.tone === "for") return buildScoreForBodyCandidates(ctx);
  return buildScoreAgainstBodyCandidates(ctx);
}

// 점수만 알 때(선수·장면 없이) 쓰는 본문 — 조각을 이어 붙이면 문장이 어색해져서 통문장으로만 둔다
function buildScoreForBodyCandidates(ctx: ScoreBodyContext): string[] {
  if (ctx.state === "comeback") {
    return [
      "뒤집었습니다! 이제 우리가 앞서갑니다.",
      "역전입니다. 이 분위기 그대로 갑시다.",
      "드디어 앞섰습니다. 이제 지키기만 하면 됩니다.",
      "판을 뒤집었습니다. 오늘 끝까지 볼 이유가 생겼네요.",
      "역전 성공! 상대 벤치가 바빠지겠습니다.",
      "기다리던 역전입니다. 한 점 더 달아나면 좋겠습니다.",
    ];
  }

  if (ctx.state === "tie") {
    return [
      "동점입니다! 다시 처음부터 시작이에요.",
      "따라잡았습니다. 이제 진짜 승부입니다.",
      "균형을 맞췄습니다. 이 기세로 뒤집어 봅시다.",
      "다시 원점입니다. 다음 한 점이 중요해졌어요.",
      "동점 만들었습니다. 경기가 다시 재밌어졌네요.",
      "쫓아갔습니다. 이제 역전만 남았습니다.",
    ];
  }

  if (ctx.state === "trail") {
    return [
      `따라갔습니다. 이제 ${ctx.gap}점 차예요.`,
      `추격 시작입니다. ${ctx.gap}점, 충분히 뒤집을 수 있습니다.`,
      "점수를 냈습니다. 여기서 한 번 더 이어가면 됩니다.",
      `간격을 줄였습니다. 남은 건 ${ctx.gap}점입니다.`,
      "점수가 나왔습니다. 이 흐름 이어갑시다.",
      "따라붙었습니다. 아직 경기 많이 남았어요.",
    ];
  }

  if (ctx.scene === "first-run") {
    return [
      "선취점입니다! 기분 좋게 시작합니다.",
      "먼저 점수를 냈습니다. 이 흐름 그대로 갑시다.",
      "선취점 가져왔습니다. 오늘 출발 좋네요.",
      "첫 점수가 우리 쪽에서 나왔습니다.",
      "먼저 앞서갑니다. 한 점 더 달아나면 좋겠어요.",
    ];
  }

  if (ctx.gap === 1) {
    return [
      "앞서갑니다! 한 점 차라 아직 안심은 이릅니다.",
      "리드 잡았습니다. 이 한 점 꼭 지켜봅시다.",
      "앞서는 점수입니다. 한 점 더 달아나면 좋겠네요.",
      "앞서는 점수가 나왔습니다. 이제 지키는 싸움입니다.",
      "리드입니다. 아직 한 점 차라 끝까지 집중해야 해요.",
    ];
  }

  if (ctx.phase === "late") {
    return [
      `${ctx.gap}점 차로 벌렸습니다. 이제 굳히기 들어갑니다.`,
      `달아나는 점수입니다. ${ctx.gap}점 차면 한결 편해졌어요.`,
      "후반에 꼭 필요한 추가점이 나왔습니다.",
      `${ctx.gap}점 차입니다. 남은 아웃카운트만 잘 잡으면 됩니다.`,
      "쐐기를 박는 점수가 나왔습니다.",
    ];
  }

  return [
    `추가점입니다. 이제 ${ctx.gap}점 차예요.`,
    `달아납니다! ${ctx.gap}점 차로 벌렸습니다.`,
    "점수가 계속 나옵니다. 오늘 타선 좋네요.",
    `${ctx.gap}점 차 리드입니다. 이 흐름 그대로 갑시다.`,
    "또 점수 냈습니다. 상대 투수 흔들리고 있어요.",
  ];
}

function buildScoreAgainstBodyCandidates(ctx: ScoreBodyContext): string[] {
  if (ctx.scene === "lost-lead") {
    return [
      `역전을 허용했습니다. 이제 ${ctx.gap}점 차로 뒤집혔어요.`,
      "리드를 뺏겼습니다. 바로 다시 뒤집어야 합니다.",
      "역전당했습니다. 아직 시간은 충분해요.",
      `경기가 뒤집혔습니다. ${ctx.gap}점, 다시 따라가 봅시다.`,
      "앞서던 경기가 뒤집혔습니다. 다음 공격에서 갚아줍시다.",
    ];
  }

  if (ctx.scene === "conceded-first") {
    return [
      `선취점을 내줬습니다. 아직 ${ctx.gap}점, 금방 따라갈 수 있어요.`,
      "먼저 점수를 내줬습니다. 바로 따라가 봅시다.",
      "상대가 먼저 앞서갑니다. 아직 경기 남았어요.",
      "선취점은 상대 쪽입니다. 다음 공격에서 갚아줍시다.",
    ];
  }

  if (ctx.scene === "went-behind") {
    return [
      `점수를 내줬습니다. ${ctx.gap}점 차예요.`,
      "리드를 내줬습니다. 바로 따라가 봅시다.",
      `실점했습니다. 이제 ${ctx.gap}점 뒤집니다.`,
      "균형이 깨졌습니다. 다음 공격에서 다시 맞춥시다.",
      "상대가 앞서갑니다. 아직 경기 많이 남았어요.",
    ];
  }

  if (ctx.state === "tie") {
    return [
      "동점을 허용했습니다. 다시 처음부터예요.",
      "따라잡혔습니다. 다음 공격에서 바로 다시 가져옵시다.",
      "리드가 사라졌습니다. 아직 경기는 길어요.",
      "동점이 됐습니다. 여기서 더 내주면 안 됩니다.",
      "원점으로 돌아갔습니다. 다시 집중해 봅시다.",
    ];
  }

  if (ctx.state === "lead") {
    if (ctx.gap === 1) {
      return [
        "실점했습니다. 이제 한 점 차라 긴장해야 해요.",
        "한 점 차로 쫓겼습니다. 여기서 끊어야 합니다.",
        "아직 앞서지만 한 점 차입니다. 추가 실점은 막아야 해요.",
        "점수를 내줬습니다. 리드가 한 점밖에 안 남았어요.",
        "추격을 허용했습니다. 다음 이닝이 중요합니다.",
      ];
    }
    return [
      `실점했지만 아직 ${ctx.gap}점 앞서 있습니다.`,
      `점수를 내줬습니다. 그래도 아직 ${ctx.gap}점 리드예요.`,
      "점수를 내줬지만 여기서 바로 끊으면 됩니다.",
      `간격이 줄었습니다. 아직 ${ctx.gap}점 차라 괜찮아요.`,
      "실점은 아쉽지만 리드는 지키고 있습니다.",
    ];
  }

  return [
    `또 실점했습니다. 이제 ${ctx.gap}점 차예요.`,
    `점수를 더 내줬습니다. ${ctx.gap}점 차로 벌어졌어요.`,
    "추가 실점입니다. 빨리 끊고 공격에서 갚아야 합니다.",
    `${ctx.gap}점 차가 됐습니다. 아직 경기는 남아 있어요.`,
    "또 내줬습니다. 다음 공격에서 반격해 봅시다.",
    "실점이 이어집니다. 이 흐름부터 끊어야 해요.",
  ];
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
