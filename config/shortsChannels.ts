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

  // 구단 팬 유튜버 — 노출 정책 (docs/phase0-spike.md 11.3): 자체 촬영·리액션(A)·중계 인셋이 섞인 리액션(B)은 켜고,
  // 중계 화면 녹화 위주(C)는 끈다. 2026-10-21 채널별 최근 숏츠 썸네일을 직접 보고 판단했다.
  { id: "UCFu1C5PGMZLrF6xq0a8pxRA", label: "크보쌍둥이", kind: "fan", teams: ["lg"], enabled: true },
  { id: "UCBOKo7omCqiOkuP9NDOGQSQ", label: "캐스터안TV", kind: "fan", teams: ["lg"], enabled: true },
  { id: "UC1aaTtgKSF9QtkcwKhTmS6A", label: "루코", kind: "fan", teams: ["lg"], enabled: true },
  { id: "UCWa5-RjOjt4H07b0RtqJo_Q", label: "사이다 타이거즈", kind: "fan", teams: ["kia"], enabled: true },
  { id: "UC7hNOw55ElIDg9f72tJuw2Q", label: "불방맹이TV", kind: "fan", teams: ["samsung"], enabled: true },
  { id: "UCs4zdfVy_vMeC1boj5Uvtew", label: "이글스 EVERYDAY", kind: "fan", teams: ["hanwha"], enabled: true },
  { id: "UCBt8rol1ip5ukhvz73aXFxg", label: "장아나", kind: "fan", teams: ["hanwha"], enabled: true },
  { id: "UCo8FQRmfrB08SSoNOw9qkfQ", label: "지캐TV", kind: "fan", teams: ["doosan"], enabled: true },
  { id: "UC2yNu6qNLkauR29pT6VCckg", label: "키다리맨", kind: "fan", teams: ["kiwoom"], enabled: true },
  { id: "UCfGNfrHVHOpyKONSOpbBB2w", label: "주원이내", kind: "fan", teams: ["ssg"], enabled: true },
  { id: "UCXg-Wm1bN4PhQRb86SHb38A", label: "숨끼 다이노스", kind: "fan", teams: ["nc"], enabled: true },
  // 롯데 — 사용자 추천 (2026-10-21). 도쿄 갈매기는 직접 촬영 토크·퀴즈(A).
  // 허캐티비는 최근엔 롱폼 경기 리뷰만 올리고 숏츠는 2023-05 이후 없음 → 켜 두면 새 숏츠부터 들어온다.
  { id: "UCHQ8RytJ1Zk7Xlvbznbp0Vg", label: "도쿄 갈매기", kind: "fan", teams: ["lotte"], enabled: true },
  { id: "UCSuzeyw_UfTJh56OZthl16Q", label: "허캐티비", kind: "fan", teams: ["lotte"], enabled: true },
  // C — 썸네일 대부분이 중계 화면 녹화라 끈다 (KIA 연구소는 썸네일에 "출처: 티빙")
  { id: "UCTvmAZOI_eSxrpLHkuq-8gw", label: "수염오빠", kind: "fan", teams: ["lg"], enabled: false },
  { id: "UCdSsRSR8Ig-nVSMxu9H7qkw", label: "KIA 연구소", kind: "fan", teams: ["kia"], enabled: false },
  { id: "UCn_ji_Z7N-ML0GLygTRkN4w", label: "장부장", kind: "fan", teams: ["kia"], enabled: false },
  { id: "UCk94XLORoXLUktMGLSVAjbQ", label: "소캐TV", kind: "fan", teams: ["kia"], enabled: false },
  { id: "UCpJMgDpiB1gVNxst8vQjVaA", label: "키움을 코미", kind: "fan", teams: ["kiwoom"], enabled: false },
  { id: "UCnmrsP2bQ43MZsURf8-3tsA", label: "풍선고래", kind: "fan", teams: ["ssg"], enabled: false },
];
