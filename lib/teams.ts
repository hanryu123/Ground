export type Team = {
  id: string;
  short: string;
  name: string;
  city: string;
  accent: string;
};

export const TEAMS: Team[] = [
  { id: "lg", short: "LG", name: "LG 트윈스", city: "서울", accent: "#C30452" },
  { id: "kt", short: "KT", name: "KT 위즈", city: "수원", accent: "#000000" },
  { id: "ssg", short: "SSG", name: "SSG 랜더스", city: "인천", accent: "#CE0E2D" },
  { id: "nc", short: "NC", name: "NC 다이노스", city: "창원", accent: "#1D467A" },
  { id: "doosan", short: "두산", name: "두산 베어스", city: "서울", accent: "#13294B" },
  { id: "kia", short: "KIA", name: "KIA 타이거즈", city: "광주", accent: "#EA002C" },
  { id: "samsung", short: "삼성", name: "삼성 라이온즈", city: "대구", accent: "#1F4E8C" },
  { id: "lotte", short: "롯데", name: "롯데 자이언츠", city: "부산", accent: "#041E42" },
  { id: "hanwha", short: "한화", name: "한화 이글스", city: "대전", accent: "#FC4E00" },
  { id: "kiwoom", short: "키움", name: "키움 히어로즈", city: "고척", accent: "#570514" },
];

export const findTeam = (id: string) =>
  TEAMS.find((t) => t.id === id) ?? TEAMS[0];
