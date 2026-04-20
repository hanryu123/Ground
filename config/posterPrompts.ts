/**
 * KBO 10구단 — 화보 프롬프트 메타데이터 (단일 소스)
 *
 * scripts/generate-posters.ts 가 이 메타를 읽어 Replicate 프롬프트를 조립한다.
 * 화면(HeroCard 등) 렌더링과는 무관 — 순수 생성 사이드 데이터.
 *
 * 키는 항상 대문자(영문 약칭, TEAM_CONFIG 와 동일).
 *
 *  ── 디자인 원칙 ──
 *   1. 메인 피사체는 항상 "사람(야구 선수)" — 마스코트 동물이 메인이 되면
 *      얼굴이 사자/공룡/호랑이로 변하는 hybrid hallucination 가 발생.
 *   2. 팀의 정체성(동물/캐릭터)은 `spirit` 명사구로만 짧게 보유하고,
 *      `motif` 한 줄로 "배경의 연기/유니폼 패턴/조명" 같은 예술적 장치로 환원.
 *   3. 색·도시·분위기 키워드는 그대로 유지 — 시각적 일관성 담보.
 */

export type TeamPromptMeta = {
  /**
   * 팀 정체성 — 짧은 명사구.
   * "a majestic lion", "a fierce tiger" 처럼 인물 뒤에 "aura"로 등장하는 형식.
   */
  spirit: string;
  /**
   * spirit 가 어떻게 표현되는지 — 한 줄짜리 예술적 장치(artistic device).
   * 인물의 뒷배경/연기/유니폼 패턴/조명·그림자 같은 보조 요소에만 녹인다.
   */
  motif: string;
  /** 연고지 / 구장 분위기. */
  city: string;
  /** 1차 팀 컬러 (영문 자연어). 모델이 색상 단어를 더 잘 이해함. */
  primaryColor: string;
  /** 2차 보조 컬러. */
  secondaryColor?: string;
  /** 추가 분위기 키워드 (배경/소품/상징물). */
  keywords: string[];
};

export const TEAM_PROMPT_META: Record<string, TeamPromptMeta> = {
  LG: {
    spirit: "a majestic twin lion",
    motif:
      "twin lion silhouettes carved into stadium smoke and neon haze behind him",
    city: "Seoul Jamsil baseball stadium under the city skyline",
    primaryColor: "crimson red",
    secondaryColor: "deep black",
    keywords: ["urban neon glow", "stadium night lights", "regal stance"],
  },
  KIA: {
    spirit: "a fierce Bengal tiger",
    motif:
      "tiger stripe shadows projected across his uniform sleeves, glowing amber backlight",
    city: "Gwangju Champions Field stadium",
    primaryColor: "tiger orange",
    secondaryColor: "jet black",
    keywords: [
      "dynasty banners hanging in the distance",
      "thunderous fireworks behind",
      "crouched predator energy",
    ],
  },
  KT: {
    spirit: "an arcane wizard's lightning aura",
    motif:
      "crackling electric runes glowing faintly around his bat, mystical sparks tracing his silhouette",
    city: "Suwon KT Wiz Park",
    primaryColor: "deep navy blue",
    secondaryColor: "electric red",
    keywords: ["arcane runes glowing", "lightning sparks", "mystical haze"],
  },
  SSG: {
    spirit: "a landing crusader's spirit",
    motif:
      "ghostly crusader armor reflections shimmering in the sea spray behind him",
    city: "Incheon coastal stadium beside the Yellow Sea",
    primaryColor: "ocean red",
    secondaryColor: "gold trim",
    keywords: ["crashing waves in the distance", "sea spray mist", "battle-ready stance"],
  },
  NC: {
    spirit: "a primordial dinosaur's presence",
    motif:
      "subtle tyrannosaurus silhouette emerging from volcanic mist far behind him",
    city: "Changwon NC Park",
    primaryColor: "deep dino blue",
    secondaryColor: "iron grey",
    keywords: ["primal jungle background", "thunderstorm sky", "ancient dominance"],
  },
  DOOSAN: {
    spirit: "a great bear's strength",
    motif:
      "ghost-like grizzly bear silhouette looming in the mountain mist behind him",
    city: "Seoul Jamsil Stadium",
    primaryColor: "navy blue",
    secondaryColor: "pure white",
    keywords: ["snowy mountain ridge backdrop", "stadium spotlights", "stoic strength"],
  },
  SAMSUNG: {
    spirit: "a regal lion's aura",
    motif:
      "lion mane patterns swirling within the golden light around him, faint roar in the wind",
    city: "Daegu Samsung Lions Park",
    primaryColor: "royal blue",
    secondaryColor: "polished silver",
    keywords: ["coliseum architecture", "shafts of golden light", "royal majesty"],
  },
  LOTTE: {
    spirit: "a colossal giant's presence",
    motif:
      "towering giant silhouette barely visible in the harbor sunset far behind him",
    city: "Busan Sajik Stadium near the sea",
    primaryColor: "steel grey",
    secondaryColor: "ocean teal",
    keywords: ["Busan port skyline backdrop", "sunset over the sea", "weathered resilience"],
  },
  HANWHA: {
    spirit: "a soaring eagle",
    motif:
      "eagle-wing-shaped shadows of fire spreading across the dusk sky behind him",
    city: "Daejeon Hanwha Life Eagles Park",
    primaryColor: "fiery orange",
    secondaryColor: "midnight black",
    keywords: ["mountain ridges in the background", "blazing sunset clouds", "predator focus"],
  },
  KIWOOM: {
    spirit: "a masked vigilante hero's aura",
    motif:
      "dark hero cape silhouette hovering as a shadow behind him, harsh dome spotlights",
    city: "Seoul Gocheok Sky Dome",
    primaryColor: "burgundy",
    secondaryColor: "deep grey",
    keywords: ["domed stadium interior", "harsh spotlights", "silent legend pose"],
  },
};

export function getPromptMeta(
  teamId: string | null | undefined
): TeamPromptMeta | null {
  if (!teamId) return null;
  return TEAM_PROMPT_META[teamId.toUpperCase()] ?? null;
}
