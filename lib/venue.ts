/**
 * 구장 풀네임 → 짧은 **도시/지역** 라벨 (경기장 풀명 제외).
 * Hero / Schedule 등에서 공통 사용.
 */
export function venueCityOnly(stadium: string | undefined | null): string {
  if (!stadium) return "";
  const s = stadium.trim();
  if (s.includes("잠실")) return "잠실";
  if (s.includes("사직")) return "부산";
  if (s.includes("고척")) return "고척";
  if (s.includes("수원")) return "수원";
  if (s.includes("대구")) return "대구";
  if (s.includes("창원")) return "창원";
  if (s.includes("대전")) return "대전";
  if (s.includes("광주")) return "광주";
  if (s.includes("문학")) return "인천";
  if (s.includes("울산")) return "울산";
  const head = s.split(/\s+/)[0];
  return head ?? "";
}

/** 짧은 지역 + (다르면) 풀 구장명 — UI 두 줄용 */
export function venueDisplayLines(stadium: string | undefined | null): {
  primary: string;
  secondary: string;
} {
  const full = (stadium ?? "").trim();
  if (!full) return { primary: "", secondary: "" };
  const short = venueCityOnly(full) || "";
  const primary = short || full;
  const secondary = full !== primary ? full : "";
  return { primary, secondary };
}
