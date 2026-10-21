/**
 * 피드 숏츠 블록 화이트리스트 채널.
 *
 *  - teams: 이 채널 영상을 어느 팀 것으로 볼지.
 *      "match" → 리그·중계 채널. 제목·설명의 구단명으로 팀을 가린다.
 *      ["lg"]  → 구단 채널·구단 팬 채널. 올라온 영상은 전부 그 팀 것으로 본다.
 *  - enabled: false 면 수집하지 않는다. id 를 모르는 채널은 비워 두고 꺼 둔다.
 *  - 채널 id 는 구단 공식 사이트·위키로 교차 확인한 값만 넣는다 (핸들 추측은 사칭·무관 채널이 많다).
 *    출처: Phase 0 스파이크 scripts/spike/channels.json, docs/phase0-spike.md 2.1
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
  // KIA 채널은 최근 숏츠가 거의 없어 KBO·티빙 분류분이 채운다
  { id: "UCKp8knO8a6tSI1oaLjfd9XA", label: "KIA TIGERS", kind: "club", teams: ["kia"], enabled: true },
  { id: "UCvScyjGkBUx2CJDMNAi9Twg", label: "위즈TV", kind: "club", teams: ["kt"], enabled: true },
  { id: "UCAZQZdSY5_YrziMPqXi-Zfw", label: "Giants TV", kind: "club", teams: ["lotte"], enabled: true },
  { id: "UCdq4Ji3772xudYRUatdzRrg", label: "Eagles TV", kind: "club", teams: ["hanwha"], enabled: true },
  { id: "UC8_FRgynMX8wlGsU6Jh3zKg", label: "NC 다이노스", kind: "club", teams: ["nc"], enabled: true },
  // TODO: 두산·삼성·KT 는 핸들 미확인 (id 는 위키·채널명 근거) — 구단 사이트 링크로 한 번 더 확정
  { id: "UCsebzRfMhwYfjeBIxNX1brg", label: "BEARS TV", kind: "club", teams: ["doosan"], enabled: true },
  { id: "UCMWAku3a3h65QpLm63Jf2pw", label: "LionsTV", kind: "club", teams: ["samsung"], enabled: true },
  { id: "UC_MA8-XEaVmvyayPzG66IKg", label: "키움히어로즈", kind: "club", teams: ["kiwoom"], enabled: true },

  // 구단 팬 유튜버 — 권리 확인 전이라 꺼 둔다
  { id: "UCFu1C5PGMZLrF6xq0a8pxRA", label: "크보쌍둥이", kind: "fan", teams: ["lg"], enabled: false },
];
