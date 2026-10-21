import { getKboTeamThemeByTeamId } from "@/config/teams";
import type { Team } from "@/lib/teams";

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = hex.trim().replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  const value = Number.parseInt(normalized, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function yiqOf(hex: string): number {
  const rgb = hexToRgb(hex);
  return rgb ? (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 : 0;
}

export type FeedTheme = {
  /** 히어로 아래 피드 배경 — 히어로 하단 그라데이션이 끝나는 색과 맞춘다 */
  background: string;
  text: (alpha: number) => string;
  accent: string;
  accentText: string;
};

/**
 * 피드 블록(뉴스 등) 색. HeroCard 하단은 흰 글씨 팀이면 검정, 검정 글씨 팀(흰 바탕)이면 흰색으로
 * 끝나므로 그 색을 이어받는다.
 */
export function getFeedTheme(team: Team): FeedTheme {
  const theme = getKboTeamThemeByTeamId(team.id);
  const textHex = theme?.text ?? "#FFFFFF";
  const [r, g, b] = hexToRgb(textHex) ?? [255, 255, 255];
  const isDarkText = textHex.toUpperCase() === "#000000";
  const background = isDarkText ? "#FFFFFF" : "#000000";
  // KT(검정)처럼 팀 보조색이 피드 배경과 거의 같으면 칩·태그가 안 보이므로 글자색으로 대신한다
  const teamAccent = theme?.secondary ?? team.accent;
  const accent =
    Math.abs(yiqOf(teamAccent) - yiqOf(background)) < 70 ? textHex : teamAccent;
  const yiq = yiqOf(accent);
  return {
    background,
    text: (alpha) => `rgba(${r}, ${g}, ${b}, ${alpha})`,
    accent,
    accentText: yiq >= 160 ? "#111111" : "#ffffff",
  };
}
