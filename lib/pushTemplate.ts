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
  /** 유저가 고른 말투 — 없으면 default */
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
  const style = input.style ?? "default";
  const body = pickNovelBySeed(
    `${seed}:body`,
    style === "default"
      ? buildScoreBodyCandidates(ctx)
      : buildStyledScoreLines(style, resolveScoreSituation(ctx), gap, teamShort),
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

/** 말투별 문장 목록을 고르는 장면 — 아래 default 목록의 분기 순서와 같다 */
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

function buildScoreBodyCandidates(ctx: ScoreBodyContext): string[] {
  if (ctx.tone === "for") return buildScoreForBodyCandidates(ctx);
  return buildScoreAgainstBodyCandidates(ctx);
}

// 점수만 알 때(선수·장면 없이) 쓰는 본문 — 조각을 이어 붙이면 문장이 어색해져서 통문장으로만 둔다.
// 말투는 여유 있고 능청스러운 재치(아이언맨 느낌): 득점엔 자신만만, 실점엔 쿨한 자조 + 반격 의지.
function buildScoreForBodyCandidates(ctx: ScoreBodyContext): string[] {
  if (ctx.state === "comeback") {
    return [
      "역전입니다. 계산대로예요. 물론 계산은 방금 했습니다.",
      "뒤집었습니다. 저쪽 벤치는 지금 플랜 B 찾느라 바쁘겠네요.",
      "역전 완료. 이런 전개, 개인적으로 아주 좋아합니다.",
      "판을 뒤집었습니다. 박수는 경기 끝나고 몰아서 받겠습니다.",
      "역전입니다. 조금 늦게 왔지만 원래 주인공은 늦게 등장하죠.",
      "앞서갑니다. 상대한테 리드는 잠깐 빌려준 거였습니다.",
    ];
  }

  if (ctx.state === "tie") {
    return [
      "동점입니다. 상대가 너무 편해 보여서 좀 거슬렸거든요.",
      "원점입니다. 이제야 경기가 재밌어지네요.",
      "따라잡았습니다. 리셋 버튼 누른 셈이죠.",
      "동점. 여기서부터가 진짜 실력입니다.",
      "균형 맞췄습니다. 다음 장면은 우리가 쓰겠습니다.",
    ];
  }

  if (ctx.state === "trail") {
    return [
      `${ctx.gap}점 차. 추격 모드 가동합니다.`,
      "점수 나왔습니다. 시동은 걸렸으니 이제 밟기만 하면 됩니다.",
      `아직 ${ctx.gap}점 차로 뒤지지만, 뒤집는 쪽이 더 멋있잖아요.`,
      "따라갑니다. 상대도 슬슬 뒤를 돌아볼 때가 됐죠.",
      `간격 줄였습니다. 남은 ${ctx.gap}점 차는 금방 지우겠습니다.`,
    ];
  }

  if (ctx.scene === "first-run") {
    return [
      "선취점. 먼저 하는 게 원래 우리 스타일입니다.",
      "선취점입니다. 오늘 시작부터 아주 마음에 드네요.",
      "먼저 한 점. 워밍업 치고는 괜찮죠?",
      "첫 점수는 우리 겁니다. 오늘 분위기 좋습니다.",
    ];
  }

  if (ctx.gap === 1) {
    return [
      "앞서갑니다. 한 점 차는 스릴이라고 부르기로 하죠.",
      "리드 잡았습니다. 여유는 한 점 더 내고 부리겠습니다.",
      "한 점 앞섭니다. 아직 축배는 냉장고에 넣어 두세요.",
      "앞서는 점수입니다. 이제 지키는 것도 멋있게 해 보죠.",
    ];
  }

  if (ctx.phase === "late") {
    return [
      `${ctx.gap}점 차. 이 정도면 슬슬 퇴근 준비해도 되겠는데요.`,
      "쐐기 박았습니다. 저쪽 벤치는 오늘 일찍 쉬셔도 됩니다.",
      `${ctx.gap}점 차입니다. 남은 건 세리머니 연습 정도?`,
      "후반 추가점. 깔끔하게 마무리하는 게 우리 방식이죠.",
    ];
  }

  return [
    `추가점. ${ctx.gap}점 차, 슬슬 지루할 정도로 잘하네요.`,
    "또 점수입니다. 오늘 타선 업그레이드 받았나 봅니다.",
    `${ctx.gap}점 차. 저쪽 투수한테 조금 미안해지네요.`,
    "달아납니다. 겸손은 경기 끝나고 챙기겠습니다.",
    `${ctx.gap}점 차로 앞섭니다. 이 흐름, 굳이 바꿀 이유가 없죠.`,
  ];
}

function buildScoreAgainstBodyCandidates(ctx: ScoreBodyContext): string[] {
  if (ctx.scene === "lost-lead") {
    return [
      "역전 허용. 네, 이건 계획에 없었습니다.",
      `뒤집혔습니다. ${ctx.gap}점 차, 다시 뒤집으면 더 멋있게 끝나겠네요.`,
      "앞서던 경기를 뺏겼습니다. 돌려받을 시간은 충분합니다.",
      "역전당했습니다. 좋아요, 반전 있는 경기가 원래 재밌죠.",
    ];
  }

  if (ctx.scene === "conceded-first") {
    return [
      "선취점 허용. 상대한테 먼저 하라고 양보한 걸로 하죠.",
      "먼저 내줬습니다. 몸 풀기 끝났으면 이제 시작합시다.",
      "선취점은 저쪽 몫. 마지막 점수만 우리 거면 됩니다.",
      "먼저 내줬습니다. 첫 점수가 결과는 아니니까요.",
    ];
  }

  if (ctx.scene === "went-behind") {
    return [
      "앞서가는 건 저쪽입니다. 잠깐 빌려준 걸로 하죠.",
      `${ctx.gap}점 차로 뒤집니다. 쫓아가는 그림도 나쁘지 않습니다.`,
      "상대가 앞서갑니다. 좋아요, 이제 진지하게 하겠습니다.",
      "균형이 깨졌습니다. 다시 맞추는 건 우리 전문입니다.",
    ];
  }

  if (ctx.state === "tie") {
    return [
      "동점 허용. 쉽게 이기면 재미없다는 거죠, 알겠습니다.",
      "따라잡혔습니다. 좋아요, 다시 증명하면 됩니다.",
      "원점입니다. 각본에 없던 장면이지만 수정 가능합니다.",
      "동점이 됐습니다. 상대도 체면은 세워야 했나 봅니다.",
    ];
  }

  if (ctx.state === "lead") {
    if (ctx.gap === 1) {
      return [
        "한 점 차로 쫓깁니다. 스릴은 이 정도면 충분한데요.",
        "실점. 아직 앞서 있으니 당황은 사치입니다.",
        "쫓겼습니다. 여기서 끊는 게 진짜 실력이죠.",
        "한 점 차. 상대가 자꾸 대화에 끼어드네요.",
      ];
    }
    return [
      `실점했지만 아직 ${ctx.gap}점 차로 앞섭니다. 여유 조금 반납했을 뿐이죠.`,
      "점수 좀 내줬습니다. 기부 행사는 여기까지만 하죠.",
      `${ctx.gap}점 차 리드 유지. 저쪽도 점수판에 이름은 올려야죠.`,
      `간격이 줄었지만 ${ctx.gap}점 차입니다. 아직 우리 판이에요.`,
    ];
  }

  if (ctx.gap >= 5) {
    return [
      `${ctx.gap}점 차. 오늘은 계산기가 고장 난 날인가 봅니다.`,
      "또 내줬습니다. 오늘 수비는 공장 초기화가 필요합니다.",
      `${ctx.gap}점 차입니다. 할 말은 없지만 끝까지 보는 게 팬의 품격이죠.`,
      "추가 실점. 오늘 경기는 리플레이 안 하는 걸로 하죠.",
    ];
  }

  return [
    `또 실점. ${ctx.gap}점 차, 솔직히 좀 거슬리네요.`,
    "추가 실점입니다. 이제 진지하게 갈 시간이에요.",
    `${ctx.gap}점 차. 역전 드라마는 원래 이런 점수에서 시작하죠.`,
    "또 내줬습니다. 오늘 수비는 재부팅이 필요합니다.",
    `${ctx.gap}점 차로 뒤집니다. 저쪽이 너무 신났는데, 곧 조용해질 겁니다.`,
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
