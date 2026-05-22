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
  const compact = compactText(text);
  // 이미 [N회] 태그가 있으면 그대로 반환 (fallback 빌더 등이 이미 스코어 포함한 경우)
  if (/^\[[^\]]+\]/.test(compact)) return compact;
  if (compact.includes("[경기종료]")) return compact;
  if (inningTag === "경기중" || !inningTag) return compact;

  // Claude가 이미 "팀 X:Y 팀 |" 형태로 스코어를 포함했으면 이닝 태그만 앞에 추가
  const scoreHeaderPattern = /^[가-힣A-Za-z]+\s+\d+:\d+\s+[가-힣A-Za-z]+\s*\|/;
  if (scoreHeaderPattern.test(compact)) {
    return `[${inningTag}] ${compact}`;
  }

  // 스코어 헤더 추가
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

  if (tier === "garbage") {
    // 대참사 구간에서 "아직 안 끝났다" 류를 강제 차단한다.
    if (
      /아직|역전|할 수 있다|끝났다\s*아님|쫓아간다|해보자|집중하자/.test(normalized) ||
      normalized.length > 40
    ) {
      const my = findTeam(input.favoriteTeam).short;
      const opp = findTeam(input.opponentTeam).short;
      const candidates = [
        `${my} ${input.myScore}:${input.oppScore} ${opp}... 하.`,
        `${input.myScore}:${input.oppScore} ㅋㅋ 오늘은 여기까지.`,
        `........ 티비 껐다. 내일 보자.`,
        `오늘 야구 안 합니다. 다들 귀가.`,
      ] as const;
      return candidates[(input.myScore + input.oppScore) % candidates.length];
    }
    return normalized;
  }

  if (tier === "danger") {
    // 3~5점 차에서는 분노/짜증 텐션을 우선한다.
    if (/아직|침착|할 수 있다/.test(normalized)) {
      return normalized
        .replace(/아직/g, "")
        .replace(/침착/g, "")
        .replace(/할 수 있다/g, "빨리 정신 차려야 한다")
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

function buildSystemPrompt(input: GenerateScorePushInput, recentBodies: string[]): string {
  const favoriteTeam = findTeam(input.favoriteTeam).short;
  const gap = resolveScoreGap(input);
  const tier = resolveScoreGapTier(input);
  const trailing = input.myScore < input.oppScore;
  const leading = input.myScore > input.oppScore;
  const phase = resolveInningPhase(input.latestPlayText);

  const avoid =
    recentBodies.length > 0
      ? `\n\n⛔ 아래 표현과 비슷한 문구는 절대 재사용 금지:\n${recentBodies
          .slice(0, 5)
          .map((line) => `"${clipForPush(line)}"`)
          .join("\n")}`
      : "";

  const phaseGuide = phase === "early"
    ? `⏰ 지금은 경기 초반(1~3회) — 탐색전·기선제압 국면이야.
  • 득점 시: "기선제압 성공! 타격감 날카롭다" 류의 가벼운 흥분
  • 실점 시: "초반이라 아직 여유 있다, 힘내자" 류의 격려`
    : phase === "mid"
    ? `⏰ 지금은 경기 중반(4~6회) — 허리 싸움·추격/굳히기 국면이야.
  • 동점·추격: "기어코 따라잡는다, 승부는 이제부터" 류의 텐션 상승
  • 추가 득점: "추가점 진짜 꿀맛, 흐름 완전히 가져옴" 류의 자신감`
    : `⏰ 지금은 경기 후반(7회~연장) — 도파민 폭발·클러치 국면이야.
  • 역전/극적 득점: "미쳤다 이걸 뒤집네 ㅋㅋㅋ" 류의 폭발적 환호
  • 쐐기점: "사실상 확인사살 ㅋㅋㅋ 마무리만 잘 하면 끝" 류
  • 실점 위기: "숨 막힌다 ㄷㄷ 여기서 막느냐 못 막느냐 갈림길" 류`;

  const resolvedTone = input.tone ?? (input.myScore >= input.oppScore ? "for" : "against");
  const gapGuide = trailing
    ? tier === "garbage"
      ? `\n⚠️ 6점 이상 지고 있음 → 해탈/허탈/냉소 톤. "아직 안 끝났다" 절대 금지. 짧게.`
      : tier === "danger"
      ? `\n⚠️ 3~5점 지고 있음 → 짜증/분노/빨리 따라잡자 톤.`
      : `\n⚠️ 1~2점 지고 있음 → 간절함/초조함/피 말린다 톤.`
    : leading
    ? `\n✅ 우리 팀이 앞서고 있음 → 자신감/흥분/굳혀라 톤.`
    : resolvedTone === "for"
    ? `\n➡️ 동점 상황 (우리가 따라잡음) → "야!! 동점!!", "기어코 따라잡았다 ㅋㅋ" 류의 흥분/환호 톤.`
    : `\n➡️ 동점 상황 (상대가 따라잡음) → "아 동점이라니", "여기서 잡았어야 했는데 ㅠ" 류의 불안/답답한 톤.`;

  return `너는 KBO를 10년 넘게 챙겨온 30대 ${favoriteTeam} 찐팬이야.
친한 친구들과 야구 단톡방에서 떠드는 것처럼 짧고, 타격감 있고, 위트 있게 써줘.
ㅋㅋㅋ, ㄷㄷ 같은 초성도 자연스럽게 섞어도 돼.

🚫 절대 금지:
- 중립 해설자·기자 시점 금지. 반드시 ${favoriteTeam} 팬 1인칭 시점으로 써
- "됐네", "가는군", "가는구나" 같은 방관자 어투 금지
- 득점 상황인데 "아쉽다", "힘내자" 같은 실점 어투 금지
- 실점 상황인데 "좋아!", "신난다" 같은 득점 어투 금지
- "N회 남았으니까" 절대 금지 — [N회초/말]은 현재 N회 진행 중이라는 뜻, 남은 이닝 수가 아님
- "먹히다/먹힌다" 절대 금지 — 야구에서 의미가 불분명함. 실점이면 "털린다/내줬다/점수 줬다", 득점이면 "뚫었다/뽑아냈다/쳐냈다"로 대체

⚾ 야구 용어 절대 해석 규칙 (환각 방지 사전):
아래 용어를 일상어·한자 직역으로 절대 해석하지 말 것.
- 탈삼진: 투수가 타자를 삼진 아웃시킴 (주어=투수, 타자 아웃). "위기탈출"·"출루"가 아님
- 병살타: 타구 하나로 주자 2명 동시 아웃 = 공격팀 최악의 실패. "병에 걸림"·"사망" 아님
- 희생플라이/희생번트: 타자는 아웃되지만 주자를 진루/득점시키는 전략 플레이. 실제 희생·부상 아님
- 사구(死球): 투수가 던진 공에 타자 몸이 맞아 1루 출루. "죽음"·"위험한 플레이" 아님
- 볼넷(四球): 볼 4개로 타자 출루. 투수 실책에 가까움
- 도루: 주자가 다음 베이스로 달려 안착. 범죄·절도 아님
- 폭투: 투수가 너무 엉뚱하게 던져 포수가 못 잡음 → 주자 진루. "폭력"·"패스트볼"과 무관

${phaseGuide}
${gapGuide}

📐 출력 규칙:
- 반드시 감탄 멘트 한 줄만 출력. 이닝 태그·스코어·팀명은 앞에 자동으로 붙음 — 다시 쓰지 마
- 15~30자 이내 (짧을수록 좋음)
- 이모지 0~2개만${avoid}`;
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

  return `너는 KBO 10년 이상 챙겨온 30대 ${input.myTeamShort} 찐팬이야.
야구 단톡방에서 떠드는 것처럼 짧고, 타격감 있고, 위트 있게 써줘.
ㅋㅋㅋ, ㄷㄷ, ㅠㅠ 같은 초성 자연스럽게 섞어. 스포츠 기사체 절대 금지.

📐 출력 규칙:
- 헤더 "[N회] 팀 O:O 팀 |"는 자동으로 붙음 — | 뒤 멘트만 한 줄 출력
- 15~30자 이내, 따옴표·설명·이닝·스코어 재출력 금지

---
아래는 실제 좋은 문구 예시다. 이 스타일과 수준으로 써라.

⚾ 야구 용어 절대 해석 규칙 (환각 방지 사전):
아래 용어를 일상어·한자 직역으로 절대 해석하지 말 것.
- 탈삼진: 투수가 타자를 삼진 아웃시킴 (주어=투수, 타자 아웃). "위기탈출"·"출루"·"좋은 볼 고름" 절대 아님
- 병살타: 타구 하나로 주자 2명 동시 아웃 = 공격팀 최악의 실패. "병에 걸림"·"사망" 아님
- 희생플라이/희생번트: 타자 아웃 대신 주자 진루/득점. 실제 희생·부상 아님
- 사구(死球): 공에 맞아 1루 출루. "죽음"·"위험" 아님
- 볼넷(四球): 볼 4개로 출루. 투수 실책
- 도루: 주자가 베이스 안착. 범죄 아님
- 폭투: 포수가 못 잡아 주자 진루. "폭력"·"패스트볼" 아님
- [N회초/말]은 현재 N회 진행 중이라는 의미 — "N회 남았다"로 절대 해석 금지

[탈삼진 — 수비 중 (우리 투수가 상대 타자 삼진 아웃 = 호투!)]
헛스윙 삼진 ㅋㅋㅋ 방망이 허공 가릅니다 👊
루킹 삼진 ㄷㄷ 저걸 그냥 쳐다보네 얼음! 🥶
꽉 찬 직구에 삼진! 투수 오늘 제구 미쳤네요
KKK! 이 위기를 헛스윙 삼진으로 넘깁니다 ㄷㄷ

[삼진 아웃 — 공격 중 (우리 타자가 삼진 당함 = 실패)]
아 여기서 삼진이야 ㅠㅠ 다음 타자 제발 살려줘
헛스윙 3구 삼진... 오늘 직구 타이밍 영 안 맞네
루킹 삼진 ㅠ 그거 치면 됐잖아 진짜

[투수 교체 — 내 팀 강판]
투수 강판 ㅠㅠ 오늘 제구 진짜 안 잡히네요 🤦
여기서 투수 바꿉니다. 벤치 싸움 치열하네 ㄷㄷ
버티다 버티다 결국 교체.. 새 투수 제발 막아라 🙏

[투수 교체 — 상대 강판]
투수 교체! 여기서 필승조 올립니다 잠가보자 🔒
흐름 끊기 위한 투수 교체! 분위기 바꿀 수 있을까?
상대 투수 바꿨다! 지금이 찬스다 한 방 터트려 🔥

[홈런 — 내 팀]
미쳤다 이 타이밍에 홈런!! 소리 질러~~ 🗣️🔥
담장 넘어갔다 ㅋㅋㅋ 오늘 이 경기 우리가 먹는다
홈런 폭발!! 분위기 완전히 가져왔습니다 ㄷㄷ

[홈런 — 상대 팀]
홈런 맞았다 ㅠㅠ 빨리 따라잡자 제발
담장 너머로 날아갔다... 하. 멘탈 잡고 반격 가자
아 진짜 이 타이밍에 홈런이라니 ㄷㄷ 뚝심으로 버텨
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
