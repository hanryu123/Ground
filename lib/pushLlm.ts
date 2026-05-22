import { findTeam } from "@/lib/teams";

type GenerateScorePushInput = {
  favoriteTeam: string;
  opponentTeam: string;
  myScore: number;
  oppScore: number;
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
};

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5";

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clipForPush(text: string): string {
  const compact = compactText(text);
  if (compact.length <= 65) return compact;
  return `${compact.slice(0, 63)}..`;
}

function resolveScoreGap(input: GenerateScorePushInput): number {
  return Math.abs(input.myScore - input.oppScore);
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
    return overlap >= 0.80;
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

  // Claude가 이닝 태그를 직접 붙였을 경우 제거 (스코어 헤더를 항상 정확하게 붙이기 위해)
  compact = compact.replace(/^\[[^\]]+\]\s*/, "");

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
  const cleaned = compactText(latestPlayText)
    .replace(/\d{1,2}회(?:초|말)?/g, "")
    .replace(/스코어\s*변동[:：]?\s*/g, "")
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
  const hook = extractEventHook(input.latestPlayText);
  const scoreText = `${my} ${input.myScore}:${input.oppScore} ${opp}`;
  const seed = `${input.favoriteTeam}:${input.myScore}:${input.oppScore}:${input.latestPlayText}`;
  const leading = input.myScore > input.oppScore;
  const trailing = input.myScore < input.oppScore;
  if (leading) {
    return pickBySeed(
      [
        `${scoreText}. 오늘 흐름 완전 우리 쪽이다🔥`,
        `${scoreText}. 쐐기 한 방 더 박자, 지금이다🚀`,
        `${scoreText}${hook ? ` (${hook})` : ""} 분위기 먹었다.`,
      ],
      seed
    );
  }
  if (trailing) {
    return pickBySeed(
      [
        `${scoreText}. 아직 안 끝났다, 바로 뒤집는다.`,
        `${scoreText}${hook ? ` (${hook})` : ""} 다음 이닝에 갚자.`,
        `${scoreText}. 흐름 잠깐 뺏겼다, 지금부터 반격.`,
      ],
      seed
    );
  }
  return pickBySeed(
    [
      `${scoreText}. 균형 맞췄다, 이제 역전각 본다.`,
      `${scoreText}${hook ? ` (${hook})` : ""} 이 판 우리가 가져온다.`,
      `${scoreText}. 동점이다, 여기서 끝장 보자.`,
    ],
    seed
  );
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

  switch (state) {
    case "탐색전":
      return `🎙️ [탐색전 — 초반 기싸움]
캐스터 상태: 차분하고 분석적. 경기 전체를 조망하는 시선.
톤: "아직 경기 초반입니다. 양 팀 선발들의 기싸움이 치열하네요." 류의 기대감.
키워드: 기선제압, 팽팽한, 예열, 첫 단추`;

    case "피말리는승부":
      return `💓 [피말리는 승부 — 박빙 혈전]
캐스터 상태: 극도의 긴장. 손에 땀을 쥐고 매 구마다 의미 부여.
톤: "피가 마르는 승부입니다! 한 치 앞을 알 수 없어요! 숨을 참게 됩니다!" 류.
키워드: 혈투, 살얼음판, 숨 막히는, 한 끗 차이, 쫄깃한
⚠️ ${tone === "for" ? "방금 우리가 앞서거나 동점 → 흥분+안도 섞인 텐션 최고조" : "방금 상대가 따라오거나 역전 → 절망+긴장 극대화"}`;

    case "일반적전개":
      return `📊 [일반적 전개 — 노련한 흐름 해설]
캐스터 상태: ${gap}점 차. 흐름을 짚어주는 노련함.
톤: ${isWinning
        ? `"점수 차를 벌렸습니다. 이 기세를 유지해야 합니다." 류의 자신감 있는 굳히기 촉구.`
        : `"점수 차가 조금 벌어집니다. 여기서 반격의 불씨를 살려야 하는데요." 류의 추격 촉구.`}
키워드: ${isWinning ? "달아나는, 흐름을 타는, 굳히기" : "추격의 불씨, 반격, 따라잡아야"}`;

    case "광란샤우팅":
      return `🔥 [광란의 샤우팅 — 이성 붕괴]
캐스터 상태: ${gap}점 차 후반. 완전히 이성을 잃음. 텍스트에서 핏대가 서는 것이 느껴져야 함.
톤: ${isWinning
        ? `"완전히 무너뜨립니다!!! 경기장 지붕이 날아갑니다!! 사실상 쐐기포!!!" — 감탄사 폭발, 이모지(🔥🚀) 적극 사용`
        : `"저도 이제 모르겠습니다... 자비가 없네요!" — 분노·체념·멘탈 붕괴`}
키워드: ${isWinning ? "쐐기, 폭발, 자비 없는, 축제, 확인사살" : "멘탈 붕괴, 자비 없음, 포기 직전, 체념"}
⚠️ 존댓말이 흔들려도 됨. 감탄사(-요! -습니다!!!)가 연속으로 나와도 됨.`;

    case "역전":
      return `🚨 [역전 — 기적 발생]
캐스터 상태: 기적을 목격한 경악. 이닝·점수차 무관하고 무조건 최고 텐션.
톤: ${tone === "for"
        ? `"이걸 뒤집나요!! 기적입니다!! 대역전극!! 경기장이 발칵 뒤집혔습니다!!"`
        : `"역전당했습니다... 이런 일이... 믿기지 않습니다 정말로."`}
키워드: ${tone === "for" ? "뒤집다, 기적, 극장, 대폭발, 소름" : "충격, 망연자실, 믿기지 않는, 반전"}
⚠️ 반드시 역전 상황임을 명시적으로 언급할 것.`;
  }
}

function buildSystemPrompt(input: GenerateScorePushInput, recentBodies: string[]): string {
  const favoriteTeam = findTeam(input.favoriteTeam).short;
  const phase = resolveInningPhase(input.latestPlayText);
  const emotionState = resolveEmotionState(input, phase);
  const emotionGuide = buildEmotionGuide(emotionState, input, favoriteTeam);

  const avoid =
    recentBodies.length > 0
      ? `\n\n⛔ 아래 표현과 비슷한 문구는 절대 재사용 금지:\n${recentBodies
          .slice(0, 5)
          .map((line) => `"${clipForPush(line)}"`)
          .join("\n")}`
      : "";

  const emojiRule = emotionState === "광란샤우팅" || emotionState === "역전"
    ? `- 이모지 1~3개 적극 사용 (🔥 😱 🚀 등)`
    : `- 이모지 0~2개만`;

  return `너는 KBO 전문 야구 캐스터야. 목소리는 프로 중계석이지만 속마음은 ${favoriteTeam} 극성팬이야.
해설은 기본적으로 존댓말(-습니다, -네요, -죠)로 하되, 아래 [현재 감정 상태]에 따라 강도가 달라져.
점수차가 크고 후반이면 존댓말이 흔들리고 감탄사가 폭발해도 됨.

🚫 절대 금지:
- "됐네", "가는군" 같은 건조한 방관자 어투 금지
- 득점 상황에서 "아쉽다", "힘내자" 금지 / 실점 상황에서 "좋아!", "신난다" 금지
- "N회 남았으니까" 금지 — [N회초/말]은 현재 N회 진행 중이라는 뜻
- "먹히다/먹힌다" 금지 — 실점이면 "내줬습니다/털렸습니다", 득점이면 "터졌습니다/뽑아냈습니다"
- 우리 타자 삼진 시 상대 투수 칭찬 금지 → 우리 타자 실패·답답함에만 집중

⚾ 야구 용어 사전 (환각 방지):
- 탈삼진: 투수가 타자 삼진 아웃시킴 (투수 호투). "위기탈출"·"출루" 아님
- 병살타: 타구 하나로 주자 2명 아웃 = 공격팀 최악의 실패
- 희생플라이/번트: 타자 아웃 대신 주자 진루·득점 (전략적 선택)
- 사구(死球): 공에 맞아 출루. "죽음" 아님 / 볼넷(四球): 볼 4개로 출루
- 도루: 빠른 발로 다음 베이스 안착. 범죄 아님
- 폭투: 포수가 못 잡아 주자 진루. "폭력"·"패스트볼" 아님

━━━ 현재 감정 상태 ━━━
${emotionGuide}
━━━━━━━━━━━━━━━━━━━

📐 출력 규칙:
- 감탄 멘트 한 줄만 출력. 이닝 태그·스코어·팀명은 앞에 자동으로 붙음 — 다시 쓰지 마
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
  const scoredTeam = resolvedTone === "for"
    ? `${favorite.short} 득점 🎉`
    : `${opponent.short} 득점 (실점)`;
  const statusLabel = input.myScore > input.oppScore ? "리드 중" : input.myScore < input.oppScore ? "뒤지는 중" : "동점";
  return `내 팀: ${favorite.short} (상대: ${opponent.short})
방금 득점: ${scoredTeam}
현재 스코어: ${favorite.short} ${input.myScore} : ${input.oppScore} ${opponent.short}
이닝: [${inningTag}] (${phaseLabel})
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
  recentBodies?: string[];
  fallbackBody: string;
};

function buildLiveEventSystemPrompt(input: GenerateLiveEventInput): string {
  const avoid =
    (input.recentBodies ?? []).length > 0
      ? `\n\n⛔ 아래 표현 재사용 금지:\n${(input.recentBodies ?? []).slice(0, 5).map((l) => `"${l.slice(0, 30)}"`).join("\n")}`
      : "";

  return `너는 KBO 전문 야구 캐스터야. 중계석에 앉아 있지만 속마음은 ${input.myTeamShort} 극성팬이야.
해설은 반드시 존댓말(-습니다, -네요, -죠)로 하되, ${input.myTeamShort} 경기면 티 나게 편파적으로 해줘.
우리 팀 잘하면 흥분하고, 못하면 속 끓는 감정이 그대로 묻어나야 해.

📐 출력 규칙:
- 헤더 "[N회] 팀 O:O 팀 |"는 자동으로 붙음 — | 뒤 멘트만 한 줄 출력
- 15~35자 이내, 반드시 존댓말, 따옴표·설명·이닝·스코어 재출력 금지
- ㅋㅋ·ㄷㄷ·ㅠ 같은 초성은 단독 사용 금지, 문장에 자연스럽게 녹여서만 허용
- "먹히다/먹힌다" 절대 금지
- 우리 타자가 삼진/아웃 당했을 때 상대 투수 칭찬 절대 금지 ("위험한 구질", "좋은 공" 등) → 우리 타자의 실패·답답함에만 집중
- 우리 타자가 삼진/아웃 당했을 때 상대 투수 칭찬 절대 금지 ("위험한 구질", "좋은 공" 등) → 우리 타자의 실패/답답함에 집중할 것

---
⚾ 야구 용어 절대 해석 규칙 (환각 방지 사전):
- 탈삼진: 투수가 타자를 삼진 아웃시킴 (주어=투수, 타자 아웃). "위기탈출"·"출루"·"좋은 볼 고름" 절대 아님
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
      eventDesc = name ? `삼진 발생 (선수: ${name})` : `삼진 발생`;
    }
  } else if (input.kind === "homeRun") {
    if (input.isPitching === false) {
      eventDesc = name ? `홈런 — 우리 팀 타자 ${name}이(가) 홈런 침 (대박!)` : `홈런 — 우리 팀 타자가 홈런 침 (대박!)`;
    } else {
      eventDesc = name ? `홈런 허용 — 상대 타자 ${name}에게 홈런 맞음 (위기)` : `홈런 허용 — 상대 팀 타자에게 홈런 맞음 (위기)`;
    }
  } else {
    if (input.isPitching === true) {
      eventDesc = name ? `투수 교체 — 우리 팀 투수 ${name} 강판` : `투수 교체 — 우리 팀 투수 강판`;
    } else {
      eventDesc = name ? `투수 교체 — 상대 팀 투수 ${name} 강판` : `투수 교체 — 상대 팀 투수 교체`;
    }
  }

  const nameHint = name
    ? `\n선수 이름: ${name} — 문구에 이름을 자연스럽게 넣어줘 (예: "${name} 오늘 폼 미쳤네")`
    : "";

  return `이닝: ${inning} | 스코어: ${scoreStr}
이벤트: ${eventDesc}${nameHint}

위 예시들처럼 단톡방 스타일로 | 뒤 멘트만 출력해줘.`;
}

export async function generateLiveEventCopy(
  input: GenerateLiveEventInput
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error("[LiveEventLLM] ANTHROPIC_API_KEY missing");
    return input.fallbackBody;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const nonce2 = Date.now() % 9999;
  console.log("[LiveEventLLM] calling Claude, kind:", input.kind, "keyPrefix:", apiKey.slice(0, 12));
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
        messages: [{ role: "user", content: `${buildLiveEventUserPrompt(input)}\n(seed:${nonce2})` }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[LiveEventLLM] API fail:", res.status, errBody.slice(0, 300));
      return input.fallbackBody;
    }
    const json = await res.json();
    const text = extractAnthropicText(json);
    console.log("[LiveEventLLM] kind:", input.kind, "raw:", text?.slice(0, 80) ?? "null");
    return text ? compactText(text).slice(0, 60) : input.fallbackBody;
  } catch (e) {
    const errStr = String(e);
    console.error("[LiveEventLLM] exception:", errStr.slice(0, 200));
    if (errStr.includes("abort") || errStr.includes("AbortError")) {
      console.error("[LiveEventLLM] TIMEOUT after 12s — Anthropic too slow or network issue");
    }
    return input.fallbackBody;
  } finally {
    clearTimeout(timeout);
  }
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
  const normalizeAndFinalize = (rawBody: string): string => {
    const variety = ensureCopyVariety(rawBody, input);
    const gapAware = enforceScoreGapTone(variety, input);
    const consistent = enforceBaseballConsistency(gapAware, input);
    const withHeader = ensureInningScorePrefix(consistent, inningTag, myTeamShort, input.myScore, input.oppScore, oppTeamShort);
    return clipForPush(ensureNovelBody(input, withHeader));
  };
  if (!apiKey) {
    return {
      title: input.fallbackTitle,
      body: normalizeAndFinalize(input.fallbackBody),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
  // 매번 다른 문구 유도를 위해 타임스탬프 기반 노이즈를 유저 프롬프트에 추가
  const nonce = Date.now() % 9999;
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
        messages: [
          {
            role: "user",
            content: `${buildUserPrompt(input)}\n\n(variation_seed: ${nonce})`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const rawError = await res.text().catch(() => "");
      console.error("[Claude API Fail]: ", {
        status: res.status,
        body: rawError.slice(0, 200),
      });
      return {
        title: input.fallbackTitle,
        body: normalizeAndFinalize(input.fallbackBody),
      };
    }
    const json = await res.json();
    const generated = extractAnthropicText(json);
    console.log("[ScoreLLM] latestPlayText:", input.latestPlayText?.slice(0, 80));
    console.log("[ScoreLLM] claude_raw:", generated?.slice(0, 80) ?? "null");
    if (!generated) {
      return {
        title: input.fallbackTitle,
        body: normalizeAndFinalize(input.fallbackBody),
      };
    }
    const finalized = normalizeAndFinalize(generated);
    console.log("[ScoreLLM] finalized:", finalized);
    const team = findTeam(input.favoriteTeam);
    return {
      title: `⚾️ ${team.short} 실시간`,
      body: finalized,
    };
  } catch (error) {
    const errStr = String(error);
    console.error("[ScoreLLM] exception:", errStr.slice(0, 200));
    if (errStr.includes("abort") || errStr.includes("AbortError")) {
      console.error("[ScoreLLM] TIMEOUT after 12s — Anthropic too slow or network issue");
    }
    return {
      title: input.fallbackTitle,
      body: normalizeAndFinalize(input.fallbackBody),
    };
  } finally {
    clearTimeout(timeout);
  }
}
