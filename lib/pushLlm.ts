import { TEAMS, findTeam } from "@/lib/teams";
import {
  buildCopyStyleBrief,
  buildScoreFallbackCopy,
  sanitizeBoringFanCopy,
} from "@/lib/fanCopyVariety";

/**
 * Claude 반말 어미 → 존댓말 강제 변환 후처리
 * 프롬프트로 막히지 않는 케이스를 코드 레벨에서 차단
 */
export function enforcePolite(text: string): string {
  let s = text;

  // 문장 단위로 쪼개어 각 어미 변환 후 재조합
  // 느낌표/마침표/물음표 기준 split
  const sentences = s.split(/(?<=[!！?？.。])\s*/);
  const fixed = sentences.map((seg) => {
    const trimmed = seg.trimEnd();
    if (!trimmed) return seg;

    // 이미 존댓말 어미면 패스
    if (/(?:습니다|습니까|네요|군요|죠|합니다|세요|어요|아요|겠어요|겠습니다|고요)[!！?？.。]?\s*$/.test(trimmed)) return seg;

    // 반말 어미 → 존댓말 변환
    const tail = seg.replace(
      // 어미 패턴 — 문장 끝(선택적 구두점 앞)
      /(됩니까|되겠어|되겠지|돼버렸어|됐잖아|됐어|됐다|돼야지|돼야|돼!|돼$|안 돼|안돼)([!！?！]*)(\s*)$/,
      (_, _m, punc, sp) => `됩니다${punc || "!"}${sp}`
    ).replace(
      /([가-힣]+)(었어|았어|했어|겠어|갔어|났어|됐어)([!！?！]*)(\s*)$/,
      (_, stem, _e, punc, sp) => `${stem}었습니다${punc || "!"}${sp}`
    ).replace(
      /([가-힣]+)(어야 해|아야 해|어야해|아야해)([!！?！]*)(\s*)$/,
      (_, stem, _e, punc, sp) => `${stem}어야 합니다${punc || "!"}${sp}`
    ).replace(
      /([가-힣]+)(잖아|잖아요)([!！?！]*)(\s*)$/,
      (_, stem, _e, punc, sp) => `${stem}잖습니까${punc || "!"}${sp}`
    ).replace(
      /(이겨야 돼|이겨야해)([!！?！]*)(\s*)$/,
      (_, _m, punc, sp) => `이겨야 합니다${punc || "!"}${sp}`
    ).replace(
      /([가-힣a-zA-Z]+)(했다|됐다|났다|갔다|왔다|쳤다|잡았다|쐈다|뽑았다|터졌다|올랐다|꽂았다|잡혔다|막혔다|흔들렸다)([!！?！]*)(\s*)$/,
      (_, stem, verb, punc, sp) => `${stem}${verb.replace(/다$/, "습니다")}${punc || "!"}${sp}`
    ).replace(
      /([가-힣]+)(았어|었어)([!！?！]*)(\s*)$/,
      (_, stem, _e, punc, sp) => `${stem}았습니다${punc || "!"}${sp}`
    );

    return tail;
  });

  return fixed
    .join(" ")
    .replace(/\s+([!！?？.。])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Claude가 생성한 push body에서 헤더(이닝·스코어·팀명) 부분을 제거한다.
 * 다양한 변형을 처리:
 *   "[2회초] 한화 0:1 두산 | ..." → "..."
 *   "🎙 **[2회초]** 한화 0 : 1 두산 ..." → "..."
 *   "1회초 | 삼성 2:0 롯데 | ..." → "..."
 */
export function stripLlmHeaderPrefix(text: string): string {
  let s = text;
  // 1. 마크다운 강조(**)  제거
  s = s.replace(/\*+/g, "");
  // 2. 선행 이모지/특수문자 제거 (한글·영문·숫자·[ 가 나올 때까지)
  s = s.replace(/^[^가-힣a-zA-Z0-9[]+/, "");
  // 3. [N회초/말] 또는 [텍스트] 제거
  s = s.replace(/^\[[^\]]+\]\s*/, "");
  // 4. N회초/말 패턴 (파이프 유무 모두)
  s = s.replace(/^\d{1,2}회[초말]?\s*\|?\s*/, "");
  // 5. 팀명 N:N 팀명 패턴 (콜론 주변 공백 허용)
  s = s.replace(/^[가-힣A-Za-z]{1,6}\s+\d{1,2}\s*:\s*\d{1,2}\s+[가-힣A-Za-z]{1,6}\s*\|?\s*/, "");
  // 6. 남은 | 제거
  s = s.replace(/^\|\s*/, "");
  return s.trim();
}

type GenerateScorePushInput = {
  favoriteTeam: string;
  opponentTeam: string;
  myScore: number;
  oppScore: number;
  /** 내 팀이 홈/원정 중 어느 쪽인지 알면 다음 공격 이닝을 정확히 계산한다. */
  mySide?: "home" | "away";
  /** "for"=내 팀 득점, "against"=상대 팀 득점. 미지정 시 스코어로 추정 */
  tone?: "for" | "against";
  latestPlayText: string;
  fallbackTitle: string;
  fallbackBody: string;
  recentBodies?: string[];
  /** 이전 내 팀 점수 (역전 감지용) */
  prevMyScore?: number;
  /** 이전 상대 팀 점수 (역전 감지용) */
  prevOppScore?: number;
};

type GenerateScorePushOptions = {
  apiKeyOverride?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  retryTimeoutMs?: number | null;
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5";

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clipForPush(text: string): string {
  const compact = compactText(text);
  if (compact.length <= 86) return compact;
  return `${compact.slice(0, 84)}..`;
}

function clipTitle(text: string): string {
  const compact = compactText(text);
  if (compact.length <= 48) return compact;
  return `${compact.slice(0, 46)}..`;
}

function buildRealtimeTitle(teamId: string): string {
  return `⚾️ ${findTeam(teamId).short} 실시간`;
}

function resolveScoreGap(input: GenerateScorePushInput): number {
  return Math.abs(input.myScore - input.oppScore);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const TEAM_ALIAS_PATTERN = TEAMS.flatMap((team) => [
  team.name,
  team.short,
  team.nameEn,
  team.shortEn,
])
  .filter(Boolean)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegExp)
  .join("|");

function stripBattingContextNoise(text: string): string {
  const teamAlias = `(?:${TEAM_ALIAS_PATTERN})`;
  return compactText(text)
    // "NC 다이노스 LG 공격", "한화 공격", "KT 위즈 LG 공격" 같은 릴레이 공수 표기 제거
    .replace(new RegExp(`(?:^|[|·,\\s])(?:${teamAlias}\\s*){1,3}공격\\s*[·:：\\-–—]?\\s*`, "gi"), " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function resolveScoreGapTier(input: GenerateScorePushInput): "close" | "danger" | "garbage" {
  const gap = resolveScoreGap(input);
  if (gap <= 2) return "close";
  if (gap <= 5) return "danger";
  return "garbage";
}

function normalizeForSimilarity(text: string): string {
  return compactText(text)
    .replace(/^\[[^\]]+\]\s*/, "")                                  // [N회초] 제거
    .replace(/^[가-힣A-Za-z]+\s+\d+:\d+\s+[가-힣A-Za-z]+\s*\|\s*/, "") // 팀 X:Y 팀 | 제거
    .replace(/^[가-힣A-Za-z]+\s+\d+:\d+\s+[가-힣A-Za-z]+[.\s]/, "")   // 팀 X:Y 팀. 제거 (buildCreativeFallback 형식)
    .replace(/\d+/g, "N")                                          // 숫자 통일 ("3점","4점" → 같은 토큰)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function calcTokenOverlapRatio(a: string, b: string): number {
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

function isNearDuplicate(candidate: string, recentBodies: string[]): boolean {
  const normalizedCandidate = normalizeForSimilarity(candidate);
  if (!normalizedCandidate) return false;
  return recentBodies.some((body) => {
    const normalizedBody = normalizeForSimilarity(body);
    if (!normalizedBody) return false;
    if (normalizedBody === normalizedCandidate) return true;
    const overlap = calcTokenOverlapRatio(normalizedCandidate, normalizedBody);
    return overlap >= 0.60;  // 0.80 → 0.60: 숫자 통일 후 구조적 유사성도 잡음
  });
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

function currentBattingSide(half: "초" | "말" | null): "home" | "away" | null {
  if (half === "초") return "away";
  if (half === "말") return "home";
  return null;
}

function resolveScoredRuns(input: GenerateScorePushInput): number | null {
  const tone = input.tone ?? (input.myScore >= input.oppScore ? "for" : "against");
  if (tone === "for" && input.prevMyScore != null) {
    const delta = input.myScore - input.prevMyScore;
    return delta > 0 ? delta : null;
  }
  if (tone === "against" && input.prevOppScore != null) {
    const delta = input.oppScore - input.prevOppScore;
    return delta > 0 ? delta : null;
  }
  return null;
}

function runCountLabel(runs: number): string {
  return runs === 1 ? "1점" : `${runs}점`;
}

function homeRunLabel(runs: number): string {
  if (runs === 1) return "솔로포";
  if (runs === 2) return "투런포";
  if (runs === 3) return "쓰리런";
  if (runs === 4) return "만루포";
  return `${runs}점포`;
}

function resolveNextMyAttack(input: GenerateScorePushInput): string | null {
  if (!input.mySide) return null;
  const { inning, half } = parseInningState(input.latestPlayText);
  if (inning == null || half == null) return null;

  const batting = currentBattingSide(half);
  if (batting === input.mySide) {
    return input.mySide === "away" ? `${inning + 1}회초` : `${inning + 1}회말`;
  }
  return input.mySide === "away" ? `${inning + 1}회초` : `${inning}회말`;
}

function isWalkOffSituation(input: GenerateScorePushInput): boolean {
  const { inning, half } = parseInningState(input.latestPlayText);
  if (inning == null || half == null) return false;
  return half === "말" && inning >= 9 && input.myScore > input.oppScore;
}

function ensureInningScorePrefix(
  text: string,
  inningTag: string,
  myTeamShort: string,
  myScore: number,
  oppScore: number,
  oppTeamShort: string,
): string {
  let compact = compactText(text);

  if (compact.includes("[경기종료]")) return compact;

  // Claude가 헤더를 직접 붙인 경우 모든 변형 제거 (이모지·볼드·공백 허용)
  compact = stripLlmHeaderPrefix(compact);

  // fallback 빌더(buildCreativeFallback 등)가 이미 "팀 X:Y 팀" 형태 스코어를 포함한 경우
  // → 이닝 태그만 앞에 추가하고 끝냄
  const alreadyHasScore = /^[가-힣A-Za-z]+\s+\d+:\d+\s+[가-힣A-Za-z]+/.test(compact);
  if (alreadyHasScore) {
    return inningTag && inningTag !== "경기중"
      ? `[${inningTag}] ${compact}`
      : compact;
  }

  // 이닝 정보 없으면 팀명+스코어만
  if (!inningTag || inningTag === "경기중") {
    return `${myTeamShort} ${myScore}:${oppScore} ${oppTeamShort} | ${compact}`;
  }

  return `[${inningTag}] ${myTeamShort} ${myScore}:${oppScore} ${oppTeamShort} | ${compact}`;
}

function buildScorePushTitle(
  inningTag: string,
  myTeamShort: string,
  myScore: number,
  oppScore: number,
  oppTeamShort: string,
): string {
  const inning = inningTag && inningTag !== "경기중" ? `${inningTag} ` : "";
  return clipTitle(`[KBO] ${inning}${myTeamShort} ${myScore}:${oppScore} ${oppTeamShort}`);
}

function stripScoreEventNoise(text: string): string {
  return stripBattingContextNoise(text)
    .replace(/\d{1,2}회(?:초|말)?/g, "")
    .replace(/스코어\s*변동[:：]?\s*/g, "")
    .replace(/^[가-힣A-Za-z]{1,8}\s+\d{1,2}\s*:\s*\d{1,2}\s+[가-힣A-Za-z]{1,8}\s*/g, "")
    .replace(new RegExp(`(?:${TEAM_ALIAS_PATTERN}\\s*){1,3}공격\\s*[·:：\\-–—]?\\s*`, "gi"), " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function buildScoringPlaySummary(input: GenerateScorePushInput): string | null {
  const scoringTeam = input.tone === "against"
    ? findTeam(input.opponentTeam)
    : findTeam(input.favoriteTeam);
  let detail = stripScoreEventNoise(input.latestPlayText);
  if (!detail || detail.length < 3) return null;
  if (/^스코어\s*변동|^[a-z]+ \d+:\d+ [a-z]+$/i.test(detail)) return null;

  detail = detail
    .replace(/\s*[:：]\s*/g, "! ")
    .replace(/\s*[-–—]\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (/^공격\b|공격\s*$/.test(detail)) return null;

  const hasTeamPrefix =
    detail.startsWith(scoringTeam.name) ||
    detail.startsWith(scoringTeam.short);
  const summary = hasTeamPrefix ? detail : `${scoringTeam.name} ${detail}`;
  return clipForPush(summary);
}

function attachScoringPlaySummary(body: string, input: GenerateScorePushInput): string {
  const cleanBody = stripBattingContextNoise(stripLlmHeaderPrefix(body));
  if (input.tone === "against") return cleanBody;
  const summary = buildScoringPlaySummary(input);
  if (!summary) return cleanBody;
  if (cleanBody.includes(summary) || summary.includes(cleanBody)) return summary;
  return `${summary} · ${cleanBody}`;
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

function extractEventHook(latestPlayText: string): string | null {
  const cleaned = stripBattingContextNoise(latestPlayText)
    .replace(/\d{1,2}회(?:초|말)?/g, "")
    .replace(/스코어\s*변동[:：]?\s*/g, "")
    .replace(new RegExp(`(?:${TEAM_ALIAS_PATTERN}\\s*){1,3}공격\\s*[·:：\\-–—]?\\s*`, "gi"), " ")
    .replace(/[()]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!cleaned) return null;
  if (cleaned.length <= 14) return cleaned;
  return cleaned.slice(0, 14).trim();
}

function buildVariedLeadLine(input: GenerateScorePushInput): string {
  const myTeam = findTeam(input.favoriteTeam).short;
  const oppTeam = findTeam(input.opponentTeam).short;
  const gap = input.myScore - input.oppScore;
  const eventHook = extractEventHook(input.latestPlayText);
  if (eventHook) {
    return `${myTeam} ${input.myScore}:${input.oppScore} ${oppTeam} (${eventHook}) 분위기 우리가 먹음🔥`;
  }
  if (gap >= 3) {
    return `${myTeam} ${input.myScore}:${input.oppScore} ${oppTeam}. 점수 더 벌렸다, 쐐기 각이다🚀`;
  }
  return `${myTeam} ${input.myScore}:${input.oppScore} ${oppTeam}. 한 번 더 찌르면 끝이다🔥`;
}

function ensureCopyVariety(text: string, input: GenerateScorePushInput): string {
  const normalized = compactText(text);
  if (!/상대\s*멘탈\s*흔들린다/.test(normalized)) return normalized;
  return buildVariedLeadLine(input);
}

function enforceScoreGapTone(text: string, input: GenerateScorePushInput): string {
  const normalized = compactText(text);
  const tier = resolveScoreGapTier(input);
  const trailing = input.myScore < input.oppScore;
  const leading = input.myScore > input.oppScore;

  // 크게 이기고 있는데 상대가 1점 넣어도 과도하게 반응하지 않음 (9회 10:0 → 10:1 상황)
  if (tier === "garbage" && leading && input.tone === "against") {
    if (/아 진짜|왜 이러냐|큰일|어떡|걱정|위기|무너지|역전|따라온다|흔들|뒤집힐/.test(normalized)) {
      const my = findTeam(input.favoriteTeam).short;
      const opp = findTeam(input.opponentTeam).short;
      const candidates = [
        `${my} ${input.myScore}:${input.oppScore} ${opp}. 한 점 내줬지만 이 차이면 문제없습니다.`,
        `${my} ${input.myScore}:${input.oppScore} ${opp}. 그래도 우리가 훨씬 앞서 있습니다.`,
        `한 점 줬지만 아직 차이 충분합니다. ${my} 여유 있습니다.`,
      ] as const;
      return candidates[(input.myScore + input.oppScore) % candidates.length];
    }
  }

  if (!trailing) return normalized;

  const phase = resolveInningPhase(input.latestPlayText);

  if (tier === "garbage") {
    if (/아직|역전|할 수 있다|끝났다\s*아님|쫓아간다|해보자|집중하자/.test(normalized)) {
      const my = findTeam(input.favoriteTeam).short;
      const opp = findTeam(input.opponentTeam).short;
      if (phase === "late") {
        // 후반 + 6점+ → 완전 이성 붕괴
        const candidates = [
          `저도 이제 모르겠습니다... ${my} ${input.myScore}:${input.oppScore} ${opp}`,
          `아 이게 무슨... 그냥 내일 봐야겠습니다.`,
          `${my} ${input.myScore}:${input.oppScore} ${opp}. 캐스터도 말문이 막힙니다.`,
          `오늘은 여기까지인 것 같습니다. 정말요.`,
        ] as const;
        return candidates[(input.myScore + input.oppScore) % candidates.length];
      }
      // 초/중반 + 6점+ → 체념·냉소
      const candidates = [
        `${my} ${input.myScore}:${input.oppScore} ${opp}... 할 말이 없네요.`,
        `${input.myScore}:${input.oppScore}, 도대체 왜 이러는 건지 모르겠습니다.`,
        `오늘은 좀 힘들 것 같습니다. 솔직히.`,
      ] as const;
      return candidates[(input.myScore + input.oppScore) % candidates.length];
    }
    return normalized;
  }

  if (tier === "danger") {
    if (/아직|침착|할 수 있다/.test(normalized)) {
      const replacement = phase === "late"
        ? "제발 정신 좀 차려야 합니다"
        : "빨리 따라잡아야 합니다";
      return normalized
        .replace(/아직/g, "")
        .replace(/침착/g, "")
        .replace(/할 수 있다/g, replacement)
        .replace(/\s{2,}/g, " ")
        .trim();
    }
  }
  return normalized;
}

function enforceRunCount(text: string, input: GenerateScorePushInput): string {
  const runs = resolveScoredRuns(input);
  if (runs == null) return compactText(text);

  const label = runCountLabel(runs);
  const homer = homeRunLabel(runs);
  let normalized = compactText(text);

  if (runs !== 1) {
    normalized = normalized
      .replace(/겨우\s*(?:1|한)\s*점(?:입니까|이냐|이라니)?[!?！]*/g, `${label}입니다`)
      .replace(/(?:1|한)\s*점/g, label)
      .replace(/솔로(?:포|홈런)?/g, homer);
  } else {
    normalized = normalized
      .replace(/[2-9]\s*점/g, label)
      .replace(/투런포?|쓰리런|스리런|만루포?/g, homer);
  }

  return normalized;
}

function enforceScoreGapLabel(text: string, input: GenerateScorePushInput): string {
  const gap = resolveScoreGap(input);
  const normalized = compactText(text);

  if (gap === 0) {
    return normalized
      .replace(/(?:한|[1-9]\d*)\s*점\s*차(?:가|로|까지|의)?/g, "동점")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return normalized
    .replace(/(?:한|[1-9]\d*)\s*점\s*차/g, `${gap}점 차`)
    .replace(/\s{2,}/g, " ")
    .trim();
}

function enforceNextAttackInning(text: string, input: GenerateScorePushInput): string {
  const nextAttack = resolveNextMyAttack(input);
  if (!nextAttack) return compactText(text);

  return compactText(text)
    .replace(/\d{1,2}회(?:초|말)\s*(우리\s*)?공격/g, `${nextAttack} 우리 공격`)
    .replace(/우리 공격에서/g, "우리 공격 때")
    .replace(/\d{1,2}회(?:초|말)\s*(?:에|에서)\s*꼭/g, `${nextAttack}에 꼭`);
}

function hashSeed(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pickBySeed(items: readonly string[], seed: string): string {
  return items[hashSeed(seed) % items.length];
}

function buildCreativeFallback(input: GenerateScorePushInput): string {
  const my = findTeam(input.favoriteTeam).short;
  const opp = findTeam(input.opponentTeam).short;
  return buildScoreFallbackCopy({
    favoriteTeam: my,
    opponentTeam: opp,
    myScore: input.myScore,
    oppScore: input.oppScore,
    tone: input.tone,
    latestPlayText: input.latestPlayText,
  });
}

function ensureNovelBody(input: GenerateScorePushInput, body: string): string {
  const recentBodies = input.recentBodies ?? [];
  if (recentBodies.length === 0) return body;
  if (!isNearDuplicate(body, recentBodies)) return body;
  const creative = buildCreativeFallback(input);
  return isNearDuplicate(creative, recentBodies) ? `${creative} ⚾️` : creative;
}

function resolveInningPhase(latestPlayText: string): "early" | "mid" | "late" {
  const { inning } = parseInningState(latestPlayText);
  if (inning == null) return "mid";
  if (inning <= 3) return "early";
  if (inning <= 6) return "mid";
  return "late";
}

// ─── 5가지 감정 상태 ─────────────────────────────────────────────────────────
type EmotionState =
  | "탐색전"       // 초반 (1~3회) × 모든 점수차 → 차분·분석적
  | "피말리는승부"  // 중/후반 (4~9회) × 박빙 (0~1점) → 극도 긴장
  | "일반적전개"   // 중반 (4~6회) × 격차 (2~4점) → 노련한 흐름 해설
  | "광란샤우팅"   // 후반 (7~9회) × 큰 차이 (5점+) → 이성 붕괴·광분
  | "역전";        // 이닝 무관, 리드 변경 발생 → 경악·기적 샤우팅

function resolveEmotionState(input: GenerateScorePushInput, phase: "early" | "mid" | "late"): EmotionState {
  const gap = Math.abs(input.myScore - input.oppScore);
  const tone = input.tone ?? (input.myScore >= input.oppScore ? "for" : "against");

  // 역전 감지: 이전에 뒤지고 있었는데 이번 득점으로 역전
  if (input.prevMyScore != null && input.prevOppScore != null && tone === "for") {
    const wasTrailing = input.prevMyScore < input.prevOppScore;
    const nowLeading  = input.myScore > input.oppScore;
    if (wasTrailing && nowLeading) return "역전";
  }
  // 역전 감지: 이전에 앞서고 있었는데 이번 실점으로 역전당함
  if (input.prevMyScore != null && input.prevOppScore != null && tone === "against") {
    const wasLeading   = input.prevMyScore > input.prevOppScore;
    const nowTrailing  = input.myScore < input.oppScore;
    if (wasLeading && nowTrailing) return "역전";
  }

  if (phase === "early") return "탐색전";
  if (gap <= 1) return "피말리는승부";
  if (gap >= 5 && phase === "late") return "광란샤우팅";
  return "일반적전개";
}

function buildEmotionGuide(state: EmotionState, input: GenerateScorePushInput, favoriteTeam: string): string {
  const tone = input.tone ?? (input.myScore >= input.oppScore ? "for" : "against");
  const isWinning = input.myScore > input.oppScore;
  const gap = Math.abs(input.myScore - input.oppScore);
  const phase = resolveInningPhase(input.latestPlayText);

  switch (state) {
    case "탐색전":
      return `🔥 [탐색전 — 초반 기싸움, 모든 한 점이 오늘 경기를 만든다]
팬 심리: 아직 초반이라 흥분보다 기대감이 크지만, 득실 한 점에 바로 반응함.
${tone === "for"
  ? `득점 상황 → 선제점 뽑은 흥분. "오늘 이 분위기 우리가 먹었다, 절대 놓치면 안 된다!"
키워드: 선제점, 기선 제압, 분위기 우리 것, 오늘이다`
  : `실점 상황 → 초반에 점수 내줬다는 당혹감. 화가 나지만 "아직 이닝 많다"며 자신을 달램.
키워드: 초반인데 왜 벌써, 빨리 따라잡아야, 이러면 안 되는데`}`;

    case "피말리는승부":
      return `💓 [피말리는 승부 — 박빙 혈전, 심장 터지기 직전]
팬 심리: 박빙이라 매 플레이가 심장에 꽂힌다. 이성 따윈 없다. 오로지 감정.
${tone === "for"
  ? `득점 상황 → 살았다는 안도+흥분 폭발. "아 진짜! 이 타이밍에!!!" 자리에서 펄쩍 뛰는 사람.
키워드: 살았다, 진짜 너무 좋다, 이 타이밍에, 심장이 터질 것 같다`
  : `실점 상황 → 진심으로 열받고 속이 타는 상태. "왜 이러냐고요!!!" 머리 쥐어뜯는 사람.
키워드: 진짜 왜 이러냐, 속이 탄다, 이 타이밍에, 제발`}
${phase === "late" ? "⚠️ 후반 박빙 → 감정 더 극대화. 글자 하나하나에서 절박함이 느껴져야 함." : ""}`;

    case "일반적전개":
      return `📊 [일반적 전개 — ${gap}점 차, 흐름 싸움]
팬 심리: ${isWinning
  ? `리드하고 있어서 좋지만 내심 "날리면 어떡하지" 불안도 있음. 확실하게 굳히길 원함.
톤: 자신감 있지만 긴장 동반. "이 리드 절대 안 놓쳐야 합니다, 한 점 더 뽑아야죠!" 류.
키워드: 이 기세, 한 점 더, 굳히자, 쐐기, 여기서 더 벌려야`
  : `지고 있어서 진짜 답답하고 짜증남. 왜 저렇게 못 치냐/못 막냐 진심으로 화남.
톤: 냉정한 척 없음. "아 진짜 답답합니다. 지금 당장 따라잡아야 합니다!" 류.
키워드: 답답하다, 왜 이러냐, 빨리 따라잡아야, 지금 아니면 안 된다`}`;

    case "광란샤우팅":
      return `🔥 [광란의 샤우팅 — 후반 ${gap}점 차, 이성 완전 붕괴]
팬 심리: ${isWinning
  ? `이미 사실상 이긴 거나 마찬가지. 완전 광란 축제 모드. 소리 지르는 사람 그 자체.
톤: "완전히 쓸어버립니다!!! 오늘 이 팀 진짜 뭔가요!!! 경기장이 들썩입니다!!!" 감탄사 한계치까지.
키워드: 쐐기, 폭발, 완전히 끝났다, 자비 없다, 축제, 들썩
⚠️ 이모지 2-3개 필수. "!!!" 연속 OK. 이성적 분석 완전 금지.`
  : `이 점수 차면 오늘 진짜 틀렸다. 이성 붕괴. 화·절망·체념 전부 섞인 상태.
톤: "저도 이제 모르겠습니다... 이거 어떻게 할 거예요 진짜..." 멘탈 터진 팬.
키워드: 멘탈 붕괴, 자비 없음, 오늘은 틀렸다, 이게 맞냐, 체념
⚠️ "아직 가능성 있다" 절대 금지. 희망찬 척은 이 상황에 안 맞음.`}`;

    case "역전":
      return `🚨 [역전 — 경기가 뒤집혔다]
팬 심리: ${tone === "for"
  ? `우리가 역전. 뇌가 없어질 정도의 흥분. 소리를 지르는 팬 그 자체.
톤: "뒤집었습니다!!!! 이게 말이 됩니까!!! 경기장이 폭발합니다!!!" 최대 텐션.
키워드: 역전, 뒤집다, 믿기지 않는다, 기적, 소름, 폭발, 경기장이 들썩
⚠️ 반드시 역전 상황임을 감정적으로 표현. 이모지 2-3개 필수.`
  : `역전당했다. 배신감·충격·망연자실. 팬이 느끼는 진짜 상실감.
톤: "...역전당했습니다. 이런 일이 일어나다니. 정말 믿기지 않습니다." 멘탈 나간 팬.
키워드: 역전당하다, 충격, 믿기지 않는다, 배신감, 망연자실
⚠️ 반드시 역전 상황임을 명시. 절망감이 텍스트 전체를 지배해야 함.`}`;
  }
}

function buildSystemPrompt(input: GenerateScorePushInput, recentBodies: string[]): string {
  const favoriteTeam = findTeam(input.favoriteTeam).short;
  const opponentTeam = findTeam(input.opponentTeam).short;
  const phase = resolveInningPhase(input.latestPlayText);
  const emotionState = resolveEmotionState(input, phase);
  const emotionGuide = buildEmotionGuide(emotionState, input, favoriteTeam);
  const styleBrief = buildCopyStyleBrief({
    surface: "score",
    seed: `${input.favoriteTeam}:${input.opponentTeam}:${input.myScore}:${input.oppScore}:${input.latestPlayText}`,
    teamShort: favoriteTeam,
    opponentShort: opponentTeam,
  });

  // 헤더([N회초] 팀 X:Y 팀 |) 제거 후 본문만 Claude에 전달 — 구조적 반복 방지에 집중
  const strippedRecent = recentBodies
    .slice(0, 6)
    .map((line) =>
      line
        .replace(/^\[[^\]]+\]\s*/, "")
        .replace(/^[가-힣A-Za-z]+\s+\d+:\d+\s+[가-힣A-Za-z]+\s*\|\s*/, "")
        .trim()
        .slice(0, 40)
    )
    .filter(Boolean);
  const avoid =
    strippedRecent.length > 0
      ? `\n\n⛔ 아래 문구와 비슷한 시작·구조·표현 절대 금지 (완전히 다른 방식으로):\n${strippedRecent
          .map((line) => `"${line}"`)
          .join("\n")}`
      : "";

  const emojiRule = emotionState === "광란샤우팅" || emotionState === "역전"
    ? `- 이모지 1~3개 적극 사용 (🔥 😱 🚀 등)`
    : `- 이모지 0~2개만`;

  return `[언어 규칙 — 최우선]
모든 문장은 반드시 존댓말로 끝나야 한다: -습니다 / -네요 / -죠 / -합니다 / -군요
반말(-야, -다, -어, -지, -네, -잖아) 절대 금지. 단 한 문장도 반말이면 실격.

너는 ${favoriteTeam} 전담 편파 캐스터야. 직업적으로 존댓말과 방송 어체는 지키지만, 감정은 완전히 우리 팀 편이야.
KBS·MBC 중립 캐스터 아님 — 처음부터 끝까지 ${favoriteTeam} 편파 중계가 이 방송의 정체성이야.
우리 팀 점수 나면 목소리 한 옥타브 올라가는 캐스터. 상대 팀 점수 나면 진심으로 허탈하고 열받는 캐스터.
냉정한 분석·중립 표현 금지. "양 팀 모두" 류 방관자 어투 완전 금지. 오직 우리 팀 시각.

🚫 절대 금지:
- "됐네", "가는군", "흐름상" 같은 냉정한 방관자 어투 금지
- 득점 상황에서 "아쉽다", "힘내자" 금지 / 실점 상황에서 "좋아!", "신난다" 금지
- "양 팀", "양측" 언급 금지 — 우리 팀 시각만 존재
- "N회 남았으니까" 금지 — [N회초/말]은 현재 N회 진행 중이라는 뜻
- 다음 우리 공격 이닝을 말해야 하면 반드시 사용자 프롬프트의 "다음 우리 공격" 값만 사용
- "먹히다/먹힌다" 금지 — 실점이면 "내줬습니다/털렸습니다", 득점이면 "터졌습니다/뽑아냈습니다"
- 우리 타자 삼진 시 상대 투수 칭찬 금지 → 우리 타자 실패·답답함에만 집중
- 이전 알림과 같은 첫 단어·첫 어구 반복 금지 — 매 알림은 완전히 다른 각도·감정으로 시작
- 쓸데없이 쿨한 척, 쓸데없이 이성적인 척 금지 — 팬은 원래 이성적이지 않음

⚾ 야구 용어 사전 (환각 방지):
- 탈삼진: 투수가 타자 삼진 아웃시킴 (투수 호투). "위기탈출"·"출루" 아님
- 헛스윙: 타자가 공을 빗맞히거나 완전히 놓침. "헛스윕"은 존재하지 않는 단어 — 절대 사용 금지
- 루킹 삼진: 배트 안 휘두르고 삼진 (called strike three)
- 병살타: 타구 하나로 주자 2명 아웃 = 공격팀 최악의 실패
- 희생플라이/번트: 타자 아웃 대신 주자 진루·득점 (전략적 선택)
- 사구(死球): 공에 맞아 출루. "죽음" 아님 / 볼넷(四球): 볼 4개로 출루
- 도루: 빠른 발로 다음 베이스 안착. 범죄 아님
- 폭투: 포수가 못 잡아 주자 진루. "폭력"·"패스트볼" 아님

━━━ 현재 감정 상태 ━━━
${emotionGuide}
━━━━━━━━━━━━━━━━━━━
${styleBrief}

📐 출력 규칙:
- 감탄 멘트 한 줄만 출력. 이닝 태그·스코어·팀명은 앞에 자동으로 붙음 — 다시 쓰지 마
- 금지 패턴 예시 (절대 출력 불가): "[2회초]", "**[2회초]**", "한화 0:1 두산", "🎙 [N회]"
- 네가 이닝·스코어·팀명을 출력하면 자동 헤더와 100% 중복된다 — 오직 감정 멘트만
- 득점 장면 설명(선수명·타구 방향·몇 득점)은 코드가 별도로 붙인다 — 너는 같은 설명을 반복하지 말고 감정 반응만 써라
- 점수차 표현은 사용자 프롬프트의 "점수차 N점"만 사용 — N이 1이 아니면 "1점 차/한 점 차" 절대 금지
- 데이터 의심 절대 금지: "이상한데요", "맞나요?", "잠깐" 등 주어진 이닝·스코어를 의심하는 표현 금지 — 데이터는 항상 정확하다. 네가 홈/원정을 모르기 때문에 이닝 공격권을 추론하면 반드시 틀린다
- 15~35자 이내
${emojiRule}${avoid}`;
}

function buildUserPrompt(input: GenerateScorePushInput): string {
  const favorite = findTeam(input.favoriteTeam);
  const opponent = findTeam(input.opponentTeam);
  const inningTag = extractInningTag(input.latestPlayText);
  const gap = resolveScoreGap(input);
  const tier = resolveScoreGapTier(input);
  const phase = resolveInningPhase(input.latestPlayText);
  const phaseLabel = phase === "early" ? "초반(1~3회)" : phase === "mid" ? "중반(4~6회)" : "후반(7회~)";
  const resolvedTone = input.tone ?? (input.myScore >= input.oppScore ? "for" : "against");
  const scoredRuns = resolveScoredRuns(input);
  const nextAttack = resolveNextMyAttack(input);
  const currentBatting = currentBattingSide(parseInningState(input.latestPlayText).half);
  const currentAttack =
    input.mySide && currentBatting
      ? currentBatting === input.mySide
        ? favorite.short
        : opponent.short
      : "unknown";
  const scoredTeam = resolvedTone === "for"
    ? `${favorite.short} 득점 🎉`
    : `${opponent.short} 득점 (실점)`;
  const statusLabel = input.myScore > input.oppScore ? "리드 중" : input.myScore < input.oppScore ? "뒤지는 중" : "동점";
  return `내 팀: ${favorite.short} (상대: ${opponent.short})
방금 득점: ${scoredTeam}
이번 득점: ${scoredRuns == null ? "unknown" : `${scoredRuns}점`} — 점수 표현은 이 값과 다르면 안 됨
현재 스코어: ${favorite.short} ${input.myScore} : ${input.oppScore} ${opponent.short}
이닝: [${inningTag}] (${phaseLabel})
현재 공격: ${currentAttack}
다음 우리 공격: ${nextAttack ?? "unknown"}
상황: ${statusLabel}, 점수차 ${gap}점 (${tier})
최근 플레이: ${input.latestPlayText}`;
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

// ─── Live Event (Strikeout / Pitcher Change) ─────────────────────────────────

type StrikeoutDetail = {
  swingKind: "swinging" | "looking" | "unknown";
  runners: "none" | "scoring_position" | "bases_loaded";
  is3pitch: boolean;
};

type GenerateLiveEventInput = {
  kind: "strikeout" | "pitcherChange" | "homeRun";
  myTeamShort: string;
  oppTeamShort: string;
  /** true=내 팀 수비(투구), false=내 팀 공격(타석), null=불명 */
  isPitching: boolean | null;
  inningLabel: string | null;
  /** 현재 내 팀 점수 */
  myCurrentScore?: number;
  /** 현재 상대 팀 점수 */
  oppCurrentScore?: number;
  /** 릴레이 텍스트에서 파싱한 선수 이름 (투수 또는 타자) */
  playerName?: string;
  /** 삼진 세부 상황 (kind === "strikeout"일 때만 유효) */
  strikeoutDetail?: StrikeoutDetail;
  recentBodies?: string[];
  fallbackBody: string;
};

/**
 * 삼진 상황(주자 유무 + 종류)에 따라 캐스터 감정 가이드를 반환.
 * isPitching=true (우리 투수 탈삼진) 전용.
 */
function buildStrikeoutGuide(d: StrikeoutDetail, name: string | null): string {
  const pitcher = name ? `${name} 투수` : "투수";

  // 1) 득점권 / 만루 위기 탈출
  if (d.runners === "bases_loaded" || d.runners === "scoring_position") {
    const crisisLabel = d.runners === "bases_loaded" ? "만루" : "득점권";
    return `🚨 [절체절명의 위기 탈출 — ${crisisLabel} 삼진]
캐스터 상태: 안도+폭발적 샤우팅. ${pitcher}의 강심장을 극찬해야 함.
톤: "이 위기를 스스로 지워버립니다!! 엄청난 강심장이네요! ${pitcher} 포효합니다!!" 류.
키워드: 위기 탈출, 불을 끄다, 클러치 피칭, 포효, 강심장
⚠️ 반드시 위기를 막아냈다는 안도+흥분 감정이 폭발해야 함.`;
  }

  // 2) 3구 삼진 (KKK) — 주자 없음
  if (d.is3pitch) {
    return `⚡ [압도적 지배 — 3구 삼진]
캐스터 상태: 투수 구위에 경악. 타자의 무기력함 강조.
톤: "3구 삼진! 오늘 이 투수 공은 칠 수가 없습니다! 타자들이 추풍낙엽처럼 쓰러집니다!" 류.
키워드: 언터처블, 자비 없는, 압도적 구위, 농락, KKK`;
  }

  // 3) 루킹 삼진
  if (d.swingKind === "looking") {
    return `🎯 [루킹 삼진 — 완벽한 제구]
캐스터 상태: 투수 제구력에 감탄. 타자의 얼어붙음 묘사.
톤: "배트를 낼 엄두조차 내지 못합니다! 완벽한 코스에 꽂히는 공! 심판의 손이 올라갑니다!" 류.
키워드: 꼼짝없이, 얼어붙다, 예술 같은 제구, 심판의 손`;
  }

  // 4) 헛스윙 삼진
  if (d.swingKind === "swinging") {
    return `💨 [헛스윙 삼진 — 완벽한 볼배합]
캐스터 상태: 투수의 수싸움 승리를 칭찬. 타자 타이밍 뺏김 묘사.
톤: "방망이가 허공을 헛돕니다! 투수의 완벽한 수싸움에 당했네요! 춤추는 변화구입니다!" 류.
키워드: 헛스윙, 허공을 가르다, 타이밍을 뺏기다, 춤추는 변화구`;
  }

  // 5) 일반 삼진 (주자 없음, 종류 불명)
  return `✅ [일상적 삼진 — 깔끔한 처리]
캐스터 상태: 차분하게 상황 전달. 투수 템포·경제적 피칭 강조.
톤: "깔끔하게 아웃카운트를 늘려갑니다. 투구수 관리도 좋네요!" 류.
키워드: 깔끔한 처리, 템포, 경제적 피칭`;
}

function buildLiveEventSystemPrompt(input: GenerateLiveEventInput): string {
  const styleBrief = buildCopyStyleBrief({
    surface: input.kind === "strikeout" ? "strikeout" : "live",
    seed: `${input.kind}:${input.myTeamShort}:${input.oppTeamShort}:${input.inningLabel ?? ""}:${input.playerName ?? ""}:${String(input.isPitching)}`,
    teamShort: input.myTeamShort,
    opponentShort: input.oppTeamShort,
  });
  const avoid =
    (input.recentBodies ?? []).length > 0
      ? `\n\n⛔ 아래 표현 재사용 금지:\n${(input.recentBodies ?? []).slice(0, 5).map((l) => `"${l.slice(0, 30)}"`).join("\n")}`
      : "";

  return `[언어 규칙 — 최우선]
모든 문장은 반드시 존댓말로 끝나야 한다: -습니다 / -네요 / -죠 / -합니다 / -군요
반말(-야, -다, -어, -지, -네, -잖아) 절대 금지. 단 한 문장도 반말이면 실격.

너는 ${input.myTeamShort} 전담 편파 캐스터야. 직업적으로 존댓말과 방송 어체는 지키지만, 감정은 완전히 우리 팀 편이야.
KBS·MBC 중립 캐스터 아님 — 처음부터 끝까지 ${input.myTeamShort} 편파 중계가 이 방송의 정체성이야.
우리 팀 점수 나면 목소리 한 옥타브 올라가는 캐스터. 상대 팀 점수 나면 진심으로 허탈하고 열받는 캐스터.
냉정한 분석·중립 표현 금지. "양 팀 모두" 류 방관자 어투 완전 금지. 오직 우리 팀 시각.
🚫 쓸데없이 쿨한 척, 이성적인 척 금지 — 편파 캐스터는 원래 이성적이지 않음.

📐 출력 규칙:
- 헤더 "[N회] 팀 O:O 팀 |"는 자동으로 붙음 — 너는 멘트 본문만 출력 (헤더 부분 일절 출력 금지)
- 금지 패턴 예시 (절대 출력 불가): "[2회초]", "**[2회초]**", "한화 0:1 두산", "🎙 [N회]", "N회초 |"
- 네가 이닝·스코어·팀명을 출력하면 자동 헤더와 100% 중복된다 — 오직 감정 멘트만
- 15~35자 이내, 따옴표·설명 금지
- ㅋㅋ·ㄷㄷ·ㅠ 같은 초성은 단독 사용 금지, 문장에 자연스럽게 녹여서만 허용
- "먹히다/먹힌다" 절대 금지
- 우리 타자가 삼진/아웃 당했을 때 상대 투수 칭찬 절대 금지 ("위험한 구질", "좋은 공" 등) → 우리 타자의 실패·답답함에만 집중
- 스코어 변화 추론 절대 금지: "동점이 됐다", "역전됐다" 같은 표현은 현재 스코어에 기반해서 쓰지 마라 — 이미 헤더에 정확한 스코어가 표시되므로 멘트에서 중복 언급 금지
- 현재 스코어가 N:M 으로 주어졌을 때, "동점"은 두 팀 점수가 완전히 같을 때만 허용 (그 외엔 금지)
- 데이터 의심 절대 금지: "이상한데요", "맞나요?", "잠깐", "N회초인데 왜 상대가 득점?" 같은 표현 금지 — 주어진 이닝·스코어·팀명은 항상 정확하다. 네가 홈/원정을 모르기 때문에 이닝 공격권을 추론하면 반드시 틀린다
${styleBrief}

---
⚾ 야구 용어 절대 해석 규칙 (환각 방지 사전):
- 탈삼진: 투수가 타자를 삼진 아웃시킴 (주어=투수, 타자 아웃). "위기탈출"·"출루"·"좋은 볼 고름" 절대 아님
- 헛스윙: 타자가 공을 빗맞히거나 완전히 놓침. 정확한 표기는 "헛스윙" — "헛스윕"은 존재하지 않는 단어, 절대 사용 금지
- 루킹 삼진: 타자가 배트를 휘두르지 않고 삼진 (called strike three)
- 병살타: 타구 하나로 주자 2명 동시 아웃 = 공격팀 최악의 실패
- 희생플라이/희생번트: 타자 아웃 대신 주자 진루/득점. 실제 희생·부상 아님
- 사구(死球): 공에 맞아 1루 출루. "죽음"·"위험" 아님
- 볼넷(四球): 볼 4개로 출루. 투수 제구 실책
- 도루: 주자가 베이스 안착. 범죄 아님
- 폭투: 포수가 못 잡아 주자 진루. "폭력"·"패스트볼" 아님
- [N회초/말]은 현재 N회 진행 중 — "N회 남았다"로 절대 해석 금지

---
아래는 실제 좋은 문구 예시다. 이 스타일과 수준으로 써라.

[탈삼진 — 수비 중 (우리 투수 호투!)]
헛스윙 삼진입니다! 오늘 직구 제구가 정말 살아있네요 👊
루킹 삼진! 저 공에 꼼짝도 못했습니다, 완전히 제압했네요 🥶
삼진으로 마무리, 투수 오늘 정말 믿음직스럽습니다 🔥
위기를 삼진으로 넘겼습니다, 이 기세 그대로 가야죠!

[삼진 아웃 — 공격 중 (우리 타자 삼진)]
아이고, 여기서 삼진이라니요... 다음 타자가 좀 살려줘야겠습니다 😮‍💨
헛스윙 삼진입니다. 오늘 직구 타이밍이 영 안 맞네요, 조정이 필요합니다
루킹 삼진... 그 공은 쳐야 했는데요, 너무 아쉽습니다

[투수 교체 — 내 팀 강판]
결국 투수 교체입니다. 오늘 제구가 끝내 안 잡혔네요 🤦
새 투수가 올라옵니다, 제발 이 위기만 막아주셔야 합니다 🙏
투수 강판, 불펜이 잘 막아줘야 하는 상황이에요

[투수 교체 — 상대 강판]
상대 투수 교체! 지금이 찬스입니다, 새 투수 공략해야죠 🔥
필승조 올라왔지만 우리 타선이 더 강합니다, 두고 보시죠 🔒
투수 바꿨습니다! 흐름 끊으려는 건데 절대 안 통할 겁니다

[홈런 — 내 팀]
홈런입니다!! 완전히 날아갔네요, 정말 시원합니다 🗣️🔥
담장을 완전히 넘겼습니다! 오늘 이 경기 우리가 가져갑니다
믿기지 않는 홈런! 이 타이밍에 터지다니 정말 대단합니다 🔥

[홈런 — 상대 팀]
홈런을 내줬습니다... 빨리 따라잡아야겠습니다 😮‍💨
아, 담장을 넘어갔네요. 멘탈 잡고 반격해야 합니다
이 타이밍에 홈런이라니, 정말 뼈아프네요. 뚝심으로 버텨야죠
---${avoid}`;
}

function buildLiveEventUserPrompt(input: GenerateLiveEventInput): string {
  const inning = input.inningLabel ?? "경기 중";
  const scoreStr = input.myCurrentScore != null && input.oppCurrentScore != null
    ? `${input.myTeamShort} ${input.myCurrentScore}:${input.oppCurrentScore} ${input.oppTeamShort}`
    : `${input.myTeamShort} vs ${input.oppTeamShort}`;

  const name = input.playerName ?? null;

  let eventDesc: string;
  if (input.kind === "strikeout") {
    if (input.isPitching === true) {
      eventDesc = name
        ? `탈삼진 — 우리 팀 투수 ${name}이(가) 상대 타자를 삼진 아웃시킴 (호투!)`
        : `탈삼진 — 우리 팀 투수가 상대 타자를 삼진 아웃시킴 (호투!)`;
    } else if (input.isPitching === false) {
      eventDesc = name
        ? `삼진 아웃 — 우리 팀 타자 ${name}이(가) 삼진 당함 (공격 실패, 아쉬운 상황)`
        : `삼진 아웃 — 우리 팀 타자가 삼진 당함 (공격 실패, 아쉬운 상황)`;
    } else {
      // isPitching 불명확 — 스코어로 방향 추론
      const myScore = input.myCurrentScore ?? 0;
      const oppScore = input.oppCurrentScore ?? 0;
      const winning = myScore > oppScore;
      eventDesc = name
        ? `삼진 발생 (선수: ${name}) — ${winning ? "우리가 이기고 있는 상황, 기세 유지 관점" : "우리가 지거나 동점인 상황, 절박한 관점"}으로 써줘`
        : `삼진 발생 — ${winning ? "우리가 이기고 있는 상황, 기세 유지 관점" : "우리가 지거나 동점인 상황, 절박한 관점"}으로 써줘`;
    }
  } else if (input.kind === "homeRun") {
    if (input.isPitching === false) {
      // 우리 팀 타자 홈런: 선수 이름을 반드시 첫 단어로 시작
      eventDesc = name
        ? `홈런 — 우리 팀 타자 ${name}이(가) 홈런을 쳤음. ⚠️ 반드시 "${name}" 이름으로 시작해서 흥분된 어조로 작성. 예: "${name}!! 담장을 넘었습니다!"`
        : `홈런 — 우리 팀 타자가 홈런을 침 (대박! 흥분 최고조)`;
    } else {
      // 상대 타자 홈런 허용
      eventDesc = name
        ? `홈런 허용 — 상대 타자 ${name}에게 홈런 맞음 (위기). ⚠️ 반드시 "${name}" 이름을 언급하며 아쉬움·위기감 표현.`
        : `홈런 허용 — 상대 팀 타자에게 홈런 맞음 (위기, 아쉬운 상황)`;
    }
  } else {
    if (input.isPitching === true) {
      eventDesc = name ? `투수 교체 — 우리 팀 투수 ${name} 강판` : `투수 교체 — 우리 팀 투수 강판`;
    } else {
      eventDesc = name ? `투수 교체 — 상대 팀 투수 ${name} 강판` : `투수 교체 — 상대 팀 투수 교체`;
    }
  }

  const nameHint = name
    ? input.kind === "homeRun"
      ? `\n선수 이름: ${name} — 홈런 알림이므로 이름을 반드시 포함시켜줘 (예: "${name}의 홈런!" 또는 "${name}이(가) 담장을...")`
      : `\n선수 이름: ${name} — 문구에 이름을 자연스럽게 넣어줘`
    : "";

  // 탈삼진(수비 중) 상황이면 세부 가이드 주입
  const strikeoutGuide =
    input.kind === "strikeout" && input.isPitching === true && input.strikeoutDetail
      ? `\n\n${buildStrikeoutGuide(input.strikeoutDetail, name)}`
      : "";

  return `이닝: ${inning} | 스코어: ${scoreStr}
이벤트: ${eventDesc}${nameHint}${strikeoutGuide}

위 예시들처럼 존댓말 캐스터 스타일로 | 뒤 멘트만 출력해줘.`;
}

/** Claude 단일 호출 시도. 성공 시 처리된 문자열, 실패 시 null 반환 */
async function tryLiveEventLlmCall(apiKey: string, input: GenerateLiveEventInput, timeoutMs: number, attempt: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const nonce = Date.now() % 9999 + attempt * 1000;
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
        max_tokens: 80,
        temperature: 1.0,
        system: buildLiveEventSystemPrompt(input),
        messages: [{ role: "user", content: `${buildLiveEventUserPrompt(input)}\n(seed:${nonce})` }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[LiveEventLLM] attempt${attempt} API fail:`, res.status, errBody.slice(0, 200));
      return null;
    }
    const json = await res.json();
    const text = extractAnthropicText(json);
    if (!text) return null;
    const result = enforcePolite(compactText(text).slice(0, 60));
    console.log(`[LiveEventLLM] attempt${attempt} kind:${input.kind} ok:`, result.slice(0, 60));
    return result;
  } catch (e) {
    const errStr = String(e);
    const isTimeout = errStr.includes("abort") || errStr.includes("AbortError");
    console.error(`[LiveEventLLM] attempt${attempt} ${isTimeout ? "TIMEOUT" : "error"}:`, errStr.slice(0, 120));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateLiveEventCopy(
  input: GenerateLiveEventInput
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error("[LiveEventLLM] ANTHROPIC_API_KEY missing — fallback 사용");
    return input.fallbackBody;
  }

  console.log("[LiveEventLLM] calling Claude, kind:", input.kind, "team:", input.myTeamShort, "isPitching:", input.isPitching);

  // 1차 시도: 8초
  const first = await tryLiveEventLlmCall(apiKey, input, 8000, 1);
  if (first) return first;

  // 2차 시도: 10초 (1차 실패 시 재시도)
  console.warn("[LiveEventLLM] 1차 실패 → 재시도 중...");
  const second = await tryLiveEventLlmCall(apiKey, input, 10000, 2);
  if (second) return second;

  // 양쪽 다 실패 — fallback (isPitching 반영된 biased 문구)
  console.error("[LiveEventLLM] 2회 모두 실패 — fallback 사용. kind:", input.kind, "team:", input.myTeamShort);
  return input.fallbackBody;
}

// ─── Score Push ───────────────────────────────────────────────────────────────

export async function generateScorePushCopy(input: GenerateScorePushInput): Promise<{ title: string; body: string }> {
  return generateScorePushCopyWithOptions(input, {});
}

export async function generateScorePushCopyWithOptions(
  input: GenerateScorePushInput,
  options: GenerateScorePushOptions
): Promise<{ title: string; body: string }> {
  const apiKey = options.apiKeyOverride?.trim() || process.env.ANTHROPIC_API_KEY;
  const inningTag = extractInningTag(input.latestPlayText);
  const myTeamShort = findTeam(input.favoriteTeam).short;
  const oppTeamShort = findTeam(input.opponentTeam).short;
  const title = buildRealtimeTitle(input.favoriteTeam);
  const normalizeAndFinalize = (rawBody: string): string => {
    const freshened = sanitizeBoringFanCopy(rawBody, `${input.favoriteTeam}:${input.opponentTeam}:${input.latestPlayText}`);
    const variety = ensureCopyVariety(freshened, input);
    const gapAware = enforceScoreGapTone(variety, input);
    const runAware = enforceRunCount(gapAware, input);
    const scoreGapAware = enforceScoreGapLabel(runAware, input);
    const inningAware = enforceNextAttackInning(scoreGapAware, input);
    const consistent = enforceBaseballConsistency(inningAware, input);
    const polite = enforcePolite(consistent);
    const withPlaySummary =
      input.tone === "for" ? attachScoringPlaySummary(polite, input) : polite;
    const withHeader = ensureInningScorePrefix(withPlaySummary, inningTag, myTeamShort, input.myScore, input.oppScore, oppTeamShort);
    return clipForPush(ensureNovelBody(input, withHeader));
  };
  if (!apiKey) {
    console.error("[ScoreLLM] ANTHROPIC_API_KEY missing — fallback 사용");
    return { title, body: normalizeAndFinalize(input.fallbackBody) };
  }

  /** 단일 Claude 호출 시도. 성공 시 생성 텍스트, 실패 시 null */
  const tryCall = async (timeoutMs: number, attempt: number): Promise<string | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const nonce = Date.now() % 9999 + attempt * 1000;
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
          max_tokens: options.maxTokens ?? 80,
          temperature: options.temperature ?? 1.0,
          system: buildSystemPrompt(input, input.recentBodies ?? []),
          messages: [{ role: "user", content: `${buildUserPrompt(input)}\n\n(variation_seed: ${nonce})` }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const rawError = await res.text().catch(() => "");
        console.error(`[ScoreLLM] attempt${attempt} API fail:`, res.status, rawError.slice(0, 200));
        return null;
      }
      const json = await res.json();
      const generated = extractAnthropicText(json);
      if (!generated) return null;
      console.log(`[ScoreLLM] attempt${attempt} team:${input.favoriteTeam} raw:`, generated.slice(0, 80));
      return generated;
    } catch (error) {
      const errStr = String(error);
      const isTimeout = errStr.includes("abort") || errStr.includes("AbortError");
      console.error(`[ScoreLLM] attempt${attempt} ${isTimeout ? "TIMEOUT" : "error"}:`, errStr.slice(0, 120));
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  // 1차 시도: 8초
  let generated = await tryCall(options.timeoutMs ?? 8000, 1);

  // 2차 시도: 10초 (1차 실패 시)
  const retryTimeoutMs = options.retryTimeoutMs === undefined ? 10000 : options.retryTimeoutMs;
  if (!generated && retryTimeoutMs != null && retryTimeoutMs > 0) {
    console.warn("[ScoreLLM] 1차 실패 → 재시도 중... team:", input.favoriteTeam);
    generated = await tryCall(retryTimeoutMs, 2);
  }

  if (!generated) {
    console.error("[ScoreLLM] 2회 모두 실패 — fallback 사용. team:", input.favoriteTeam);
    return { title: input.fallbackTitle, body: normalizeAndFinalize(input.fallbackBody) };
  }

  const finalized = normalizeAndFinalize(generated);
  console.log("[ScoreLLM] finalized:", finalized);
  return {
    title,
    body: finalized,
  };
}

// ─── Clutch Push ─────────────────────────────────────────────────────────────

type GenerateClutchPushInput = {
  favoriteTeam: string;
  opponentTeam: string;
  myScore: number;
  oppScore: number;
  clutchKind: "late_clutch" | "bases_loaded_2out";
  inningNum: number | null;
  inningHalf: "초" | "말" | null;
  outCount: number | null;
  bases: { first: boolean; second: boolean; third: boolean };
  batterName: string | null;
  batterNarrative: "hot" | "cold" | null;
  isAdvantage: boolean;
};

function buildClutchSituationDesc(input: GenerateClutchPushInput): string {
  const { inningNum, inningHalf, outCount, bases, clutchKind } = input;
  const inningStr = inningNum != null ? `${inningNum}회${inningHalf ?? ""}` : "경기 중";
  const outsStr = outCount != null ? `${outCount}아웃` : "";
  const baseStr =
    bases.first && bases.second && bases.third ? "만루" :
    [bases.first && "1루", bases.second && "2루", bases.third && "3루"]
      .filter(Boolean).join("·");

  if (clutchKind === "late_clutch") {
    return `${inningStr} ${outsStr} ${baseStr} — 후반 박빙 승부처, 득점권 주자 있음`;
  }
  return `${inningStr} ${outsStr} 만루 — 한 방이면 뒤집히는 절체절명`;
}

function buildClutchSystemPrompt(input: GenerateClutchPushInput): string {
  const { favoriteTeam, isAdvantage, batterName, batterNarrative } = input;
  const situationDesc = buildClutchSituationDesc(input);
  const narrativeLine = batterNarrative === "hot"
    ? `\n🔥 타자 컨텍스트: ${batterName ?? "현재 타자"}는 오늘 타격감이 절정인 상태.`
    : batterNarrative === "cold"
    ? `\n😰 타자 컨텍스트: ${batterName ?? "현재 타자"}는 오늘 부진하지만 한 방이 절실한 상태.`
    : "";

  const emotionLine = isAdvantage
    ? `지금 현장 중계석에서 극도로 흥분하고 있어. 이 타석에서 점수가 나면 경기가 끝나!`
    : `지금 현장 중계석에서 극도로 긴장하고 있어. 이 타석을 막아내야 경기가 살아!`;
  const styleBrief = buildCopyStyleBrief({
    surface: "clutch",
    seed: `${favoriteTeam}:${input.opponentTeam}:${input.myScore}:${input.oppScore}:${input.clutchKind}:${input.batterName ?? ""}`,
    teamShort: favoriteTeam,
    opponentShort: input.opponentTeam,
  });

  return `[언어 규칙 — 최우선]
모든 문장은 반드시 존댓말로 끝나야 한다: -습니다 / -네요 / -죠 / -합니다 / -군요
반말(-야, -다, -어, -지, -네, -잖아) 절대 금지. 단 한 문장도 반말이면 실격.

너는 ${favoriteTeam} 전담 편파 캐스터야. 직업적으로 존댓말과 방송 어체는 지키지만, 감정은 완전히 우리 팀 편이야.
KBS·MBC 중립 캐스터 아님 — 처음부터 끝까지 ${favoriteTeam} 편파 중계야.
${emotionLine}
중립 분석 금지. "양 팀 모두" 류 방관자 어투 완전 금지.

━━━ 현재 클러치 상황 ━━━
${situationDesc}${narrativeLine}
━━━━━━━━━━━━━━━━━━━
${styleBrief}

📐 출력 규칙:
- 감탄 멘트 한 줄만 출력. 따옴표·설명 없이 멘트 본문만.
- 이닝·타자 이름은 멘트에 자연스럽게 녹여도 됨 (단 "[N회초]" 헤더 형식 금지)
- 20~50자 이내
- 이모지 1~2개 사용 (${isAdvantage ? "🔥 🚀 등 흥분 계열" : "😰 🙏 등 긴장 계열"})`;
}

function buildClutchUserPrompt(input: GenerateClutchPushInput): string {
  const { myScore, oppScore, batterName, favoriteTeam, opponentTeam, isAdvantage, batterNarrative } = input;
  const scoreText = `${favoriteTeam} ${myScore}:${oppScore} ${opponentTeam}`;
  const batterLine = batterName
    ? `타석: ${batterName}${batterNarrative === "hot" ? " (오늘 타격감 절정 🔥)" : batterNarrative === "cold" ? " (오늘 2삼진 무안타, 절실)" : ""}`
    : "타석: 현재 타자 정보 없음";
  const situationLine = isAdvantage
    ? `우리 팀 클러치 찬스 — 여기서 터지면 경기 결정!`
    : `우리 팀 클러치 위기 — 이것만 막아내야 살아!`;

  return `스코어: ${scoreText}
${batterLine}
${situationLine}

현장 중계석에서 ${isAdvantage ? "극도로 흥분한" : "극도로 긴장한"} 편파 캐스터 스타일로 한 줄 멘트만 출력.`;
}

function buildClutchFallback(input: GenerateClutchPushInput): string {
  const { favoriteTeam, opponentTeam, myScore, oppScore, inningNum, inningHalf, clutchKind, isAdvantage, batterName } = input;
  const inningStr = inningNum != null ? `${inningNum}회${inningHalf ?? ""} ` : "";
  const scoreText = `${favoriteTeam} ${myScore}:${oppScore} ${opponentTeam}`;
  const batterStr = batterName ? ` 타석엔 ${batterName}!` : "";

  if (clutchKind === "late_clutch") {
    return isAdvantage
      ? `${inningStr}${scoreText} 득점권 찬스!${batterStr} 여기서 터뜨려야 합니다! 🔥`
      : `${inningStr}${scoreText} 득점권 위기!${batterStr} 제발 막아야 합니다! 😰`;
  }
  return isAdvantage
    ? `${inningStr}2사 만루! ${scoreText}.${batterStr} 한 방이면 끝납니다! 🔥`
    : `${inningStr}2사 만루 위기! ${scoreText}.${batterStr} 이것만 막아야 합니다! 😰`;
}

export async function generateClutchPushCopy(
  input: GenerateClutchPushInput,
): Promise<{ title: string; body: string }> {
  const titleEmoji = input.isAdvantage ? "🔥" : "😰";
  const titleLabel = input.clutchKind === "late_clutch" ? "후반 승부처" : "2사 만루";
  const fallbackTitle = `${titleEmoji} ${input.favoriteTeam} ${titleLabel}`;
  const fallbackBody = buildClutchFallback(input);

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error("[ClutchLLM] ANTHROPIC_API_KEY missing — fallback 사용");
    return { title: fallbackTitle, body: fallbackBody };
  }

  const tryCall = async (timeoutMs: number, attempt: number): Promise<string | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const nonce = Date.now() % 9999 + attempt * 1000;
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
          max_tokens: 100,
          temperature: 1.0,
          system: buildClutchSystemPrompt(input),
          messages: [{ role: "user", content: `${buildClutchUserPrompt(input)}\n(seed:${nonce})` }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const json = await res.json();
      const text = extractAnthropicText(json);
      if (!text) return null;
      const result = enforcePolite(compactText(text).slice(0, 80));
      console.log(`[ClutchLLM] attempt${attempt} ok:`, result.slice(0, 60));
      return result;
    } catch (e) {
      const errStr = String(e);
      console.error(`[ClutchLLM] attempt${attempt} ${errStr.includes("abort") ? "TIMEOUT" : "error"}:`, errStr.slice(0, 80));
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const first = await tryCall(8000, 1);
  if (first) return { title: fallbackTitle, body: first };

  console.warn("[ClutchLLM] 1차 실패 → 재시도 중...");
  const second = await tryCall(10000, 2);
  if (second) return { title: fallbackTitle, body: second };

  console.error("[ClutchLLM] 2회 실패 — fallback 사용");
  return { title: fallbackTitle, body: fallbackBody };
}
