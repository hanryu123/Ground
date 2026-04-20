/**
 * Replicate 프롬프트 조립기 — `hanryu123/ground.master` LoRA 전용.
 *
 *  ── 트리거 합성 (학습된 토큰 그대로 활성화) ──
 *   1. masterTrigger ("ground")            — LoRA 본체 활성화
 *   2. teamTrigger   ("ground.lg" 등)      — 팀 정체성 (유니폼 / 컬러 / 도시)
 *   3. modeTrigger   ("ground.victory" 등) — 모드별 분위기 (선택)
 *
 *  ── 인물 중심 ──
 *   - 동물(사자/공룡/곰 등) 직접 묘사 금지.
 *   - 팀 마스코트는 `meta.spirit` (짧은 명사) → `meta.motif` (배경 artistic device) 로만 환원.
 *   - 음영/뒷모습으로 얼굴 숨겨서 furry / animal-head hallucination 까지 차단.
 */

import type { TeamPromptMeta } from "../../config/posterPrompts";

export type PromptMode = "morning" | "night-victory" | "night-default";

export type BuildPromptInput = {
  teamId: string;
  mode: PromptMode;
  meta: TeamPromptMeta;
  /** 팀별 LoRA 트리거 — 학습 시 폴더명. 예: "ground.lg", "ground. KT". */
  triggerWord?: string;
  /** 마스터 LoRA 트리거 — env `REPLICATE_API_TRIGGER_WORD`. 보통 "ground". */
  masterTrigger?: string;
};

/**
 * 모드별 보조 트리거 — `expand_dataset_with_refs.py` 가 학습시킨 카테고리.
 * 학습 자료에 동일 토큰의 무드 사진이 있을 때만 효과 발휘.
 */
const MODE_TRIGGER: Record<PromptMode, string> = {
  morning: "ground.sunset",
  "night-victory": "ground.victory",
  "night-default": "ground.night",
};

const BASE_STYLE = [
  "cinematic sports magazine cover",
  "dramatic chiaroscuro lighting",
  "ultra detailed",
  "photorealistic",
  "35mm film grain",
  "shot on Hasselblad H6D",
  "8k hyperdetailed",
].join(", ");

const COMP_STYLE = [
  "vertical composition",
  "mobile poster aspect ratio 9:16",
  "low camera angle from behind",
  "depth of field",
  "lens flare",
  "magazine cover composition with negative space top and bottom for typography",
].join(", ");

/**
 * 인물 포즈/카메라 — 얼굴은 가리고 유니폼이 주인공이 되도록.
 * AI 가 만드는 얼굴은 종종 무너지거나 어색하므로 의도적으로 음영/뒷모습으로 회피.
 */
const POSE_STYLE = [
  "back view of the player, viewed from behind",
  "or three-quarter rear angle",
  "face hidden in deep shadow or turned away from camera",
  "broad shoulders and back fully visible",
  "uniform jersey and team cap clearly the focal point",
  "uniform fabric texture, stitching detail, vivid team color saturation",
  "strong silhouette against the light",
].join(", ");

const MOOD_BY_MODE: Record<PromptMode, (color: string) => string> = {
  morning: () =>
    [
      "golden hour sunrise as backlight",
      "warm rim light outlining his shoulders and cap from behind",
      "his front is in soft shadow",
      "peaceful pre-game tension",
      "anticipation, calm before the storm",
    ].join(", "),
  "night-victory": (color) =>
    [
      "triumphant championship moment",
      "confetti rain and gold streamers around him",
      "fireworks bursting behind, blinding floodlights",
      "ecstatic crowd silhouettes in the background",
      `explosive ${color} and gold light burst behind him casting his body into glowing silhouette`,
      "fists raised in victory",
    ].join(", "),
  "night-default": () =>
    [
      "moody night atmosphere",
      "stadium lights against deep navy sky",
      "contemplative quiet after a tough game",
      "deep cinematic shadows obscuring his face",
      "lone figure standing in stadium light, only the back of his uniform illuminated",
    ].join(", "),
};

/**
 * Negative prompt
 *  - 사람-동물 hybrid 차단 (anthropomorphic / furry / mascot 류)
 *  - 정면 얼굴 / 표정 클로즈업 차단 → 음영·뒷모습으로 자연스럽게 유도
 *  - 텍스트 / 로고 / 품질 이슈 방지
 */
export const NEGATIVE_PROMPT = [
  // 사람-동물 hybrid 방지
  "anthropomorphic",
  "furry",
  "humanoid animal",
  "animal head on human body",
  "animal head",
  "animal face",
  "beast face",
  "lion face",
  "tiger face",
  "bear face",
  "eagle face",
  "dinosaur head",
  "reptile skin texture",
  "fur on face",
  "fur on body",
  "feathers on body",
  "scales on skin",
  "werewolf",
  "mascot costume",
  "team mascot suit",
  "cartoon character",
  "non-human face",
  "multiple heads",
  "animal ears on human",
  // 정면 얼굴 / 표정 클로즈업 회피 → 음영·뒷모습 강제
  "frontal face close-up",
  "facing camera directly",
  "clear visible face",
  "eye contact with camera",
  "smiling face",
  "detailed facial features",
  "face portrait",
  "headshot composition",
  // 텍스트 / 로고 방지
  "text",
  "words",
  "letters",
  "watermark",
  "signature",
  "logo",
  // 품질 방지
  "low quality",
  "blurry",
  "out of focus",
  "distorted anatomy",
  "deformed anatomy",
  "extra limbs",
  "duplicate",
  "cropped awkwardly",
  "amateur",
].join(", ");

export function buildPrompt(input: BuildPromptInput): string {
  const { meta, mode, triggerWord, masterTrigger } = input;
  const colorPalette = meta.secondaryColor
    ? `${meta.primaryColor} and ${meta.secondaryColor}`
    : meta.primaryColor;

  // 트리거 3종을 맨 앞에 직렬로 배치 — LoRA 토큰 가중치 최우선.
  // 중복(예: master == team) 은 자동 제거.
  const triggers = Array.from(
    new Set(
      [
        masterTrigger?.trim(),
        triggerWord?.trim(),
        MODE_TRIGGER[mode],
      ].filter((t): t is string => Boolean(t && t.length))
    )
  );

  return [
    // 1) 트리거 군집 — master + team + mode
    ...triggers,
    // 2) 메인 피사체 — 사람 (가중치 우위 + furry/animal-head 차단)
    "a real human male professional baseball athlete",
    "realistic human anatomy, fully human body and skin",
    `wearing a professional ${colorPalette} team uniform with team cap`,
    "holding a baseball bat naturally",
    // 3) 포즈 / 카메라 — 얼굴은 가리고 유니폼이 주인공
    POSE_STYLE,
    // 4) 팀 정체성 — 인물 뒤로 빠지는 aura + artistic device (동물 직접 묘사 X)
    `with a subtle cinematic aura of ${meta.spirit} in the background`,
    meta.motif,
    // 5) 컨텍스트 (위치 / 분위기)
    `set in ${meta.city}`,
    "KBO baseball team identity",
    `team color palette: ${colorPalette}`,
    meta.keywords.join(", "),
    MOOD_BY_MODE[mode](meta.primaryColor),
    // 6) 스타일 / 구도
    BASE_STYLE,
    COMP_STYLE,
    // 7) 안전 가드 — 인물 메인 + 동물은 배경 only
    "the player's uniform is the visual focal point, his face is hidden by shadow or pose",
    "no animal creatures in the foreground, only their atmospheric silhouettes in the background smoke or stadium lighting",
  ]
    .filter(Boolean)
    .join(", ");
}
