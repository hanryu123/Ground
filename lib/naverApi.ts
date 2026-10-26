/**
 * 네이버 스포츠 API 주소.
 *
 * 2026-10-26 플레이오프 1차전 내내 미국 리전(iad1) Vercel 함수에서 api-gw.sports.naver.com 요청이
 * 끊겨(fetch failed·ECONNRESET·시간 초과) 점수 알림이 하나도 나가지 않았다. 같은 시각 한국에서는 정상.
 * 그래서 서울(icn1)이 아닌 리전에서 돌 때는 서울에 둔 중계 경로(/api/naver/...)를 거친다.
 * 로컬 개발·서울 리전 함수는 네이버를 바로 부른다.
 */
export const NAVER_ORIGIN = "https://api-gw.sports.naver.com";

const PROXY_ORIGIN = process.env.NAVER_PROXY_ORIGIN ?? "https://ground-alpha.vercel.app";
const region = process.env.VERCEL_REGION;

export const NAVER_PROXIED = Boolean(region) && region !== "icn1";
export const NAVER_BASE = NAVER_PROXIED ? `${PROXY_ORIGIN}/api/naver` : NAVER_ORIGIN;
