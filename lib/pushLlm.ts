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
const ANTHROPIC_MODEL = "claude-3-5-haiku-20241022";

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clipForPush(text: string): string {
  const compact = compactText(text);
  if (compact.length <= 52) return compact;
  return `${compact.slice(0, 50)}..`;
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
    .replace(/^\[[^\]]+\]\s*/, "")
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

function ensureInningPrefix(text: string, inningTag: string): string {
  const compact = compactText(text);
  if (/^\[[^\]]+\]/.test(compact)) return compact;
  if (compact.includes("[경기종료]")) return compact;
  // 이닝 정보 없으면 태그 생략
  if (inningTag === "경기중" || !inningTag) return compact;
  return `[${inningTag}] ${compact}`;
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

  const gapGuide = trailing
    ? tier === "garbage"
      ? `\n⚠️ 6점 이상 지고 있음 → 해탈/허탈/냉소 톤. "아직 안 끝났다" 절대 금지. 짧게.`
      : tier === "danger"
      ? `\n⚠️ 3~5점 지고 있음 → 짜증/분노/빨리 따라잡자 톤.`
      : `\n⚠️ 1~2점 지고 있음 → 간절함/초조함/피 말린다 톤.`
    : leading
    ? `\n✅ 우리 팀이 앞서고 있음 → 자신감/흥분/굳혀라 톤.`
    : `\n➡️ 동점 상황 → 긴장감/역전각/승부 갈린다 톤.`;

  return `너는 KBO를 10년 넘게 챙겨온 30대 ${favoriteTeam} 찐팬이야.
친한 친구들과 야구 단톡방에서 떠드는 것처럼 짧고, 타격감 있고, 위트 있게 써줘.
ㅋㅋㅋ, ㄷㄷ 같은 초성도 자연스럽게 섞어도 돼. 스포츠 기사처럼 딱딱하게 쓰지 마.

${phaseGuide}
${gapGuide}

📐 출력 규칙:
- 반드시 푸시 본문 한 줄만 출력 (설명·따옴표·이닝 태그 다시 쓰지 마 — 앞에 이미 붙음)
- 20~45자 이내
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
  recentBodies?: string[];
  fallbackBody: string;
};

function buildLiveEventSystemPrompt(input: GenerateLiveEventInput): string {
  const side =
    input.isPitching === true  ? `${input.myTeamShort}이 수비(투구) 중` :
    input.isPitching === false ? `${input.myTeamShort}이 공격(타석) 중` :
    "공수 불명";

  const kindKo = input.kind === "strikeout" ? "탈삼진" : input.kind === "homeRun" ? "홈런" : "투수 교체";
  const avoid =
    (input.recentBodies ?? []).length > 0
      ? `\n- 최근 문구 재사용 금지: ${(input.recentBodies ?? []).slice(0, 4).map((l) => `"${l.slice(0, 30)}"`).join(", ")}`
      : "";

  return `너는 ${input.myTeamShort} 극성팬이다.
- 지금 경기 중 '${kindKo}' 이벤트가 발생했다.
- 현재 상황: ${side}
- 내 팀 관점에서 한 줄 리액션을 써라.
- 규칙:
  • 한 줄, 20~40자
  • 푸시 본문만 출력(따옴표/설명 금지)
  • 수비 중 탈삼진 → 투수 응원, 흥분, 자신감 폭발
  • 공격 중 삼진 아웃 → 아쉬움, 짜증, 다음 타자 기대
  • 내 팀 투수 교체 → 위기감, 제발 막아라 간절함
  • 상대 투수 교체 → 기대감, 지금이 찬스다 텐션
  • 내 팀 홈런 → 환호, 폭발적 흥분, 선수 이름 없이도 됨
  • 상대 팀 홈런 → 허탈함, 분노, 빨리 따라잡자는 의지
  • 이닝 레이블은 절대 다시 쓰지 마(이미 앞에 붙음)${avoid}`;
}

function buildLiveEventUserPrompt(input: GenerateLiveEventInput): string {
  const kindKo = input.kind === "strikeout" ? "탈삼진" : input.kind === "homeRun" ? "홈런" : "투수 교체";
  const inning = input.inningLabel ?? "경기 중";
  return `이닝: ${inning}
이벤트: ${kindKo}
팀: ${input.myTeamShort} vs ${input.oppTeamShort}
상황: ${input.isPitching === true ? "내 팀 수비 중" : input.isPitching === false ? "내 팀 공격 중" : "공수 불명"}`;
}

export async function generateLiveEventCopy(
  input: GenerateLiveEventInput
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return input.fallbackBody;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const nonce2 = Date.now() % 9999;
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
    if (!res.ok) return input.fallbackBody;
    const json = await res.json();
    const text = extractAnthropicText(json);
    return text ? compactText(text).slice(0, 60) : input.fallbackBody;
  } catch {
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
  const normalizeAndFinalize = (rawBody: string): string => {
    const variety = ensureCopyVariety(rawBody, input);
    const gapAware = enforceScoreGapTone(variety, input);
    const consistent = enforceBaseballConsistency(gapAware, input);
    const inningPrefixed = ensureInningPrefix(consistent, inningTag);
    return clipForPush(ensureNovelBody(input, inningPrefixed));
  };
  if (!apiKey) {
    return {
      title: input.fallbackTitle,
      body: normalizeAndFinalize(input.fallbackBody),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
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
    console.error("[Claude API Fail]: ", error);
    return {
      title: input.fallbackTitle,
      body: normalizeAndFinalize(input.fallbackBody),
    };
  } finally {
    clearTimeout(timeout);
  }
}
