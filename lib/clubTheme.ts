/**
 * 구단 색 — 앱 화면이 쓰는 유일한 출처.
 *
 * 예전엔 lib/teams accent · config/teams primary/secondary 를 화면마다 골라 쓰고,
 * 검은 바탕에서 안 보이는 색(KIA·KT secondary 검정, 두산 남색)을 화면마다 따로 땜질했다.
 * 여기서는 쓰임새별로 이미 검증한 값을 구단마다 직접 적는다.
 *
 *  - field   : 티켓(오늘 경기 패스)·온보딩처럼 구단 색으로 꽉 채우는 면
 *  - stub    : 티켓 절취선 아래 반쪽 — field 보다 한 단계 깊게
 *  - onField : field·stub 위 글자 (WCAG 4.5:1 이상)
 *  - tint    : 시스템 배경(라이트 #F2F2F7 / 다크 #000) 위 선택·강조 — 두 모드 모두에서 보이는 값
 */
export type ClubTheme = {
  field: string;
  stub: string;
  onField: string;
  tintLight: string;
  tintDark: string;
};

const CLUBS: Record<string, ClubTheme> = {
  lg: { field: "#C30452", stub: "#9C0342", onField: "#FFFFFF", tintLight: "#C30452", tintDark: "#FF3D8B" },
  samsung: { field: "#074CA1", stub: "#053A7C", onField: "#FFFFFF", tintLight: "#074CA1", tintDark: "#4D8DF0" },
  kt: { field: "#1D1D1F", stub: "#E21F26", onField: "#FFFFFF", tintLight: "#E21F26", tintDark: "#FF4A4F" },
  doosan: { field: "#131230", stub: "#0A0A1F", onField: "#FFFFFF", tintLight: "#131230", tintDark: "#8C8BF0" },
  kia: { field: "#EA0029", stub: "#B80020", onField: "#FFFFFF", tintLight: "#D70026", tintDark: "#FF4D63" },
  hanwha: { field: "#FF6600", stub: "#E05500", onField: "#1C1C1E", tintLight: "#D45400", tintDark: "#FF8A3D" },
  nc: { field: "#315288", stub: "#233D68", onField: "#FFFFFF", tintLight: "#315288", tintDark: "#6E95D8" },
  lotte: { field: "#041E42", stub: "#DA291C", onField: "#FFFFFF", tintLight: "#DA291C", tintDark: "#FF5A4D" },
  ssg: { field: "#CE0E2D", stub: "#A30B23", onField: "#FFFFFF", tintLight: "#CE0E2D", tintDark: "#FF4F68" },
  kiwoom: { field: "#820024", stub: "#5E001A", onField: "#FFFFFF", tintLight: "#820024", tintDark: "#E0567A" },
};

const FALLBACK: ClubTheme = CLUBS.kia;

export function getClubTheme(teamId: string | null | undefined): ClubTheme {
  return CLUBS[(teamId ?? "").toLowerCase()] ?? FALLBACK;
}

/** CSS 변수로 내려 주는 값 — globals.css 가 라이트/다크에 맞춰 --club-tint 를 고른다 */
export function clubCssVars(teamId: string | null | undefined): Record<string, string> {
  const c = getClubTheme(teamId);
  return {
    "--club-field": c.field,
    "--club-stub": c.stub,
    "--club-on-field": c.onField,
    "--club-tint-light": c.tintLight,
    "--club-tint-dark": c.tintDark,
  };
}
