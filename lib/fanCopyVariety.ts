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
  "이 기세 그대로 가야죠",
  "다음 타자가 살려줘야 합니다",
  "멘탈 잡고 반격해야 합니다",
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
- 같은 날 같은 팀 알림끼리 첫 8글자, 결론 문장, 감탄사 구조가 겹치면 실패다.
━━━━━━━━━━━━━━━━━━━`;
}

export function sanitizeBoringFanCopy(text: string, seed: string): string {
  let out = compact(text);
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
    ["이 기세 그대로 가야죠", "이 장면을 그냥 흘려보내면 안 됩니다"],
    ["다음 타자가 살려줘야 합니다", "벤치가 바로 다음 답을 꺼내야 합니다"],
    ["멘탈 잡고 반격해야 합니다", "흔들릴 시간 없이 바로 다시 붙어야 합니다"],
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

  if (FORBIDDEN_CLICHES.some((phrase) => out.includes(phrase))) {
    const image = pickOffset(seed, IMAGE_FRAMES, "sanitize-image");
    out = `${image}까지 조용해진 느낌입니다. 오늘 장면은 좀 다르게 기억되겠습니다.`;
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
  const extra = statHint && statHint !== middle ? `${statHint}. ` : "";
  const rain = input.wasRainSuspended ? "우천 중단까지 섞인 경기라 집중력의 무게도 더 컸습니다. " : "";
  const closer = pickOffset(seed, input.tone === "win" ? closersWin : input.tone === "loss" ? closersLoss : closersDraw, "pg-close");
  return {
    headline,
    content: sanitizeBoringFanCopy(`${opener} ${rain}${middle}. ${extra}${closer}`, seed),
  };
}

export function buildVariedPregameFallback(input: PregameFallbackInput): { title: string; lines: string[] } {
  const seed = `${input.seed}:${input.team}:${input.opp}:${input.starter ?? ""}`;
  const title = pickOffset(seed, [
    "🎙️ 오늘 경기, 어디서 갈리나",
    "🔥 오늘의 편파 관전 포인트",
    "⚾ 경기 전 알림창 예열",
    "🏟️ 오늘도 팬 모드입니다",
    "📌 첫 공 전에 볼 장면",
    "🎧 중계 켜기 전 체크",
  ], "pv-title");
  const starterLine = input.starter
    ? pickOffset(seed, [
        `선발 ${input.starter}, 첫 이닝부터 ${input.opp} 타선을 조용하게 만들어야 합니다.`,
        `${input.starter}의 초반 제구가 오늘 응원석 온도를 정할 겁니다.`,
        `오늘 마운드의 첫 표정은 ${input.starter}에게 달려 있습니다.`,
        `${input.starter}가 초구부터 스트라이크를 꽂으면 경기 공기가 달라집니다.`,
      ], "pv-starter")
    : `${input.team} 마운드가 초반부터 경기 공기를 잡아야 합니다.`;
  const momentumLine = input.streakLabel && /연승|연패/.test(input.streakLabel)
    ? `${input.team}, 현재 ${input.streakLabel} 흐름입니다. 오늘은 분위기를 직접 반전시켜야 합니다.`
    : `${input.team} 최근 체감은 이렇습니다. ${input.momentumSummary}`;
  const matchupLine = pickOffset(seed, [
    `${input.opp}전은 첫 득점이 커 보이는 매치업입니다.`,
    `${input.opp} 상대로는 한 번 잡은 분위기를 길게 끌고 가야 합니다.`,
    `${input.opp} 덕아웃을 먼저 조용하게 만드는 게 오늘 출발점입니다.`,
    `${input.opp}전, 타선이 초반부터 알림창을 흔들어줘야 합니다.`,
    `${input.opp} 상대라면 팬들도 자연스럽게 더 예민해집니다.`,
  ], "pv-matchup");
  const closer = pickOffset(seed, [
    `${input.time ?? "경기 시간"} 시작, 중계 켜두면 알림이 같이 따라붙겠습니다.`,
    `오늘은 첫 이닝부터 같이 보셔야 재미가 납니다.`,
    `팬 모드 켜두세요. 오늘 알림창은 가만히 있지 않을 겁니다.`,
    `초반 세 타석만 봐도 오늘 냄새가 나올 겁니다.`,
    `경기 시작 전부터 이미 응원석 온도는 올라가 있습니다.`,
  ], "pv-close");
  return {
    title,
    lines: [momentumLine, starterLine, matchupLine, closer].map((line) => clip(sanitizeBoringFanCopy(line, seed), 88)),
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
        `${inning}${name ? `${name}에게 ` : ""}홈런을 내줬습니다. 이건 바로 수습해야 합니다.`,
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
