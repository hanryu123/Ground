/**
 * 득점 알림 말투(캐스터 스타일) — 유저가 알림 설정에서 고른다.
 * 서버·클라이언트가 같이 쓰므로 서버 전용 import 금지.
 *
 * 저장 위치: 구독 topics JSON 의 `casterStyle` (PushSubscription / NativePushToken).
 * 값이 없거나 모르는 값이면 "default"(여유 있는 재치 말투).
 */

export type CasterStyle = "default" | "diehard" | "caster" | "tiger" | "elon" | "analyst";

export const CASTER_STYLES: ReadonlyArray<{ id: CasterStyle; label: string; sample: string }> = [
  { id: "default", label: "기본", sample: "역전입니다. 계산대로예요. 물론 계산은 방금 했습니다." },
  { id: "diehard", label: "골수팬", sample: "박해민 사랑해ㅠㅠ 역전이다 오늘부터 내 최애 결혼하자" },
  { id: "caster", label: "열혈 캐스터", sample: "역전 허용… 아 이 (삐-)!!! 죄송합니다 너무 화가 나서요!!!" },
  { id: "tiger", label: "호랑이 감독", sample: "역전을 당해?! 다 집합! 정신 어디 두고 왔어!" },
  { id: "elon", label: "일론 머스크", sample: "역전. 계산대로야. 다음 정거장은 화성. 🚀" },
  { id: "analyst", label: "담백한 해설위원", sample: "3회말 역전입니다. 집중력이 좋았습니다." },
];

export const CASTER_STYLE_STORAGE_KEY = "ground-caster-style";

export function parseCasterStyle(value: unknown): CasterStyle {
  return CASTER_STYLES.some((style) => style.id === value) ? (value as CasterStyle) : "default";
}

export function casterStyleFromTopics(topics: unknown): CasterStyle {
  if (!topics || typeof topics !== "object") return "default";
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
