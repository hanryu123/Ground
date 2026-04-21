export type Team = {
  id: string;
  short: string;
  /** 영문 약칭 — 매거진 커버 뱃지/타이틀에 사용 (DOOSAN, SAMSUNG 등) */
  shortEn: string;
  name: string;
  /** 공식 영문 풀네임 (DOOSAN BEARS, LG TWINS 등) */
  nameEn: string;
  city: string;
  /** 팀 포인트 컬러 (헤로 워시·인디케이터·BottomNav pill에 사용) */
  accent: string;
  /** Hero 카드용 출사표 (한국어). \n으로 줄바꿈 */
  slogan: string;
  /** 매거진 커버용 영문 매니페스토. \n으로 줄바꿈, 짧고 비장하게 */
  manifestoEn: string;
  /** Hero 배경 이미지 (미지정 시 ref 폴더에서 자동 픽) */
  heroImage?: string;
};

export const TEAMS: Team[] = [
  {
    id: "lg",
    short: "LG",
    shortEn: "LG",
    name: "LG 트윈스",
    nameEn: "LG TWINS",
    city: "서울 잠실",
    accent: "#C30452",
    slogan: "다시,\n트윈스",
    manifestoEn: "LG,\nRISE\nAGAIN.",
    heroImage: "/images/refs/ready/manifesto-lg.jpg",
  },
  {
    id: "kt",
    short: "KT",
    shortEn: "KT",
    name: "KT 위즈",
    nameEn: "KT WIZ",
    city: "수원",
    accent: "#EB1C24",
    slogan: "마법이\n시작된다",
    manifestoEn: "KT,\nMAGIC\nIGNITES.",
  },
  {
    id: "ssg",
    short: "SSG",
    shortEn: "SSG",
    name: "SSG 랜더스",
    nameEn: "SSG LANDERS",
    city: "인천",
    accent: "#CE0E2D",
    slogan: "랜더스의\n바다",
    manifestoEn: "SSG,\nOCEAN OF\nLEGENDS.",
  },
  {
    id: "nc",
    short: "NC",
    shortEn: "NC",
    name: "NC 다이노스",
    nameEn: "NC DINOS",
    city: "창원",
    accent: "#315288",
    slogan: "공룡의\n질주",
    manifestoEn: "NC,\nRISE OF\nTHE DINOS.",
  },
  {
    id: "doosan",
    short: "두산",
    shortEn: "DOOSAN",
    name: "두산 베어스",
    nameEn: "DOOSAN BEARS",
    city: "서울 잠실",
    accent: "#1B3D6E",
    slogan: "굳세어라\n두산",
    manifestoEn: "DOOSAN,\nTHE\nDYNASTY\nBEGINS.",
  },
  {
    id: "kia",
    short: "KIA",
    shortEn: "KIA",
    name: "KIA 타이거즈",
    nameEn: "KIA TIGERS",
    city: "광주",
    accent: "#EA002C",
    slogan: "다시,\n호랑이",
    manifestoEn: "TIGERS,\nNEVER\nFADE.",
  },
  {
    id: "samsung",
    short: "삼성",
    shortEn: "SAMSUNG",
    name: "삼성 라이온즈",
    nameEn: "SAMSUNG LIONS",
    city: "대구",
    accent: "#1F4E8C",
    slogan: "사자의\n포효",
    manifestoEn: "SAMSUNG,\nTHE LIONS\nROAR.",
  },
  {
    id: "lotte",
    short: "롯데",
    shortEn: "LOTTE",
    name: "롯데 자이언츠",
    nameEn: "LOTTE GIANTS",
    city: "부산",
    accent: "#1A275B",
    slogan: "끝까지,\n자이언츠",
    manifestoEn: "GIANTS,\nUNTIL\nTHE END.",
  },
  {
    id: "hanwha",
    short: "한화",
    shortEn: "HANWHA",
    name: "한화 이글스",
    nameEn: "HANWHA EAGLES",
    city: "대전",
    accent: "#FC4E00",
    slogan: "비상하라\n이글스",
    manifestoEn: "EAGLES,\nSOAR\nHIGHER.",
  },
  {
    id: "kiwoom",
    short: "키움",
    shortEn: "KIWOOM",
    name: "키움 히어로즈",
    nameEn: "KIWOOM HEROES",
    city: "고척",
    accent: "#9B1B30",
    slogan: "더 높이,\n히어로즈",
    manifestoEn: "RISE,\nHEROES.",
  },
];

/**
 * /today 히어로 매치업에서 **좌측 열 팀명 위**에만 붙는 수식어.
 * (응원팀이 항상 좌측에 오므로, 한 팀만 표기)
 */
/** 팀 숏네임과 겹치지 않게 수식어만 (팀명은 히어로 타이틀에 별도 표기) */
const HERO_LEFT_EPITHET: Record<string, string> = {
  lg: "무적",
  samsung: "최강",
  doosan: "최강",
  kia: "최강",
  hanwha: "최강",
  lotte: "최강",
  ssg: "인천",
  nc: "공룡군단",
  kiwoom: "영웅군단",
  kt: "마법의",
};

export function heroLeftEpithetLabel(teamId: string): string | null {
  return HERO_LEFT_EPITHET[teamId.toLowerCase()] ?? null;
}

export const findTeam = (id: string) =>
  TEAMS.find((t) => t.id === id) ?? TEAMS[0];
