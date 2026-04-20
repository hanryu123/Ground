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
 *
 *  ── ground.action 상시 부착 ──
 *   증명사진/얼빡샷을 구조적으로 차단하기 위해 모든 모드에 action 트리거를
 *   먼저 부착한다. (학습된 액션 컷의 구도 가중치를 끌어올림)
 */
const MODE_TRIGGERS: Record<PromptMode, string[]> = {
  morning: ["ground.action", "ground.sunset"],
  "night-victory": ["ground.action", "ground.victory"],
  "night-default": ["ground.action", "ground.night"],
};

/**
 * 2026 프리미엄 화보 — flux-dev 가 자연어에 강하게 반응하므로
 * 풀 문장 + 키워드 양쪽으로 detail 을 강제한다. SDXL 의 단어 나열형보다
 * flux 는 진짜 사진 metadata 풍 묘사("shot on…", "lit by…") 에 더 잘 반응.
 */
const BASE_STYLE = [
  // 핵심 quality 키워드 (사장님 오더 반영)
  "hyper-realistic",
  "highly detailed",
  "8k resolution",
  "sharp focus",
  "professional sports illustrated cover photography",
  "extremely intricate textures",
  "ultra detailed fine fabric stitching on the jersey",
  "skin pore microdetail",
  "individual eyelash and stubble detail",
  // 카메라 / 조명 (할리우드 영화 톤)
  "cinematic lighting",
  "dramatic rim backlight wrapping his shoulders",
  "hollywood film contrast",
  "deep blacks and clean highlights",
  "shallow depth of field with creamy bokeh",
  "shot on Phase One IQ4 medium format with Schneider 80mm f/1.4",
  "kodak portra 400 film color science",
  "fine 35mm film grain",
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
 * 액션 컷 강제 — "증명사진 퇴출". 정적 스튜디오 포즈를 구조적으로 차단.
 *  - 투구 / 타격 / 주루 / 수비 중 한 가지의 mid-action 으로만 그리게 유도
 *  - 모든 액션은 자연스럽게 얼굴을 옆/아래/등으로 돌리는 구도와 결합
 */
const ACTION_STYLE = [
  "captured in dynamic mid-action sports moment",
  "either a powerful pitching wind-up with body torqued and face turned toward the catcher away from the camera",
  "or mid-swing batting with hips rotated and the cap brim casting a deep shadow over his eyes",
  "or sprinting toward base photographed from behind kicking up dust and dirt",
  "or a low-crouch fielding stance from rear three-quarter angle",
  "motion blur on the bat or glove suggesting kinetic energy",
  "absolutely never a static studio pose, never facing the camera, never a portrait crop",
].join(", ");

/**
 * 인물 포즈/카메라 — 얼굴은 가리고 유니폼이 주인공이 되도록.
 * AI 가 만드는 얼굴은 종종 무너지거나 어색하므로 의도적으로 음영/뒷모습으로 회피.
 *
 * (face shadow boost — heavy)
 *  - cap brim 으로 위에서 떨어지는 그림자가 눈/코 위를 완전히 덮음
 *  - 강한 역광(rim light)으로 얼굴은 흑색 실루엣
 *  - 얼굴은 화면 외곽 1/4 영역으로 cropping
 *  - low-key cinematic lighting + mysterious mood
 */
const POSE_STYLE = [
  "shot from a low rear three-quarter angle behind the player",
  "or pure back view of the player viewed from behind",
  "heavy shadow on his face",
  "his face is hidden by the baseball cap brim shadow",
  "deep cap brim shadow completely covers his eyes and nose",
  "face concealed in heavy chiaroscuro shadow, only the jawline barely visible",
  "dark dramatic silhouette of the player",
  "strong rim backlight turns his face into a near-black silhouette",
  "head turned away from the camera or tilted down",
  "broad shoulders and back fully visible",
  "uniform jersey and team cap clearly the focal point",
  "uniform fabric texture, stitching detail, vivid team color saturation",
  "low-key cinematic lighting, mysterious moody atmosphere",
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
 * 베이크된 네거티브 — flux-dev 는 negative_prompt 입력을 안 받기 때문에
 * "absolutely no …" 형식의 양성문으로 prompt 끝에 박는다. flux 가 의외로
 * 이 패턴을 잘 따라준다. (사장님 면접사진 퇴출 오더 반영)
 */
const BAKED_NEGATIVES = [
  "absolutely no front-facing portrait shot",
  "absolutely no headshot composition",
  "absolutely no passport-photo framing",
  "no clear bright fully-lit face",
  "no eye contact with the camera",
  "no smiling toward the camera",
  "no static studio backdrop",
  "no plastic CGI render look",
  "no cartoon style",
  "no animal head on a human body",
  "no furry creature features",
  "no team mascot costume",
  "no extra limbs or deformed anatomy",
  "no watermark or logo overlay text",
].join(", ");

/**
 * (deprecated for flux-dev — kept for SDXL fallback only)
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

  // 트리거 군집 — master + team + (mode×N) 직렬 배치, LoRA 가중치 최우선.
  // (mode 는 ground.action + ground.<sunset|victory|night> 식으로 2개)
  const triggers = Array.from(
    new Set(
      [
        masterTrigger?.trim(),
        triggerWord?.trim(),
        ...MODE_TRIGGERS[mode],
      ].filter((t): t is string => Boolean(t && t.length))
    )
  );

  return [
    // 1) 트리거 군집 — master + team + mode-action
    ...triggers,
    // 2) 액션 컷 강제 — 증명사진 차단 (사장님 오더)
    ACTION_STYLE,
    // 3) 메인 피사체 — 사람 (가중치 우위 + furry/animal-head 차단)
    "a real human male professional baseball athlete",
    "realistic human anatomy, fully human body and skin",
    // 4) 유니폼 시각 지문 — 팀 식별의 핵심 (LoRA + 텍스트 양면 보강)
    `wearing the official team uniform: ${meta.uniformSignature}`,
    "uniform colors and chest wordmark are sharp, saturated and clearly readable as the team's identity",
    // 5) 포즈 / 카메라 — 얼굴은 가리고 유니폼이 주인공
    POSE_STYLE,
    // 6) 팀 정체성 — 인물 뒤로 빠지는 aura + artistic device (동물 직접 묘사 X)
    `with a subtle cinematic aura of ${meta.spirit} in the background`,
    meta.motif,
    // 7) 컨텍스트 (위치 / 분위기)
    `set in ${meta.city}`,
    "KBO baseball team identity",
    `team color palette: ${colorPalette}`,
    meta.keywords.join(", "),
    MOOD_BY_MODE[mode](meta.primaryColor),
    // 8) 스타일 / 구도
    BASE_STYLE,
    COMP_STYLE,
    // 9) 안전 가드 — 인물 메인 + 동물은 배경 only
    "the player's uniform is the visual focal point, his face is hidden by shadow or pose",
    "no animal creatures in the foreground, only their atmospheric silhouettes in the background smoke or stadium lighting",
    // 10) 베이크된 네거티브 — flux-dev 가 negative_prompt 미지원이라 prompt 안에 박음
    BAKED_NEGATIVES,
  ]
    .filter(Boolean)
    .join(", ");
}
