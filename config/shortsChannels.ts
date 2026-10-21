/**
 * 피드 숏츠 블록 화이트리스트 채널.
 *
 *  - teams: 이 채널 영상을 어느 팀 것으로 볼지.
 *      "match" → 리그·중계 채널. 제목·설명의 구단명으로 팀을 가린다.
 *      ["lg"]  → 구단 채널·구단 팬 채널. 올라온 영상은 전부 그 팀 것으로 본다.
 *  - enabled: false 면 수집하지 않는다. id 를 모르는 채널은 비워 두고 꺼 둔다.
 *  - 채널 id 는 youtube.com/@핸들 페이지의 channelId 로 확인하고, RSS 작성자명이 맞는지 본다.
 *
 *  KBO 경기 영상 권리는 티빙에 있어 팬 채널의 중계 화면 재업로드는 쓸 수 없다 (기획서 7).
 *  팬 채널은 자체 촬영·리액션 위주인지 확인한 뒤에 켠다.
 */
export type ShortsChannel = {
  id: string;
  label: string;
  kind: "league" | "broadcaster" | "club" | "fan";
  teams: "match" | string[];
  enabled: boolean;
};

export const SHORTS_CHANNELS: ShortsChannel[] = [
  // 리그·중계
  { id: "UCoVz66yWHzVsXAFG8WhJK9g", label: "KBO", kind: "league", teams: "match", enabled: true },
  { id: "UC8JtQf77wqhVpOQ8Cze8JjA", label: "TVING SPORTS", kind: "broadcaster", teams: "match", enabled: true },

  // 구단 공식
  { id: "UCL6QZZxb-HR4hCh_eFAnQWA", label: "LGTWINSTV", kind: "club", teams: ["lg"], enabled: true },
  { id: "UCt8iRtgjVqm5rJHNl1TUojg", label: "SSG랜더스", kind: "club", teams: ["ssg"], enabled: true },
  { id: "UCKp8knO8a6tSI1oaLjfd9XA", label: "KIA TIGERS", kind: "club", teams: ["kia"], enabled: true },
  { id: "UCvScyjGkBUx2CJDMNAi9Twg", label: "위즈TV", kind: "club", teams: ["kt"], enabled: true },
  { id: "UCAZQZdSY5_YrziMPqXi-Zfw", label: "Giants TV", kind: "club", teams: ["lotte"], enabled: true },
  { id: "UCdq4Ji3772xudYRUatdzRrg", label: "Eagles TV", kind: "club", teams: ["hanwha"], enabled: true },
  { id: "UC8_FRgynMX8wlGsU6Jh3zKg", label: "NC 다이노스", kind: "club", teams: ["nc"], enabled: true },
  // TODO: 삼성·두산·키움 공식 채널 id 확인 필요 (핸들 검색 결과가 구단 채널이 아니었음)
  { id: "", label: "삼성 라이온즈", kind: "club", teams: ["samsung"], enabled: false },
  { id: "", label: "두산 베어스", kind: "club", teams: ["doosan"], enabled: false },
  { id: "", label: "키움 히어로즈", kind: "club", teams: ["kiwoom"], enabled: false },

  // 구단 팬 유튜버 — 권리 확인 전이라 꺼 둔다
  { id: "UCFu1C5PGMZLrF6xq0a8pxRA", label: "크보쌍둥이", kind: "fan", teams: ["lg"], enabled: false },
];
