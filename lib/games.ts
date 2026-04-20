export type Game = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  homeId: string;
  awayId: string;
  stadium: string;
  homePitcher: string;
  awayPitcher: string;
  /** 카드 배경 이미지. 미지정 시 기본 이미지 사용 */
  image?: string;
  /** true면 이미지 자체에 모든 텍스트가 burn-in 돼 있어 오버레이를 그리지 않음 */
  imageOnly?: boolean;
};

// 5경기 (오늘 기준)
export const TODAY_GAMES: Game[] = [
  {
    id: "g1",
    date: "2026-04-19",
    time: "14:00",
    awayId: "ssg",
    homeId: "kt",
    stadium: "수원 KT 위즈 파크",
    awayPitcher: "김광현",
    homePitcher: "고영표",
    image: "/images/matchup.png",
  },
  {
    id: "g2",
    date: "2026-04-19",
    time: "18:30",
    awayId: "samsung",
    homeId: "lg",
    stadium: "대구 라이온즈 파크",
    awayPitcher: "원태인",
    homePitcher: "임찬규",
    image: "/images/matchup-2.png",
    imageOnly: true,
  },
  {
    id: "g3",
    date: "2026-04-19",
    time: "14:00",
    awayId: "kia",
    homeId: "lotte",
    stadium: "사직 야구장",
    awayPitcher: "양현종",
    homePitcher: "박세웅",
  },
  {
    id: "g4",
    date: "2026-04-19",
    time: "17:00",
    awayId: "hanwha",
    homeId: "kiwoom",
    stadium: "고척 스카이돔",
    awayPitcher: "문동주",
    homePitcher: "안우진",
  },
  {
    id: "g5",
    date: "2026-04-19",
    time: "17:00",
    awayId: "doosan",
    homeId: "nc",
    stadium: "창원 NC 파크",
    awayPitcher: "곽빈",
    homePitcher: "페디",
  },
];

export const YESTERDAY_GAMES: Game[] = [
  {
    id: "y1",
    date: "2026-04-18",
    time: "18:30",
    awayId: "lg",
    homeId: "doosan",
    stadium: "잠실 야구장",
    awayPitcher: "켈리",
    homePitcher: "최원준",
  },
  {
    id: "y2",
    date: "2026-04-18",
    time: "18:30",
    awayId: "kt",
    homeId: "samsung",
    stadium: "대구 라이온즈 파크",
    awayPitcher: "벤자민",
    homePitcher: "코너",
  },
  {
    id: "y3",
    date: "2026-04-18",
    time: "18:30",
    awayId: "ssg",
    homeId: "kia",
    stadium: "광주 챔피언스 필드",
    awayPitcher: "엘리아스",
    homePitcher: "이의리",
  },
];

export const TOMORROW_GAMES: Game[] = [
  {
    id: "t1",
    date: "2026-04-20",
    time: "14:00",
    awayId: "nc",
    homeId: "hanwha",
    stadium: "대전 한화생명 이글스파크",
    awayPitcher: "신민혁",
    homePitcher: "류현진",
  },
  {
    id: "t2",
    date: "2026-04-20",
    time: "17:00",
    awayId: "kiwoom",
    homeId: "lotte",
    stadium: "사직 야구장",
    awayPitcher: "헤이수스",
    homePitcher: "윌커슨",
  },
];
