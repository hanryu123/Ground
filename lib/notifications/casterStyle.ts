/**
 * 득점 알림 말투(캐스터 스타일) — 유저가 알림 설정에서 고른다.
 * 서버·클라이언트가 같이 쓰므로 서버 전용 import 금지.
 *
 * 저장 위치: 구독 topics JSON 의 `casterStyle` (PushSubscription / NativePushToken).
 * 값이 없거나 모르는 값이면(말투 고르기 전부터 쓰던 유저 포함) 맨 위 "analyst"(담백한 해설위원).
 */

export type CasterStyle = "analyst" | "diehard" | "caster" | "tiger" | "elon";

export const CASTER_STYLES: ReadonlyArray<{ id: CasterStyle; label: string; sample: string }> = [
  { id: "analyst", label: "담백한 해설위원", sample: "3회말 역전입니다. 집중력이 좋았습니다." },
  { id: "diehard", label: "골수팬", sample: "{player} 사랑해ㅠㅠ 역전이다 오늘부터 내 최애 결혼하자" },
  { id: "caster", label: "열혈 캐스터", sample: "역전 허용… 아 이 (삐-)!!! 죄송합니다 너무 화가 나서요!!!" },
  { id: "tiger", label: "호랑이 감독", sample: "역전을 당해?! 다 집합! 정신 어디 두고 왔어!" },
  { id: "elon", label: "일론 머스크", sample: "역전. 계산대로야. 다음 정거장은 화성. 🚀" },
];

/** 골수팬 예시 문장에 넣을 팀별 간판 선수 — 말투 고르는 화면 예시에만 쓴다 (실제 알림은 득점한 선수 이름) */
const FAN_FAVORITE: Record<string, string> = {
  lg: "박해민",
  samsung: "구자욱",
  kt: "안현민",
  doosan: "곽빈",
  kia: "김도영",
  hanwha: "문동주",
  nc: "박민우",
  lotte: "레이예스",
  ssg: "최정",
  kiwoom: "서건창",
};

export function casterStyleSample(style: CasterStyle, teamId: string | null | undefined): string {
  const sample = CASTER_STYLES.find((s) => s.id === style)?.sample ?? "";
  return sample.replace("{player}", FAN_FAVORITE[teamId ?? ""] ?? "우리 에이스");
}

export const CASTER_STYLE_STORAGE_KEY = "ground-caster-style";

export function parseCasterStyle(value: unknown): CasterStyle {
  return CASTER_STYLES.some((style) => style.id === value) ? (value as CasterStyle) : "analyst";
}

export function casterStyleFromTopics(topics: unknown): CasterStyle {
  if (!topics || typeof topics !== "object") return "analyst";
  return parseCasterStyle((topics as { casterStyle?: unknown }).casterStyle);
}

/** 구독을 갱신할 때 저장할 casterStyle — 요청에 없으면(앱이 켜질 때마다 하는 재등록 등) 저장돼 있던 값을 지킨다 */
export function resolveStoredCasterStyle(requested: unknown, storedTopics: unknown): { casterStyle?: CasterStyle } {
  if (requested !== undefined) return { casterStyle: parseCasterStyle(requested) };
  if (storedTopics && typeof storedTopics === "object" && "casterStyle" in storedTopics) {
    return { casterStyle: casterStyleFromTopics(storedTopics) };
  }
  return {};
}
