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
  /**
   * 선발 투수 이름 (라이브 KBO 데이터 주입).
   *  - 값이 있으면        → "a professional baseball pitcher named <X>" 토큰
   *  - null/undefined 면 → 범용 카리스마 에이스 실루엣 토큰으로 자동 폴백
   *  - 빈 문자열 / "미정" / "TBD" 도 폴백 대상 (kbo.safeStarter 와 동일 정책)
   */
  starterName?: string | null;
};

/** 선발 투수 토큰 — 데이터 유무에 따라 안전 분기 (사장님 오더 반영) */
function starterToken(name?: string | null): string {
  const t = (name ?? "").trim();
  if (!t || t === "미정" || t === "TBD" || t === "未定") {
    // 미정 일 때: 특정 인물을 지칭하지 않는 범용 에이스 실루엣
    return "a charismatic professional baseball player in a dynamic action pose";
  }
  // 선발 확정 시: 인물 이름 부착. flux 는 한국어 이름도 토큰으로 받아준다.
  return `a professional baseball pitcher named ${t}`;
}

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
 * 2026 프리미엄 화보 — 사장님 결정으로 photo-realism → "에너지 폭발 일러스트
 * 히어로 포스터" 로 스타일 피벗. ground_05 학습 캡션
 * ("abstract red and blue light streaks conveying intense motion and energy,
 * cinematic sports illustration style") 의 어휘를 그대로 차용해 LoRA 가
 * 학습한 일러스트 시각 코드를 정확히 점화시킨다.
 *
 *  ※ 의도적으로 "photorealistic / kodak portra / Phase One / 35mm film grain"
 *    같은 photoreal 강제 토큰을 전부 제거. flux T5 인코더는 등장한 토큰을
 *    그대로 컨디셔닝에 흡수하므로, 피벗 후엔 단어 자체가 prompt 에 등장하면
 *    안 된다 ("photoreal" 단어 한 줄이 나머지 일러스트 가중치를 깎아먹음).
 */
const BASE_STYLE = [
  // 핵심 스타일 정의 (사장님 오더 — image_13.png 톤)
  "dynamic illustrative sports art",
  "stylized hero poster style",
  "cinematic sports illustration style",
  "charged with electric energy streaks in vivid blue and red conveying intense motion and energy",
  "dynamic particle effects swirling around the player",
  "abstract red and blue light streaks trailing behind his motion",
  "rich painterly depth and volumetric shading on the rendered figure",
  "three-dimensional sculpted body rendering with strong form lighting",
  "highly detailed illustrative texture on the uniform fabric and team cap",
  "8k resolution sharp linework",
  // 무드 / 색감
  "mysterious mood, heroic and intense atmosphere",
  "dramatic rim backlight wrapping his shoulders and arms",
  "deep blacks and saturated highlights",
  "high-contrast cinematic chiaroscuro shading",
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
 * SHADOW_CORE — 사장님 2차 학습 데이터의 핵심 시각 코드.
 *  프롬프트 최앞단(트리거 직후)에 박아 LoRA 가 학습한 "묵직한 음영" 토큰을
 *  무조건 점화시킨다. 이게 빠지면 flux 가 종종 밝고 평탄한 노출로 회귀.
 *
 *  ※ 모든 모드에 공통 적용. 기존 POSE_STYLE / MOOD 보다 우선순위 높음.
 */
const SHADOW_CORE = [
  "face heavily obscured by deep shadow",
  "cinematic rim lighting",
  "dark mysterious silhouette",
  "low-key lighting",
  "moody chiaroscuro",
  "high contrast cinematic shadow language",
].join(", ");

/**
 * 액션 컷 강제 — "증명사진 + 멈춰있는 포즈" 동시 퇴출.
 *
 *  ※ 부정형(`absolutely never a static …`) 키워드는 의도적으로 삭제했다.
 *    flux-dev 의 T5 텍스트 인코더는 "no/never" 같은 부정어를 의미적으로
 *    처리하지 못하고, 뒤에 붙은 "static / standing still / facing camera"
 *    토큰만 컨디셔닝에 들어가서 **오히려 정적 포즈 확률을 끌어올린다**.
 *    → 같은 의도를 양성문(explosive motion / body torqued / mid-air)
 *      으로만 표현해서 "정적 포즈" 토큰 자체를 프롬프트에서 제거.
 */
const ACTION_STYLE = [
  "extremely dynamic action pose",
  "extremely dynamic physiology",
  "explosive motion",
  "follow-through stance after a powerful swing or pitch",
  "diving",
  "mid-swing",
  "powerful motion",
  "captured in explosive mid-action sports moment",
  "body fully extended in motion",
  "either a powerful pitching wind-up with body torqued and face turned toward the catcher away from the camera",
  "or mid-swing batting with hips rotated and the cap brim casting a deep shadow over his eyes",
  "or sprinting toward base photographed from behind kicking up dust and dirt",
  "or a low-crouch fielding stance from rear three-quarter angle",
  "or a full-body horizontal diving catch with arms outstretched",
  "motion blur on the bat or glove suggesting kinetic energy",
  "every limb caught in mid-action",
].join(", ");

/**
 * BODY_PRESENCE — "투명 인간 / 빈 유니폼" hallucination 의 양성형 카운터.
 *
 *  사장님 3차 오더: 가끔 사람 없이 유니폼만 둥둥 뜨는 ghost-uniform 버그가
 *  나옴. flux 가 negative prompt 를 못 받기 때문에 "empty uniform / floating
 *  clothes" 같은 단어를 prompt 에 넣으면 오히려 그 컨셉이 강화됨.
 *  → 반대 의미("실재하는 근육질 신체가 유니폼 안에 명확히 존재한다")를
 *    가장 앞단(트리거+SHADOW_CORE 직후)에 박아 신체 존재를 강제 점화.
 */
const BODY_PRESENCE = [
  "a single complete athletic male baseball player",
  "dynamic athletic body physique",
  "muscular body definition under uniform",
  "broad shoulders, defined chest, strong arms and powerful legs visible inside the jersey and pants",
  "the uniform is worn by a real, physically present athlete with clear human proportions",
  "head, neck, torso, arms and legs all rendered as one continuous solid figure",
  "human jawline visible just beneath the cap brim shadow",
  "weight, mass and balance of a living athlete in motion",
].join(", ");

/** 스타일 전환 키워드 — 요청한 문구를 프롬프트 앞단에 고정 */
const ILLUSTRATIVE_FRONT_STYLE = [
  "dynamic illustrative hero sports art",
  "charged with electric energy streaks",
  "particle effects",
  "mysterious face shadowed by cap",
].join(", ");

/**
 * 환경 강제 — 스타디움 환경으로 화면을 100% 채워버린다 (흰배경 토큰 자체 제거).
 *
 *  ※ 직전 버전엔 "absolutely no white background, no plain backdrop" 같은
 *    부정문이 들어 있었는데, flux 인코더가 "white background / plain
 *    backdrop" 토큰을 그대로 흡수해서 **오히려 흰 배경을 유도**하는
 *    역효과가 확인됨. → 부정문 제거하고, 그 자리를 양성문으로 가득 채워
 *    프레임 전체를 stadium 톤으로 압도한다.
 */
const DYNAMIC_ENV = [
  "background completely filled with a real outdoor baseball stadium at dusk",
  "deep navy night sky overhead",
  "massive stadium floodlights cutting volumetric light shafts through dust haze",
  "blurred crowd silhouettes packing the stands behind him",
  "dirt infield, chalk lines, and outfield grass visible in the lower frame",
  "swirling stadium dust, atmospheric fog, and warm sodium-vapor stadium glow",
  "stadium architecture and floodlight rigs framing the background edges",
  "background occupies the entire frame from edge to edge",
  "every pixel of the background is stadium environment",
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
  "vivid team color saturation across the jersey, painterly fabric folds",
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
 * POSITIVE_GUARDS — (구) BAKED_NEGATIVES 를 전면 양성문으로 재작성.
 *
 *  ── 왜 부정문을 다 들어냈나 ──
 *   flux-dev 는 negative_prompt 파라미터를 받지 않는다. 그래서 직전 버전엔
 *   "no white background, no headless, no static pose" 같은 부정문 22개를
 *   prompt 끝에 박아뒀는데, T5 인코더가 "no" 를 구문으로 인식하지 못해
 *   "white background / headless / static pose" 토큰만 컨디셔닝에 들어가서
 *   **오히려 그 컨셉이 강화**되는 역효과가 출력물에서 확인됨 (LG 흰배경 케이스).
 *   → 같은 의미를 전부 양성문으로만 표현. 금지하고 싶은 단어는 프롬프트에
 *     아예 등장시키지 않는 게 핵심 룰.
 */
const POSITIVE_GUARDS = [
  // 사람 증발 방지 — empty uniform / floating clothes / garment only / no human form
  //                및 headless/disembodied/torso-only 계열의 양성형 카운터
  "single complete human athletic body fully present in the center of the frame",
  "the player's full body from head to legs is rendered as one continuous solid human figure",
  "uniform is clearly worn by a physically present athlete, not a hollow garment",
  "defined neck connects the head naturally to the torso and shoulders",
  "both arms and both legs are visible with anatomically coherent human joints",
  "clear human silhouette with natural weight and balance in motion",
  // 인물 중심 구도 강제
  "framed as a full-body or three-quarter-body action shot, not a cropped torso portrait",
  "the figure occupies the visual center as the main subject in motion",
  // 얼굴 무드 + 스타일 유지
  "mysterious face shadowed by cap brim in dramatic low-key lighting",
  "dynamic illustrative hero sports art with charged electric energy streaks and particle effects",
  // 손/팔 hallucination 보정
  "five fingers per hand, anatomically correct human arms holding the bat or glove",
].join(", ");

/**
 * (deprecated for flux-dev — kept for SDXL fallback only)
 *  - 사람-동물 hybrid 차단 (anthropomorphic / furry / mascot 류)
 *  - 정면 얼굴 / 표정 클로즈업 차단 → 음영·뒷모습으로 자연스럽게 유도
 *  - 텍스트 / 로고 / 품질 이슈 방지
 */
export const NEGATIVE_PROMPT = [
  // 사람 증발 / 유니폼만 둥둥 (사장님 2차 오더)
  "headless",
  "invisible person",
  "disembodied",
  "empty uniform",
  "floating clothes",
  "garment only",
  "no human form",
  "hollow",
  "mannequin",
  "torso only",
  "no body",
  "ghost body",
  "missing person",
  // 화이트 배경 / 스튜디오 컷 (사장님 2차 오더)
  "white background",
  "plain background",
  "solid color background",
  "studio shot",
  "seamless backdrop",
  // 증명사진 / 정적 포즈 (사장님 2차 오더)
  "clear face",
  "bright face",
  "plain photo",
  "looking at camera",
  "passport photo",
  "headshot",
  "standing still",
  "static pose",
  "flat style",
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
  const { meta, mode, triggerWord, masterTrigger, starterName } = input;
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
    // 1) 트리거 군집 — master + team + mode-action (LoRA 토큰 가중치 최우선)
    ...triggers,
    // 2) 스타일 피벗 + 얼굴 음영을 앞단에 배치
    ILLUSTRATIVE_FRONT_STYLE,
    // 3) SHADOW_CORE — 2차 학습 데이터의 핵심 시각 코드
    SHADOW_CORE,
    // 4) 신체 존재 강제 — 투명 인간/빈 유니폼 카운터
    BODY_PRESENCE,
    // 5) 액션 컷 강제 — 증명사진 + 정적 포즈 동시 차단
    ACTION_STYLE,
    // 6) 환경 강제 — 흰 배경 / 스튜디오 컷 구조적 차단
    DYNAMIC_ENV,
    // 7) 메인 피사체 — 사람 (가중치 우위 + furry/animal-head + headless 차단)
    "a real human male professional baseball athlete with a clearly visible body, head and arms",
    "realistic human anatomy, fully human body and skin, head firmly attached to the body",
    // 7.1) 선발 투수 — 라이브 KBO 데이터 주입. 데이터 없으면 자동 폴백 토큰.
    starterToken(starterName),
    // 6) 유니폼 시각 지문 — 팀 식별의 핵심 (LoRA + 텍스트 양면 보강)
    `wearing the official team uniform: ${meta.uniformSignature}`,
    "uniform colors and chest wordmark are sharp, saturated and clearly readable as the team's identity",
    // 7) 포즈 / 카메라 — 얼굴은 가리고 유니폼이 주인공
    POSE_STYLE,
    // 8) 팀 정체성 — 인물 뒤로 빠지는 aura + artistic device (동물 직접 묘사 X)
    `with a subtle cinematic aura of ${meta.spirit} in the background`,
    meta.motif,
    // 9) 컨텍스트 (위치 / 분위기)
    `set in ${meta.city}`,
    "KBO baseball team identity",
    `team color palette: ${colorPalette}`,
    meta.keywords.join(", "),
    MOOD_BY_MODE[mode](meta.primaryColor),
    // 10) 스타일 / 구도
    BASE_STYLE,
    COMP_STYLE,
    // 11) 안전 가드 — 인물 메인 + 동물은 배경 only (전부 양성문으로 표현)
    "the player's uniform is the visual focal point, his face is hidden by shadow or pose, but his body is solid and complete",
    "any animal motif appears only as an atmospheric silhouette woven into the background stadium smoke or floodlight glow, behind the player",
    // 12) POSITIVE_GUARDS — (구) BAKED_NEGATIVES 를 양성문으로 재작성한 가드.
    //     flux T5 인코더가 부정어를 의미적으로 처리 못 하므로, 금지 의도는
    //     반대 의미의 양성 묘사로만 표현해야 의도가 모델에 전달된다.
    POSITIVE_GUARDS,
  ]
    .filter(Boolean)
    .join(", ");
}
