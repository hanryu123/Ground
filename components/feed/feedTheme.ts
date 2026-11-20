import type { Team } from "@/lib/teams";

export type FeedTheme = {
  /** 피드 배경 — iOS 그룹 배경 (라이트/다크는 globals.css 가 고른다) */
  background: string;
  /** 본문색에 투명도를 준 값 */
  text: (alpha: number) => string;
  /** 칩·태그 강조 — 구단 색 중 지금 모드에서 보이는 값 */
  accent: string;
  accentText: string;
};

/**
 * 피드 블록(숏츠·뉴스·예매 연습) 색. 예전엔 히어로 하단 색(검정/흰색)을 이어받았지만,
 * 이제 앱 전체가 시스템 색이라 CSS 변수만 돌려준다.
 */
export function getFeedTheme(_team: Team): FeedTheme {
  return {
    background: "var(--sys-bg)",
    text: (alpha) => `rgb(var(--label-rgb) / ${alpha})`,
    accent: "var(--club-tint)",
    accentText: "#ffffff",
  };
}
