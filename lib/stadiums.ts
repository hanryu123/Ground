/**
 * KBO 10구단 홈구장 위치 (위경도).
 * OpenWeather 등 위치 기반 API 호출에 사용된다.
 */

export type StadiumInfo = {
  /** 정식 구장명 (게임 데이터의 stadium 필드와 매칭) */
  name: string;
  /** 위도 */
  lat: number;
  /** 경도 */
  lon: number;
  /** 주 사용 구단(들) */
  team: string;
};

export const STADIUMS: StadiumInfo[] = [
  { name: "잠실 야구장", lat: 37.5121, lon: 127.0719, team: "LG/DOOSAN" },
  { name: "수원 KT 위즈 파크", lat: 37.2997, lon: 127.0096, team: "KT" },
  { name: "인천 SSG 랜더스 필드", lat: 37.4374, lon: 126.6932, team: "SSG" },
  { name: "대전 한화생명 이글스파크", lat: 36.3173, lon: 127.4292, team: "HANWHA" },
  { name: "광주 챔피언스 필드", lat: 35.1681, lon: 126.8889, team: "KIA" },
  { name: "사직 야구장", lat: 35.1939, lon: 129.0615, team: "LOTTE" },
  { name: "대구 라이온즈 파크", lat: 35.8411, lon: 128.6817, team: "SAMSUNG" },
  { name: "창원 NC 파크", lat: 35.2225, lon: 128.5821, team: "NC" },
  { name: "고척 스카이돔", lat: 37.4982, lon: 126.8674, team: "KIWOOM" },
];

/**
 * 구장명으로 위치 정보 조회. 정확 매칭 우선, 실패 시 부분 매칭.
 *  - "대구 라이온즈 파크" → 정확 매칭
 *  - "라이온즈 파크" → 부분 매칭
 */
export function findStadium(
  name: string | null | undefined
): StadiumInfo | null {
  if (!name) return null;
  const target = name.trim();
  if (!target) return null;
  const exact = STADIUMS.find((s) => s.name === target);
  if (exact) return exact;
  return (
    STADIUMS.find(
      (s) => target.includes(s.name) || s.name.includes(target)
    ) ?? null
  );
}
