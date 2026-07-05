type Surface =
  | "score"
  | "live"
  | "strikeout"
  | "preview"
  | "postgame"
  | "highlight"
  | "game-start"
  | "clutch";

type Tone = "win" | "loss" | "draw";

type ScoreFallbackInput = {
  favoriteTeam: string;
  opponentTeam: string;
  myScore: number;
  oppScore: number;
  tone?: "for" | "against";
  latestPlayText: string;
};

type PostgameFallbackInput = {
  seed: string;
  tone: Tone;
  myTeam: string;
  oppTeam: string;
  myScore: number;
  oppScore: number;
  winningPitcher?: string | null;
  losingPitcher?: string | null;
  savePitcher?: string | null;
  clutchHit?: string | null;
  homeRun?: string | null;
  error?: string | null;
  myHits?: number | null;
  oppHits?: number | null;
  myErrors?: number | null;
  oppErrors?: number | null;
  myHomeRuns?: number | null;
  oppHomeRuns?: number | null;
  notable?: string[];
  wasRainSuspended?: boolean;
};

type PregameFallbackInput = {
  seed: string;
  team: string;
  opp: string;
  starter?: string | null;
  time?: string | null;
  momentumSummary: string;
  streakLabel?: string | null;
  lastGameLine?: string | null;
};

type LiveFallbackInput = {
  kind: "strikeout" | "pitcherChange" | "homeRun";
  myTeamShort: string;
  oppTeamShort: string;
  isPitching: boolean | null;
  inningLabel: string | null;
  playerName?: string | null;
  myCurrentScore?: number;
  oppCurrentScore?: number;
};

const PERSONAS = [
  "중계석에서 의자를 반쯤 박차고 일어난 편파 캐스터",
  "퇴근길 버스에서 알림 보고 주먹 쥔 팬",
  "단톡방에서 제일 먼저 반응 올리는 방장",
  "3루 응원석 맨 앞줄에서 목 다 쉰 사람",
  "야구장 라디오를 귀에 붙인 오래된 팬",
  "스코어보드만 봐도 심박수 오르는 팬",
  "상대 투수 교체에 바로 계산기 두드리는 팬",
  "한 점마다 인생이 흔들리는 사람",
  "야구를 너무 사랑해서 침착함을 잃은 캐스터",
  "포수 미트 소리까지 과몰입하는 중계자",
  "가족 단톡에도 야구 얘기만 보내는 팬",
  "초구부터 운명을 읽는 사람",
  "9회에도 미신을 포기 못 하는 팬",
  "불펜 전화벨 소리에 심장 뛰는 팬",
  "응원가 한 소절로 분위기 판단하는 사람",
  "안타 하나에 하루가 살아나는 팬",
  "실책 하나에 천장을 보는 팬",
  "홈런 타구 각도에 이미 일어난 팬",
  "삼진 콜 나오기 전에 숨 멈춘 팬",
  "경기 후에도 리플레이 돌려보는 팬",
  "선발 첫 공에 오늘 기운 보는 팬",
  "야구장 냄새까지 같이 전달하는 캐스터",
  "박빙이면 말끝이 빨라지는 캐스터",
  "이기면 세상이 좋아 보이는 팬",
  "지면 내일 점심까지 말수 줄어드는 팬",
  "상대 팀 이름만 들어도 눈썹 올라가는 팬",
  "득점권이면 손바닥에 땀 차는 팬",
  "불펜 문 열리면 기도 모드 들어가는 팬",
] as const;

const OPENING_MOVES = [
  "감탄사 없이 장면 한 컷으로 시작",
  "짧은 의문문으로 팬의 속마음을 먼저 던짐",
  "선수 이름이나 포지션을 첫 단어로 박음",
  "점수 대신 체감 온도로 시작",
  "중계석 반응을 먼저 묘사",
  "단톡방에 바로 올라올 법한 말로 시작",
  "스코어보드가 아니라 팬의 표정으로 시작",
  "한숨, 박수, 침묵 중 하나를 첫 이미지로 사용",
  "경기장 소리로 시작",
  "딱 한 단어 감탄 후 바로 본론",
  "장면을 영화 예고편처럼 잘라 시작",
  "상대가 싫어할 만한 표현으로 시작",
  "우리 팀 팬만 알아들을 과몰입으로 시작",
  "불안과 기대를 한 문장에 동시에 넣음",
  "냉정한 숫자 대신 감정의 속도로 시작",
  "말문 막힌 척하다가 바로 폭발",
  "짧은 명령형으로 시작",
  "리플레이를 다시 켜게 만드는 첫 문장",
  "오늘 경기의 냄새나 공기를 묘사",
  "스탠드의 반응을 먼저 호출",
  "상대 덕아웃의 표정을 상상",
  "팬이 휴대폰을 쥔 손을 묘사",
  "투구 하나, 타구 하나의 질감으로 시작",
  "과장된 비유 없이 직설로 시작",
  "작은 농담으로 시작하되 정보는 정확히",
  "중계 캐스터의 목소리 톤 변화로 시작",
  "팬이 참아온 감정을 터뜨림",
  "짧은 반전 구조로 시작",
  "한 박자 쉬고 결정타를 말함",
  "응원가가 다시 커지는 느낌으로 시작",
] as const;

const RHYTHM_MOVES = [
  "짧게 치고 한 번 더 밀어붙이는 2박자",
  "긴 문장 하나로 숨 가쁘게 몰아붙임",
  "쉼표 두 개 이하로 단호하게",
  "마침표보다 느낌표를 한 번만 강하게",
  "첫 문장은 차분, 두 번째 문장은 과몰입",
  "첫 문장은 폭발, 두 번째 문장은 정확한 해석",
  "문장 끝마다 같은 어미 반복 금지",
  "비슷한 단어를 세 번 이상 쓰지 않음",
  "중계체와 팬 단톡방 말투를 6:4로 섞음",
  "정보는 절반, 감정은 절반",
  "분석어 대신 행동 동사 사용",
  "승리 때는 박수, 패배 때는 침묵 이미지를 사용",
  "실점 때도 상대 칭찬보다 우리 감정 우선",
  "득점 때는 점수보다 타이밍을 먼저 칭찬",
  "삼진은 공의 궤적보다 팬의 안도감 우선",
  "홈런은 비거리보다 순간의 정적과 폭발감 우선",
  "프리뷰는 예측보다 기대감의 각도 우선",
  "포스트게임은 오늘의 한 장면만 선택",
  "하이라이트는 다시 눌러보고 싶은 미끼 문장",
  "반복되는 '다음 경기' 결론 금지",
  "반복되는 '이 흐름 그대로' 결론 금지",
  "반복되는 '팬들도 할 말 없다' 결론 금지",
  "문장마다 같은 조사·어미 반복 금지",
  "불필요한 친절한 설명 금지",
  "오늘 경기 데이터 밖의 어제/직전 경기 추측 금지",
  "모르면 모르는 티 내지 말고 오늘 장면만 말함",
  "스코어 계산은 반드시 실제 점수차 기준",
  "상대 선수 이름은 소속을 붙여 오인 방지",
  "짧은 농담은 허용, 조롱은 과하지 않게",
  "팬이 진짜 받아보고 싶을 속도로 문장 압축",
] as const;

const IMAGE_FRAMES = [
  "스코어보드 불빛",
  "덕아웃 난간",
  "포수 미트 소리",
  "불펜 문",
  "응원석 파도",
  "타구가 뜨는 순간의 정적",
  "심판 콜 직전의 숨",
  "휴대폰 알림 진동",
  "중계석 마이크",
  "야구장 조명",
  "파울라인 끝",
  "1루 코치의 손짓",
  "3루 주자의 스타트",
  "벤치의 박수",
  "상대 덕아웃의 침묵",
  "팬 손바닥의 땀",
  "마운드 흙",
  "헬멧을 두드리는 손",
  "리플레이 버튼",
  "응원가 후렴",
  "관중석 공기 대신 경기장의 열기",
  "스코어보드 숫자 하나",
  "중견수 뒤 담장",
  "포효하는 마운드",
  "홈 플레이트 먼지",
  "마지막 아웃카운트",
  "초구 스트라이크 소리",
  "배트 끝 감각",
  "타석 앞 흙 고르는 발",
  "카메라가 잡은 팬 표정",
] as const;

const FORBIDDEN_CLICHES = [
  "다음 경기도 기대가 됩니다",
  "다음 경기, 반드시 되갚아야 합니다",
  "팬들도 오늘만큼은 할 말이 없습니다",
  "이 흐름 그대로 가져가야 합니다",
  "승부처에서 번번이 무너지는 패턴",
  "최근 흐름은",
  "최근 흐름까지 보면",
  "어제 경기는",
  "어젯밤",
  "직전 경기",
  "반드시 되갚아야",
  "기대가 됩니다",
  "흐름이 좋습니다",
  "타선 폭발 예감",
  "함께 응원합시다",
  "오늘 우리 팀 할 수 있습니다",
  "빨리 따라잡아야 합니다",
  "빨리 따라잡아야겠습니다",
  "이 기세 그대로 가야죠",
  "다음 타자가 살려줘야 합니다",
  "멘탈 잡고 반격해야 합니다",
  "큰일입니다",
  "큰일 났습니다",
  "벌써 1점을 내줬다뇨",
  "초반인데 왜 벌써",
] as const;

const FORBIDDEN_CLICHE_PATTERNS = [
  /빨리\s*따라잡아야(?:겠)?습니다/,
  /큰일(?:이|)\s*(?:났|났네요|입니다|났습니다)/,
  /\d+회(?:\s*[초말])?인데\s*벌써\s*\d+점을?\s*내줬다뇨/,
  /벌써\s*\d+점을?\s*내줬다뇨/,
  /홈런을\s*내줬습니다[.!…\s]*빨리/,
  /다음\s*타자가\s*(?:좀\s*)?살려줘야/,
] as const;

const RESCUE_LINES = [
  "스코어보드 불빛이 잠깐 흔들렸습니다. 바로 다음 장면에서 답을 꺼내야 합니다.",
  "응원석 숨이 한 박자 멈췄습니다. 이제 벤치와 타석이 동시에 반응해야 합니다.",
  "방금 장면은 알림창에 오래 남겠습니다. 그래도 판은 다음 공에서 다시 움직입니다.",
  "중계석 톤이 확 낮아졌습니다. 이럴수록 첫 아웃카운트나 첫 출루가 필요합니다.",
  "팬들 손이 휴대폰 위에서 굳었습니다. 지금 필요한 건 말보다 바로 다음 플레이입니다.",
] as const;

export const FAN_COPY_STYLE_COUNT =
  PERSONAS.length + OPENING_MOVES.length + RHYTHM_MOVES.length + IMAGE_FRAMES.length;

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clip(text: string, limit = 92): string {
  const normalized = compact(text);
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 2)}..`;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickBySeed<T>(seed: string, list: readonly T[]): T {
  return list[hashSeed(seed) % list.length] ?? list[0];
}

function pickOffset<T>(seed: string, list: readonly T[], offset: string): T {
  return pickBySeed(`${seed}:${offset}`, list);
}

function hasHangulFinalConsonant(text: string): boolean {
  const lastHangul = [...compact(text)].reverse().find((char) => /[가-힣]/.test(char));
  if (!lastHangul) return false;
  const code = lastHangul.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0;
}

function withSubjectParticle(name: string): string {
  return `${name}${hasHangulFinalConsonant(name) ? "이" : "가"}`;
}

function withTopicParticle(name: string): string {
  return `${name}${hasHangulFinalConsonant(name) ? "은" : "는"}`;
}

function buildLastGameMood(line: string): string {
  const clean = compact(line).replace(/^\d{4}-\d{2}-\d{2}\s+/, "");
  const result = clean.match(/\s([승패무])$/)?.[1];
  const score = clean.replace(/\s[승패무]$/, "");
  if (result === "승") return `${score}, 좋은 기억은 짧게 챙기고 더 욕심낼 밤입니다.`;
  if (result === "패") return `${score}, 팬들 속에 남은 찝찝함부터 지워야 할 밤입니다.`;
  if (result === "무") return `${score}, 웃기도 찡그리기도 애매했던 밤입니다.`;
  return `${clean} 여운이 아직 남아 있습니다.`;
}

export function buildCopyStyleBrief(input: {
  surface: Surface;
  seed: string;
  teamShort: string;
  opponentShort?: string;
}): string {
  const persona = pickOffset(input.seed, PERSONAS, "persona");
  const opening = pickOffset(input.seed, OPENING_MOVES, "opening");
  const rhythm = pickOffset(input.seed, RHYTHM_MOVES, "rhythm");
  const image = pickOffset(input.seed, IMAGE_FRAMES, "image");
  const forbidden = [
    pickOffset(input.seed, FORBIDDEN_CLICHES, "ban1"),
    pickOffset(input.seed, FORBIDDEN_CLICHES, "ban2"),
    pickOffset(input.seed, FORBIDDEN_CLICHES, "ban3"),
  ];
  return `\n━━━ 문구 다양성 지시 ━━━
- 현재 앱은 ${FAN_COPY_STYLE_COUNT}개 이상의 스타일 슬롯을 돌려 쓴다. 이번 문구는 아래 슬롯만 따른다.
- 표면: ${input.surface} / 팀: ${input.teamShort}${input.opponentShort ? ` / 상대: ${input.opponentShort}` : ""}
- 페르소나: ${persona}
- 시작 방식: ${opening}
- 리듬: ${rhythm}
- 이미지 앵커: ${image}
- 이번 문구에서 특히 피할 상투어: ${forbidden.join(" / ")}
- 절대 금지 뼈대: "큰일입니다" / "빨리 따라잡아야" / "벌써 N점을 내줬다뇨" / "다음 타자가 살려줘야" 계열
- 금지 뼈대가 떠오르면 장소·소리·팬 행동 중 하나로 시작해서 완전히 다른 문장으로 우회한다.
- 같은 날 같은 팀 알림끼리 첫 8글자, 결론 문장, 감탄사 구조가 겹치면 실패다.
━━━━━━━━━━━━━━━━━━━`;
}

export function hasForbiddenFanCliche(text: string): boolean {
  return (
    FORBIDDEN_CLICHES.some((phrase) => text.includes(phrase)) ||
    FORBIDDEN_CLICHE_PATTERNS.some((pattern) => pattern.test(text))
  );
}

export function sanitizeBoringFanCopy(
  text: string,
  seed: string,
  options: { clicheFallback?: boolean } = {}
): string {
  let out = compact(text);
  const clicheFallback = options.clicheFallback ?? true;
  const replacements = [
    ["다음 경기도 기대가 됩니다", "오늘 장면은 리플레이로 한 번 더 봐야 합니다"],
    ["다음 경기, 반드시 되갚아야 합니다", "이 패배는 그냥 넘기면 안 됩니다"],
    ["팬들도 오늘만큼은 할 말이 없습니다", "오늘은 휴대폰 알림창도 조용해질 경기입니다"],
    ["이 흐름 그대로 가져가야 합니다", "이 온도는 쉽게 식히면 안 됩니다"],
    ["승부처에서 번번이 무너지는 패턴이 오늘도 반복됐습니다", "결정적인 순간마다 한 박자가 모자랐습니다"],
    ["최근 흐름까지 보면", "오늘 경기만 놓고 봐도"],
    ["최근 흐름은", "오늘 체감은"],
    ["타선 폭발 예감", "타석마다 불씨가 붙을 느낌"],
    ["함께 응원합시다", "알림 켜두고 같이 달려보시죠"],
    ["오늘 우리 팀 할 수 있습니다", "오늘은 우리 쪽으로 판을 당겨와야 합니다"],
    ["빨리 따라잡아야 합니다", "지금 바로 점수판을 흔들어야 합니다"],
    ["빨리 따라잡아야겠습니다", "바로 다음 장면에서 답을 꺼내야겠습니다"],
    ["이 기세 그대로 가야죠", "이 장면을 그냥 흘려보내면 안 됩니다"],
    ["다음 타자가 살려줘야 합니다", "벤치가 바로 다음 답을 꺼내야 합니다"],
    ["다음 타자가 좀 살려줘야겠습니다", "다음 타석에서 바로 표정을 바꿔야겠습니다"],
    ["멘탈 잡고 반격해야 합니다", "흔들릴 시간 없이 바로 다시 붙어야 합니다"],
    ["큰일입니다", "응원석 숨이 잠깐 멎었습니다"],
    ["큰일 났습니다", "중계석 톤이 확 낮아졌습니다"],
    ["초반인데 왜 벌써", "첫 이닝부터 이렇게 흔들리면"],
    ["단어의 방향을 바꾸다", "분위기를 반전시키다"],
    ["단어의 방향을 직접 바꿔야 합니다", "분위기를 직접 반전시켜야 합니다"],
    ["실책을 놓치지 않고 점수를 쌓아 올린", "상대의 자멸을 틈타 무섭게 집중력을 발휘한"],
    ["실책을 놓치지 않은 집중력", "상대의 자멸을 틈탄 집중력"],
    ["승부의 핵심이었습니다", "승부를 흔든 장면이었습니다"],
    ["1연승", "직전 경기 승리"],
    ["1연패", "직전 경기 패배"],
  ] as const;
  for (const [from, to] of replacements) {
    out = out.replaceAll(from, to);
  }

  if (clicheFallback && hasForbiddenFanCliche(out)) {
    out = pickOffset(seed, RESCUE_LINES, "sanitize-rescue");
  }
  return compact(out);
}

function extractHook(text: string): string | null {
  const clean = compact(text)
    .replace(/\d{1,2}회(?:초|말)?/g, "")
    .replace(/스코어\s*변동[:：]?\s*/g, "")
    .replace(/[|·()[\]]/g, " ")
    .replace(/\b[A-Z]{2,}\b/g, "")
    .trim();
  if (!clean || clean.length < 3) return null;
  return clean.length > 16 ? clean.slice(0, 16).trim() : clean;
}

export function buildScoreFallbackCopy(input: ScoreFallbackInput): string {
  const seed = `${input.favoriteTeam}:${input.opponentTeam}:${input.myScore}:${input.oppScore}:${input.latestPlayText}`;
  const score = `${input.favoriteTeam} ${input.myScore}:${input.oppScore} ${input.opponentTeam}`;
  const hook = extractHook(input.latestPlayText);
  const leading = input.myScore > input.oppScore;
  const trailing = input.myScore < input.oppScore;
  const tied = input.myScore === input.oppScore;
  const gap = Math.abs(input.myScore - input.oppScore);
  const scoredForUs = input.tone === "for";
  const image = pickOffset(seed, IMAGE_FRAMES, "score-image");

  const leadFor = [
    `${score}. ${image}까지 들썩입니다, 지금 판을 우리 쪽으로 당겼습니다🔥`,
    `${score}. 이 타이밍 득점이면 상대 덕아웃도 바로 계산 들어갑니다.`,
    `${score}. 점수판 숫자 하나가 이렇게 크게 보일 수가 있네요.`,
    `${score}. 방금 장면, 팬들 알림창에 박제해도 됩니다.`,
    `${score}. 여기서 한 번 더 몰아치면 경기 냄새가 완전히 바뀝니다.`,
    `${score}. ${hook ? `${hook}, ` : ""}이건 그냥 득점이 아니라 분위기 압수입니다.`,
  ] as const;
  const leadAgainst = [
    `${score}. 한 점 내줬지만 아직 우리 쪽 공기가 더 뜨겁습니다.`,
    `${score}. 아직 앞서 있지만, 이 점수는 편하게 볼 점수가 아닙니다.`,
    `${score}. ${image} 한 번 조용해졌지만 판은 아직 우리가 잡고 있습니다.`,
    `${score}. 여기서 답 하나만 바로 내면 됩니다, 오래 끌 일 아닙니다.`,
    `${score}. 괜히 불씨 키우지 말고 바로 꺼야 합니다.`,
    `${score}. 상대가 숨 붙였습니다. 이제 다시 눌러야 합니다.`,
  ] as const;
  const trailFor = [
    `${score}. 이제 숨통은 붙었습니다, 이 한 점을 그냥 두면 안 됩니다.`,
    `${score}. ${hook ? `${hook}, ` : ""}드디어 알림창이 살아났습니다.`,
    `${score}. 아직 뒤집진 못했지만 경기장 공기가 바뀌기 시작했습니다.`,
    `${score}. 이건 추격 신호입니다, 다음 타석까지 이어가야 합니다.`,
    `${score}. 늦었지만 불씨는 생겼습니다. 이제 진짜 몰아쳐야 합니다.`,
    `${score}. 팬들 손바닥에 다시 땀이 납니다, 여기서 끊기면 안 됩니다.`,
  ] as const;
  const trailAgainst = [
    `${score}. ${image}도 조용해졌습니다, 이건 진짜 아픕니다.`,
    `${score}. 점수차 ${gap}점, 지금은 멋보다 답이 필요합니다.`,
    `${score}. 또 내줬습니다. 이제 말보다 바로 아웃카운트가 필요합니다.`,
    `${score}. 이 흐름이면 벤치도 더 빨리 움직여야 합니다.`,
    `${score}. 팬들 표정이 굳었습니다, 이건 그냥 넘길 실점이 아닙니다.`,
    `${score}. 방금 실점은 체감이 큽니다. 바로 끊어야 합니다.`,
  ] as const;
  const tieFor = [
    `${score}. 동점입니다, 이제 경기장 소리가 확 달라졌습니다🔥`,
    `${score}. 원점 복귀! 여기서 한 번 더 치면 완전히 넘어옵니다.`,
    `${score}. 따라붙었습니다. 상대가 제일 싫어할 타이밍입니다.`,
    `${score}. ${hook ? `${hook}, ` : ""}이제부터는 우리 심장 싸움입니다.`,
    `${score}. 알림 하나로 잠이 확 깼습니다, 이제 뒤집어야 합니다.`,
    `${score}. 스코어보드가 다시 말을 듣기 시작했습니다.`,
  ] as const;
  const tieAgainst = [
    `${score}. 동점 허용, 방금 건 진짜 찝찝합니다.`,
    `${score}. 다시 원점입니다. 이제 한 점 싸움에서 밀리면 안 됩니다.`,
    `${score}. ${image}까지 얼어붙었습니다, 바로 답해야 합니다.`,
    `${score}. 리드가 사라졌습니다. 여기서 정신 바짝 차려야 합니다.`,
    `${score}. 상대가 따라왔습니다. 우리도 바로 다시 때려야 합니다.`,
    `${score}. 동점이 됐습니다, 이 경기 쉽게 갈 마음이 없나 봅니다.`,
  ] as const;

  if (tied) return pickOffset(seed, scoredForUs ? tieFor : tieAgainst, "score-tie");
  if (leading) return pickOffset(seed, scoredForUs ? leadFor : leadAgainst, "score-lead");
  if (trailing) return pickOffset(seed, scoredForUs ? trailFor : trailAgainst, "score-trail");
  return pickOffset(seed, tieFor, "score-default");
}

export function buildGameStartCopy(input: { seed: string; opponent: string; team?: string }): string {
  const openers = [
    "잠깐만요, 이제 야구 켤 시간입니다",
    "알림창 왔습니다. 오늘 경기 곧 열립니다",
    "퇴근길이면 이어폰 꽂으세요",
    "응원가 예열 들어갑니다",
    "오늘 첫 공, 그냥 넘기면 섭섭합니다",
    "스코어보드 불 켜질 시간입니다",
    "치킨보다 중요한 게 있습니다",
    "라인업 보고 심장 뛰셨으면 정상입니다",
    "중계 켜기 좋은 타이밍입니다",
    "오늘 야구, 슬슬 시작합니다",
    "팬 모드 켜세요",
    "15분 뒤면 말이 달라집니다",
    "오늘 하루 마무리는 야구로 갑니다",
    "상대 이름 들으니 벌써 열이 오릅니다",
    "첫 이닝 공기부터 잡아야 합니다",
    "지금부터는 야구 시간이죠",
  ] as const;
  const middles = [
    `${input.opponent}전, 초반부터 눌러야 합니다`,
    `${input.opponent} 상대로 오늘은 먼저 흔들어야 합니다`,
    `${input.opponent}전은 한 점부터 크게 느껴집니다`,
    `${input.opponent} 만나면 그냥 얌전히 볼 수가 없죠`,
    `${input.opponent}전, 선취점이 분위기입니다`,
    `${input.opponent}전, 첫 공격부터 눈 뜨고 봐야 합니다`,
    `${input.opponent}전, 불펜까지 계산하며 봐야 합니다`,
    `${input.opponent}전, 오늘도 알림이 바빠질 겁니다`,
    `${input.opponent} 상대로 판을 우리 쪽으로 당겨야 합니다`,
    `${input.opponent}전, 한 번 잡으면 끝까지 몰아야 합니다`,
    `${input.opponent}전, 오늘은 중계석도 과몰입 준비 완료입니다`,
    `${input.opponent}전, 응원석 온도 올릴 시간입니다`,
  ] as const;
  const closers = [
    "중계 켜두고 같이 달려보시죠.",
    "첫 공부터 보겠습니다.",
    "오늘 알림창, 재미있게 흔들어보겠습니다.",
    "이 경기 놓치면 나중에 리플레이 찾게 됩니다.",
    "오늘은 시작부터 집중입니다.",
    "자, 들어갑니다.",
    "응원 준비됐으면 바로 갑니다.",
    "초구부터 같이 보시죠.",
    "오늘 분위기, 우리가 먼저 잡아봅시다.",
    "소리 줄이지 마세요.",
    "이제 팬 모드입니다.",
    "경기장 불빛 켜졌습니다.",
  ] as const;
  return `${pickOffset(input.seed, openers, "gs-o")}. ${pickOffset(input.seed, middles, "gs-m")}. ${pickOffset(input.seed, closers, "gs-c")}`;
}

export function buildHighlightCopy(input: {
  seed: string;
  tone: Tone;
  myTeam: string;
  oppTeam: string;
  myScore: number;
  oppScore: number;
}): { title: string; body: string } {
  const title =
    input.tone === "win"
      ? pickOffset(input.seed, ["🔥 승리 복습", "🎬 오늘의 장면", "🏟️ 이건 다시 봐야죠", "🔥 경기 요약"], "hl-title")
      : input.tone === "loss"
        ? pickOffset(input.seed, ["😮‍💨 복기 필요", "🎬 경기 장면", "📼 오늘의 기록", "😑 그래도 봅니다"], "hl-title")
        : pickOffset(input.seed, ["🎬 무승부 복기", "📼 결정적 장면", "🏟️ 오늘의 잔상"], "hl-title");
  const win = [
    `${input.myTeam} ${input.myScore}:${input.oppScore} 승리, 이 장면은 그냥 지나가면 손해입니다.`,
    `오늘 이긴 맛 다시 느끼고 싶으면 하이라이트부터 누르시면 됩니다.`,
    `상대가 제일 다시 보기 싫을 장면들만 모였습니다. 우리는 봐야죠.`,
    `승리 알림만으로 부족합니다. 장면으로 한 번 더 확인하시죠.`,
    `오늘 경기, 말보다 영상이 더 크게 웃습니다.`,
    `팬들 단톡방에 다시 던질 장면이 있습니다. 하이라이트 열어보시죠.`,
    `${input.oppTeam} 상대로 만든 좋은 장면, 한 번만 보기엔 아깝습니다.`,
    `이겼으면 복습도 예의입니다. 오늘 장면 바로 확인하시죠.`,
  ] as const;
  const loss = [
    `${input.myTeam} ${input.myScore}:${input.oppScore} 패배, 그래도 뭐가 갈렸는지는 봐야 합니다.`,
    `속은 쓰리지만 복기는 해야죠. 오늘 핵심 장면만 빠르게 보겠습니다.`,
    `오늘 경기는 마음 아프지만, 하이라이트에는 답이 숨어 있습니다.`,
    `이 장면들 보고 내일은 어디서 바뀌어야 하는지 보시죠.`,
    `졌다고 화면 끄면 더 답답합니다. 핵심만 보고 넘깁시다.`,
    `오늘의 아픈 장면, 그래도 기록으로 확인해야 합니다.`,
    `팬이라서 봅니다. 좋든 싫든 오늘 장면은 남았습니다.`,
    `이건 분풀이가 아니라 복기입니다. 하이라이트 열어보시죠.`,
  ] as const;
  const draw = [
    `비겼지만 장면은 남았습니다. 결정적 순간만 다시 보시죠.`,
    `승패는 못 갈렸지만 심장은 여러 번 움직였습니다. 하이라이트 확인입니다.`,
    `무승부라 더 찝찝한 경기, 어디서 갈렸는지 봐야 합니다.`,
    `오늘은 결과보다 장면이 더 오래 남겠습니다.`,
  ] as const;
  return {
    title,
    body: pickOffset(input.seed, input.tone === "win" ? win : input.tone === "loss" ? loss : draw, "hl-body"),
  };
}

function pickPostgameScene(facts: PostgameFallbackInput): string | null {
  if (facts.clutchHit) return `결정 장면은 "${clip(facts.clutchHit, 44)}" 쪽으로 기웁니다`;
  if (facts.homeRun) return `홈런 장면 "${clip(facts.homeRun, 44)}"이 경기 온도를 바꿨습니다`;
  if (facts.winningPitcher) return `${facts.winningPitcher}가 마운드에서 오늘의 표정을 만들었습니다`;
  if (facts.savePitcher) return `${facts.savePitcher}가 마지막 문을 닫아낸 장면이 컸습니다`;
  if (facts.losingPitcher) return `${facts.losingPitcher}에게 패전이 붙었지만, 문제는 한 사람으로 끝나지 않습니다`;
  if (facts.error) return `실책 장면 "${clip(facts.error, 42)}"이 오래 남습니다`;
  const notable = facts.notable?.find((line) =>
    line.length > 0 &&
    /[가-힣A-Za-z0-9]/.test(line) &&
    !/[=_\-━─]{5,}/.test(line) &&
    !/^[=\-_\s|:;,.·•~━─]+$/.test(line)
  );
  return notable ? `기억할 장면은 "${clip(notable, 44)}"입니다` : null;
}

export function buildVariedPostgameFallback(input: PostgameFallbackInput): { headline: string; content: string } {
  const seed = `${input.seed}:${input.myTeam}:${input.oppTeam}:${input.myScore}:${input.oppScore}:${input.tone}`;
  const score = `${input.myScore}:${input.oppScore}`;
  const gap = Math.abs(input.myScore - input.oppScore);
  const scene = pickPostgameScene(input);
  const statHint = (() => {
    if (input.myHits != null && input.oppHits != null && input.myHits >= input.oppHits + 4) {
      return `안타 숫자에서도 ${input.myTeam} 쪽 타석이 훨씬 더 시끄러웠습니다`;
    }
    if (input.myErrors != null && input.myErrors >= 2) {
      return `실책 ${input.myErrors}개는 그냥 지나가기 어려운 상처입니다`;
    }
    if (input.oppErrors != null && input.oppErrors >= 2) {
      return `${input.oppTeam}의 자멸을 틈탄 집중력도 오늘 승부의 일부였습니다`;
    }
    if (input.myHomeRuns != null && input.myHomeRuns > 0) {
      return `담장을 넘긴 한 방이 팬들 목소리를 다시 키웠습니다`;
    }
    return null;
  })();

  const winHeads = [
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 오늘은 끝까지 팬 편이었습니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 한 점의 무게를 제대로 쥐었습니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 마지막 표정까지 좋았습니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 이 승리는 알림창에 남길 만합니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 오늘은 박수칠 장면이 있었습니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 스코어보다 타이밍이 좋았습니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 팬들 심장을 제대로 돌려놨습니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 오늘 결론은 버틴 쪽의 승리입니다.`,
  ] as const;
  const lossHeads = [
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 한 점 차라도 속은 꽤 무겁습니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 오늘은 장면마다 아쉬움이 남았습니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 마지막까지 봤기에 더 쓰립니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 이 패배는 조용히 넘어가기 어렵습니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 팬들 표정이 굳을 수밖에 없습니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 결정적 순간의 답이 늦었습니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 오늘은 핑계보다 복기가 먼저입니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 점수판이 끝내 웃어주지 않았습니다.`,
  ] as const;
  const drawHeads = [
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 비겼지만 속은 쉽게 풀리지 않습니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 오늘은 놓친 장면이 더 커 보입니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 무승부라는 단어가 참 애매합니다.`,
    `🎙️ [캐스터 한줄평] ${input.myTeam}, 끝내 한 끗을 못 넘었습니다.`,
  ] as const;

  const winOpeners = [
    `${input.myTeam}가 ${input.oppTeam}을 ${score}로 잡았습니다.`,
    `${score} 승리, 오늘 ${input.myTeam} 팬들은 마지막 아웃카운트에서 숨을 돌렸습니다.`,
    `${input.myTeam} 입장에서는 점수판보다 타이밍이 더 반가운 경기였습니다.`,
    `한 점씩 쌓인 장면들이 결국 ${score} 승리로 닫혔습니다.`,
    `오늘 ${input.myTeam}는 필요한 순간에 필요한 답을 꺼냈습니다.`,
    `${gap}점 차 승리지만, 체감은 그보다 더 빽빽한 경기였습니다.`,
  ] as const;
  const lossOpeners = [
    `${input.myTeam}가 ${input.oppTeam}에 ${score}로 졌습니다.`,
    `${score} 패배, 숫자는 짧지만 여운은 꽤 깁니다.`,
    `오늘 ${input.myTeam} 팬들에게 마지막 알림은 꽤 쓰린 문장이 됐습니다.`,
    `한 끗을 붙잡지 못한 경기가 ${score}로 끝났습니다.`,
    `${input.myTeam} 입장에서는 다시 보고 싶은 장면보다 지우고 싶은 장면이 많았습니다.`,
    `${gap}점 차 패배, 얇아 보여도 경기 안에서는 크게 느껴졌습니다.`,
  ] as const;
  const drawOpeners = [
    `${input.myTeam}와 ${input.oppTeam}의 경기는 ${score}로 끝났습니다.`,
    `${score} 무승부, 이 결과는 시원하다기보다 애매합니다.`,
    `오늘 ${input.myTeam}는 이길 수도, 질 수도 있었던 경기를 결국 나눴습니다.`,
    `마지막 스코어는 ${score}, 팬들 마음은 딱 그 숫자처럼 걸렸습니다.`,
  ] as const;
  const closersWin = [
    `오늘의 결론은 간단합니다. ${input.myTeam}가 더 오래 버텼고, 더 알맞은 순간에 터졌습니다.`,
    `이런 승리는 화려하지 않아도 팬들 기억에 오래 남습니다.`,
    `경기장 공기를 우리 쪽으로 돌려놓은 장면이 분명히 있었습니다.`,
    `오늘 알림창은 승리라는 단어 하나로 충분히 따뜻합니다.`,
    `리플레이를 켜면 왜 이겼는지 바로 보일 경기입니다.`,
    `이 승리는 결과보다 과정의 박자가 좋았습니다.`,
  ] as const;
  const closersLoss = [
    `오늘의 결론은 냉정합니다. 결정적 순간에 답이 늦었습니다.`,
    `팬이라서 끝까지 봤지만, 그래서 더 아픈 경기입니다.`,
    `스코어보다 답답했던 건 흐름을 끊지 못한 장면들이었습니다.`,
    `이 패배는 감정으로만 넘기기엔 남는 장면이 많습니다.`,
    `복기할 장면은 분명하고, 변명할 공간은 넓지 않습니다.`,
    `오늘 알림창은 조금 늦게 닫는 편이 낫겠습니다.`,
  ] as const;
  const closersDraw = [
    `오늘은 이겼다고 말하기도, 졌다고 접기도 어려운 경기입니다.`,
    `남는 건 승점보다 놓친 타이밍입니다.`,
    `팬 입장에서는 무승부보다 한 장면이 더 오래 떠오르겠습니다.`,
    `결국 답은 경기 안에 있었고, 오늘은 그 답을 끝까지 못 잡았습니다.`,
  ] as const;

  const headline = pickOffset(seed, input.tone === "win" ? winHeads : input.tone === "loss" ? lossHeads : drawHeads, "pg-head");
  const opener = pickOffset(seed, input.tone === "win" ? winOpeners : input.tone === "loss" ? lossOpeners : drawOpeners, "pg-open");
  const middle = scene ?? statHint ?? pickOffset(seed, [
    `${input.myTeam}는 경기 중반 이후 작은 장면들을 더 크게 만들었습니다`,
    `오늘 승부는 거창한 설명보다 한두 번의 타이밍으로 갈렸습니다`,
    `팬들이 기억할 건 스코어보다 그 순간의 공기입니다`,
    `양쪽 모두 흔들린 장면은 있었지만, 결정적인 무게는 달랐습니다`,
  ], "pg-mid");
  const rain = input.wasRainSuspended ? "우천 중단까지 섞인 경기라 집중력의 무게도 더 컸습니다. " : "";
  const texture = pickOffset(seed, [
    `${input.myTeam} 팬들에게는 점수보다 경기 내내 쌓인 체감이 더 크게 남습니다`,
    `스코어만 보면 단순해도, 팬 입장에서는 장면마다 온도가 달랐습니다`,
    `오늘 경기는 박수와 한숨이 어디서 갈렸는지 비교적 선명했습니다`,
    `결국 마지막에 남은 건 숫자보다 그 숫자를 만든 타이밍이었습니다`,
  ], "pg-texture");
  const scoreFrame =
    input.tone === "win"
      ? `${input.myTeam}가 ${gap}점 차를 끝까지 지키며 결과를 가져왔고, 마지막까지 흔들릴 틈을 크게 허용하지 않았습니다`
      : input.tone === "loss"
        ? `${gap}점 차 패배지만, 팬들이 느낀 무게는 결코 가볍지 않았고 흐름을 되돌릴 시간도 빠르게 줄었습니다`
        : `승패가 갈리지 않은 만큼, 놓친 타이밍 하나하나가 더 크게 보였고 마지막 표정도 쉽게 정리되지 않았습니다`;
  const scoreMeaning =
    input.tone === "win"
      ? `최종 스코어 ${score}는 단순한 숫자가 아니라, 오늘 ${input.myTeam}가 경기 흐름을 어디서 붙잡았는지 보여주는 표식입니다`
      : input.tone === "loss"
        ? `최종 스코어 ${score}는 짧아 보여도, 오늘 ${input.myTeam}가 놓친 선택과 타이밍을 꽤 솔직하게 드러냅니다`
        : `최종 스코어 ${score}는 양쪽 모두에게 설명이 필요하지만, ${input.myTeam} 팬에게는 특히 더 찜찜하게 남습니다`;
  const toneAngle =
    input.tone === "win"
      ? `화려한 말보다 필요한 순간을 놓치지 않은 쪽이 ${input.myTeam}였습니다`
      : input.tone === "loss"
        ? `오늘 ${input.myTeam}에는 결과보다 왜 그 흐름을 못 끊었는지가 더 큰 숙제입니다`
        : `오늘 ${input.myTeam}에는 버틴 장면과 놓친 장면이 같이 남았습니다`;
  const fanAftertaste =
    input.tone === "win"
      ? `팬 입장에서는 이긴 장면만큼이나, 흔들릴 수 있던 순간을 넘긴 과정까지 다시 보게 되는 경기입니다`
      : input.tone === "loss"
        ? `팬 입장에서는 졌다는 사실보다, 다시 돌려봐도 답답한 장면들이 먼저 떠오를 경기입니다`
        : `팬 입장에서는 결과를 받아들이기보다, 어느 장면에서 한 발을 더 뗐어야 했는지부터 떠올리게 됩니다`;
  const closer = pickOffset(seed, input.tone === "win" ? closersWin : input.tone === "loss" ? closersLoss : closersDraw, "pg-close");
  const sentences = [
    opener,
    rain ? rain.trim() : null,
    middle,
    statHint && statHint !== middle ? statHint : texture,
    scoreFrame,
    scoreMeaning,
    toneAngle,
    fanAftertaste,
    closer,
  ].filter((line): line is string => Boolean(line));
  return {
    headline,
    content: sanitizeBoringFanCopy(
      sentences
        .map((sentence) => {
          const clean = compact(sentence);
          return /[.!?。！？]$/.test(clean) ? clean : `${clean}.`;
        })
        .join(" "),
      seed,
      { clicheFallback: false },
    ),
  };
}

export function buildVariedPregameFallback(input: PregameFallbackInput): { title: string; lines: string[] } {
  const seed = `${input.seed}:${input.team}:${input.opp}:${input.starter ?? ""}`;
  const starterSubject = input.starter ? withSubjectParticle(input.starter) : null;
  const teamSubject = withSubjectParticle(input.team);
  const teamTopic = withTopicParticle(input.team);
  const oppSubject = withSubjectParticle(input.opp);
  const streakTopic = input.streakLabel ? withTopicParticle(input.streakLabel) : null;
  const title = pickOffset(seed, [
    `🔥 ${input.team} 오늘 말 나옵니다`,
    `🎙️ ${input.opp}전 한 장면 대기`,
    `⚾ ${input.team} 팬심 집합`,
    `🏟️ ${input.team} 쪽 소리부터`,
    `📌 ${input.opp}전 체크 포인트`,
    `🎧 ${input.team} 경기 전 호출`,
    `🔥 오늘 ${input.team} 각입니다`,
    `⚾ ${input.opp}전 그냥 못 넘깁니다`,
    `🧢 ${input.team} 팬들 모이세요`,
    `🥁 ${input.opp}전 북소리 체크`,
    `📡 ${input.team} 쪽 신호 옵니다`,
    `🎬 ${input.opp}전 첫 컷 대기`,
  ], "pv-title");
  const starterLine = input.starter
    ? pickOffset(seed, [
        `선발 ${input.starter}, 오늘은 구속 숫자보다 ${input.opp} 타자 반응으로 답을 받아야 합니다.`,
        `${starterSubject} 첫 헛스윙 하나만 꺼내도 ${input.team} 팬들 채팅창 온도가 달라집니다.`,
        `마운드 위 ${input.starter}에게 필요한 건 거창한 서사가 아니라 낮게 깔리는 첫 장면입니다.`,
        `${input.starter} 공 끝에 ${input.opp} 방망이가 늦으면, 시작부터 ${input.team} 쪽 소리가 커집니다.`,
        `오늘 ${input.starter} 이름표는 예고편이 아닙니다. 초반 타석 반응으로 바로 검증받습니다.`,
        `선발 ${input.starter}가 카운트 싸움을 빨리 유리하게 만들면 ${input.team} 응원은 훨씬 편해집니다.`,
        `오늘 ${input.starter}의 숙제는 간단합니다. ${input.opp} 중심타선 앞에 복잡한 생각을 심는 겁니다.`,
        `타자 눈높이를 흔드는 공 하나, ${input.starter}에게는 그 장면이 출발점입니다.`,
        `${starterSubject} 낮은 존을 먼저 열면 ${input.opp} 타선 플랜도 길게 꼬입니다.`,
        `오늘 ${input.starter}에게 필요한 건 과한 영웅담보다 ${input.opp} 배트 타이밍을 늦추는 공입니다.`,
      ], "pv-starter")
    : `${input.team} 마운드는 오늘 첫 좋은 카운트부터 팬들 어깨를 펴게 만들어야 합니다.`;
  const momentumLine = (() => {
    if (input.streakLabel && /연승/.test(input.streakLabel)) {
      return pickOffset(seed, [
        `${input.team} ${input.streakLabel}, 팬들 표정이 조심스럽게 건방져질 타이밍입니다.`,
        `${input.streakLabel} 숫자가 괜히 붙은 게 아닙니다. ${teamTopic} 오늘도 먼저 밀 명분이 충분합니다.`,
        `요즘 ${input.team} 알림은 열어볼 맛이 있습니다. ${input.streakLabel} 옆에 하나 더 붙일 시간입니다.`,
      ], "pv-streak-win");
    }
    if (input.streakLabel && /연패/.test(input.streakLabel)) {
      return pickOffset(seed, [
        `${input.team} ${input.streakLabel}, 긴말보다 선취점 하나가 제일 큰 사과문입니다.`,
        `${streakTopic} 더 길어지면 밈이 됩니다. ${input.team} 팬들은 오늘 그 농담을 끝내고 싶습니다.`,
        `${input.team} 팬심은 요 며칠 오래 끓었습니다. 오늘은 좋은 타구 하나부터 숨통을 틔워야죠.`,
      ], "pv-streak-loss");
    }
    if (input.lastGameLine) {
      return `${buildLastGameMood(input.lastGameLine)} ${teamTopic} 오늘 첫 찬스부터 말투를 바꿔야죠.`;
    }
    return `${input.team} 최근 메모는 ${input.momentumSummary}입니다. 오늘은 숫자보다 먼저 장면을 가져와야죠.`;
  })();
  const matchupLine = pickOffset(seed, [
    `${input.opp} 상대로는 큰소리보다 작은 빈틈을 먼저 잡는 쪽이 재밌어집니다.`,
    `${input.opp} 이름값에 눌릴 경기 아닙니다. ${input.team} 쪽 한 방이 먼저 나오면 말투가 바뀝니다.`,
    `${input.opp} 벤치가 계산기 꺼내게 만들 장면, 오늘 초반에 하나면 충분합니다.`,
    `${input.opp}전 알림은 밍밍하면 안 됩니다. 팬들 손가락이 멈출 이유를 만들어야죠.`,
    `${input.opp} 이름만 떠도 예민해지는 팬심, 오늘은 그 촉까지 전력입니다.`,
    `${input.opp}전은 한 번 밀리면 말이 길어집니다. ${teamTopic} 먼저 짧고 세게 보여줘야죠.`,
    `${oppSubject} 편하게 스윙하게 두면 손해입니다. ${teamTopic} 초반부터 귀찮게 굴어야 합니다.`,
    `${input.opp} 상대로는 첫 좋은 수비 하나도 분위기 자산입니다. 허투루 넘길 장면이 없습니다.`,
    `${input.opp}전 키워드는 선명합니다. ${teamSubject} 먼저 팬들 목소리를 키우면 됩니다.`,
    `${oppSubject} 계산한 경기표에 ${input.team} 쪽 변수를 하나 꽂아 넣어야 합니다.`,
  ], "pv-matchup");
  const closer = pickOffset(seed, [
    `${input.time ?? "경기 시간"} 시작, 오늘 알림은 군더더기 빼고 장면으로만 가겠습니다.`,
    `초반 흐름 놓치면 단톡방 복습부터 해야 할 수도 있습니다.`,
    `팬 모드 켜두세요. 오늘은 작은 타구 하나에도 어깨가 먼저 반응할 수 있습니다.`,
    `초반 세 타석 안에 오늘 ${input.team} 경기의 농도가 보일 겁니다.`,
    `경기 전부터 ${input.team} 팬들 엄지는 이미 알림 위에서 대기 중입니다.`,
    `오늘은 길게 설명하지 않겠습니다. ${input.team} 팬들이 먼저 알아볼 장면만 잡겠습니다.`,
    `${input.time ?? "플레이볼"} 전부터 채팅창 예열됐습니다. 이제 그 열을 경기장 쪽으로 넘겨야죠.`,
    `이 알림은 예고편입니다. 본편에서는 ${input.team} 쪽 박수가 먼저 터져야 합니다.`,
    `작은 카운트 하나도 그냥 지나치지 않겠습니다. 오늘은 ${input.team} 쪽 디테일을 보겠습니다.`,
    `팬들 마음은 이미 좌석에 앉았습니다. 이제 ${teamSubject} 첫 신호만 보내면 됩니다.`,
    `오늘은 거창한 예언보다 빠른 반응입니다. 좋은 장면 나오면 바로 물겠습니다.`,
    `중계석 말투도 준비 끝입니다. ${teamSubject} 먼저 소리를 키우면 그대로 따라가겠습니다.`,
    `손가락은 알림 위에, 눈은 첫 타석에 두면 됩니다. 오늘 ${input.team} 포인트 놓치지 않겠습니다.`,
  ], "pv-close");
  return {
    title,
    lines: [momentumLine, starterLine, matchupLine, closer].map((line) =>
      clip(sanitizeBoringFanCopy(line, seed, { clicheFallback: false }), 88)
    ),
  };
}

export function buildLiveFallbackCopy(input: LiveFallbackInput): { title: string; body: string } {
  const seed = `${input.kind}:${input.myTeamShort}:${input.oppTeamShort}:${input.inningLabel ?? ""}:${input.playerName ?? ""}:${String(input.isPitching)}`;
  const inning = input.inningLabel ? `${input.inningLabel} ` : "";
  const name = input.playerName ?? "";
  if (input.kind === "strikeout") {
    if (input.isPitching === true) {
      return {
        title: pickOffset(seed, ["⚡ 탈삼진", "🎯 삼진 콜", "🔥 마운드 포효", "⚾ 아웃카운트"], "le-title"),
        body: pickOffset(seed, [
          `${inning}${name ? `${name}, ` : ""}삼진으로 공기를 확 끊었습니다!`,
          `${inning}${input.myTeamShort} 마운드가 방금 한숨 돌리게 만들었습니다.`,
          `${inning}삼진 콜! 이 아웃카운트는 진짜 큽니다.`,
          `${inning}${name ? `${name}의 공, ` : ""}상대 방망이가 답을 못 찾았습니다.`,
          `${inning}포수 미트 소리가 제대로 꽂혔습니다. 삼진입니다!`,
          `${inning}이건 마운드가 직접 분위기를 잠근 장면입니다.`,
        ], "le-body"),
      };
    }
    if (input.isPitching === false) {
      return {
        title: pickOffset(seed, ["⚡ 삼진 아웃", "😮‍💨 타석 침묵", "⚾ 공격 아웃", "📉 아쉬운 타석"], "le-title"),
        body: pickOffset(seed, [
          `${inning}${name ? `${name}, ` : ""}여기서 삼진은 너무 아쉽습니다.`,
          `${inning}방금 타석은 그냥 넘기기 어렵습니다. 바로 다음 답이 필요합니다.`,
          `${inning}배트가 답을 못 찾았습니다. 공격 흐름 다시 잡아야 합니다.`,
          `${inning}아웃카운트 하나가 꽤 무겁게 느껴집니다.`,
          `${inning}이 타이밍 삼진은 팬들 한숨이 나올 수밖에 없습니다.`,
          `${inning}다음 타석까지 기다리기 답답한 장면입니다.`,
        ], "le-body"),
      };
    }
  }
  if (input.kind === "homeRun") {
    if (input.isPitching === false) {
      return {
        title: name ? `💥 ${name} 홈런` : "💥 홈런",
        body: pickOffset(seed, [
          `${inning}${name ? `${name}! ` : ""}담장 넘어가는 순간 경기장이 터졌습니다🔥`,
          `${inning}${name ? `${name}의 ` : ""}타구가 그대로 사라졌습니다. 이건 큽니다!`,
          `${inning}홈런입니다! 알림창이 흔들릴 장면이 나왔습니다.`,
          `${inning}${input.myTeamShort} 팬들 일어납니다. 이 타구는 못 참습니다.`,
        ], "le-body"),
      };
    }
    return {
      title: name ? `💥 ${name} 홈런 허용` : "💥 홈런 허용",
      body: pickOffset(seed, [
        `${inning}${name ? `${name} 타구에 ` : ""}응원석 공기가 확 무거워졌습니다. 바로 수습해야 합니다.`,
        `${inning}타구가 넘어갔습니다. 경기장 공기가 확 무거워졌습니다.`,
        `${inning}홈런 허용, 방금 장면은 정말 뼈아픕니다.`,
        `${inning}담장을 넘어갔습니다. 이제 벤치가 답을 내야 합니다.`,
      ], "le-body"),
    };
  }
  if (input.isPitching === true) {
    return {
      title: "🎯 투수 교체",
      body: pickOffset(seed, [
        `${inning}${input.myTeamShort} 투수 교체, 불펜이 바로 불을 꺼야 합니다.`,
        `${inning}마운드가 바뀝니다. 여기서 흐름을 끊어야 합니다.`,
        `${inning}새 투수가 들어옵니다. 첫 타자부터 잡아야 합니다.`,
        `${inning}벤치가 움직였습니다. 이제 공 하나가 더 중요해졌습니다.`,
      ], "le-body"),
    };
  }
  return {
    title: "🎯 상대 투수 교체",
    body: pickOffset(seed, [
      `${inning}상대가 투수를 바꿉니다. 지금이 새 공 적응 전 찬스입니다.`,
      `${inning}마운드 교체, ${input.myTeamShort} 타선이 바로 흔들어야 합니다.`,
      `${inning}상대 벤치가 먼저 움직였습니다. 이 틈을 놓치면 안 됩니다.`,
      `${inning}새 투수 올라옵니다. 초구부터 압박해야 합니다.`,
    ], "le-body"),
  };
}
