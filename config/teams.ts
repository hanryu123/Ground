/**
 * KBO 10구단 — 슬로건 / 로고 베이스명 설정 (단일 소스)
 *
 * 화보는 더 이상 실시간 생성하지 않는다. 대신 사전 제작된 정적 이미지를
 * `public/images/posters/${teamId}_${weather}.jpg` 규칙으로 보관한다 (lib/posterImage.ts 참조).
 *
 * 키는 항상 대문자(영문 약칭)를 사용한다. 조회 시에는 `getTeamConfig()`가
 * 소문자도 자동으로 정규화해주므로 호출 측은 case 구분 없이 사용 가능.
 */

export type GenerateMode = "ready" | "victory";

export type TeamConfig = {
  teamId: string;
  fullName: string;
  /** 일반(맑음) / 출전 카피 — 한 줄로 적으면 단어별 자동 라인 분할 */
  sloganReady: string;
  /** 승리 카피 */
  sloganVictory: string;
  /** 비 오는 날 전용 슬로건. 미지정 시 sloganReady로 폴백. */
  sloganRainy?: string;
  /**
   * 로고 파일 베이스명(확장자 제외, /images/logos/ 기준).
   * 실제 디스크에 떨어진 파일과 정확히 일치시켜라. 예: "Lg" → /images/logos/Lg.{svg|png|...}
   * 없으면 자동 후보 생성기가 여러 변형을 시도한다.
   */
  logoBasename?: string;
};

const c = (cfg: TeamConfig): TeamConfig => cfg;

export const TEAM_CONFIG: Record<string, TeamConfig> = {
  LG: c({
    teamId: "LG",
    fullName: "LG TWINS",
    sloganReady: "SEOUL IS OURS",
    sloganVictory: "CHAMPIONS OF SEOUL",
    sloganRainy: "RAIN ONLY MAKES US LOUDER",
    logoBasename: "Lg",
  }),
  KIA: c({
    teamId: "KIA",
    fullName: "KIA TIGERS",
    sloganReady: "THE NEW DYNASTY",
    sloganVictory: "V12 TRIUMPHANT",
    sloganRainy: "TIGERS LOVE THE STORM",
    logoBasename: "Kia",
  }),
  KT: c({
    teamId: "KT",
    fullName: "KT WIZ",
    sloganReady: "MAGIC RISES",
    sloganVictory: "WIZARDS WIN",
    sloganRainy: "SPELLS IN THE RAIN",
    logoBasename: "KT",
  }),
  SSG: c({
    teamId: "SSG",
    fullName: "SSG LANDERS",
    sloganReady: "OCEAN BORN",
    sloganVictory: "LANDERS REIGN",
    sloganRainy: "TIDE & RAIN, ONE SOUL",
    logoBasename: "SSG",
  }),
  NC: c({
    teamId: "NC",
    fullName: "NC DINOS",
    sloganReady: "DAWN OF DINOS",
    sloganVictory: "NEW ERA CROWNED",
    sloganRainy: "STORM-BORN",
    logoBasename: "NC",
  }),
  DOOSAN: c({
    teamId: "DOOSAN",
    fullName: "DOOSAN BEARS",
    sloganReady: "BEARS NEVER BOW",
    sloganVictory: "DYNASTY RESTORED",
    sloganRainy: "BEARS DANCE IN THE RAIN",
    logoBasename: "Doosan",
  }),
  SAMSUNG: c({
    teamId: "SAMSUNG",
    fullName: "SAMSUNG LIONS",
    sloganReady: "LIONS RISE",
    sloganVictory: "KING OF THE FIELD",
    sloganRainy: "LIONS UNDER GREY SKY",
    logoBasename: "Samsung",
  }),
  LOTTE: c({
    teamId: "LOTTE",
    fullName: "LOTTE GIANTS",
    sloganReady: "GIANTS ARE BACK",
    sloganVictory: "BUSAN ROARS",
    sloganRainy: "BUSAN RAIN, BUSAN ROAR",
    logoBasename: "Lotte",
  }),
  HANWHA: c({
    teamId: "HANWHA",
    fullName: "HANWHA EAGLES",
    sloganReady: "EAGLES ASCEND",
    sloganVictory: "SKY IS OURS",
    sloganRainy: "EAGLES RIDE THE STORM",
    // 디스크 파일은 "Hanhwa.svg"로 들어와 있어 명시 매핑한다.
    logoBasename: "Hanhwa",
  }),
  KIWOOM: c({
    teamId: "KIWOOM",
    fullName: "KIWOOM HEROES",
    sloganReady: "HEROES UNTOLD",
    sloganVictory: "LEGEND WRITTEN",
    sloganRainy: "HEROES IN THE DOWNPOUR",
    logoBasename: "Kiwoom",
  }),
};

/**
 * 로고 매칭 규칙 (LogoImage가 결정론적으로 시도하는 후보 체인):
 *   베이스 후보:  logoBasename → Capitalize(teamId) → lower → UPPER
 *   확장자 후보:  svg → png → webp → jpg → jpeg
 *   onError 시 자동 다음 후보. 모두 실패 시 console.error + 텍스트 폴백.
 *  → 디스크 파일과 다른 케이스/오타가 있는 경우(예: "Hanhwa.svg")만
 *    `logoBasename`을 명시하면 충분하다. 자세한 로직은 `components/LogoImage.tsx`.
 */

/** 대/소문자 어떤 형식이 들어와도 매핑되는 안전한 조회 헬퍼 */
export function getTeamConfig(id: string | null | undefined): TeamConfig | null {
  if (!id) return null;
  return TEAM_CONFIG[id.toUpperCase()] ?? null;
}

/**
 * 모드/날씨별 슬로건 픽커.
 *  - isRainy === true 이고 sloganRainy 가 있으면 우천 슬로건 우선
 *  - 그 외엔 mode 기반 (victory > ready)
 */
export function pickSlogan(
  id: string | null | undefined,
  mode: GenerateMode,
  isRainy: boolean = false
): string | null {
  const cfg = getTeamConfig(id);
  if (!cfg) return null;
  if (isRainy && cfg.sloganRainy) return cfg.sloganRainy;
  return mode === "victory" ? cfg.sloganVictory : cfg.sloganReady;
}

/**
 * 매거진 커버용 표시 라인 분할.
 * - 데이터에 \n이 있으면 그대로 사용
 * - 없으면 단어별로 한 줄씩 (`SEOUL IS OURS` → ["SEOUL", "IS", "OURS"])
 */
export function splitSloganForDisplay(slogan: string): string[] {
  if (!slogan) return [];
  if (slogan.includes("\n")) return slogan.split("\n");
  return slogan.split(/\s+/).filter(Boolean);
}
