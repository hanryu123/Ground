import { fetchKboSchedule } from "@/lib/kbo";
import SchedulePageClient from "./SchedulePageClient";

/**
 * /schedule — KBO 일정 (D-7 ~ D+6) 통합 페이지.
 *
 *  ── 렌더 전략 ──
 *   - Server Component 로 fetchKboSchedule() 한 방 호출 → SSR 시점에 라이브 데이터 박혀 나감.
 *     (이전엔 클라이언트 훅에서 fetch 라 첫 paint 가 정적 fallback(2026-04-19 더미)으로
 *      잠깐 보였다가 라이브 도착하면 새로고침 되는 깜빡임이 있었음.)
 *   - 60초 ISR — 정적 캐시 + 백그라운드 재검증. fetch 자체도 60초 캐시 (lib/kbo.ts).
 *   - 상호작용·폴링·스크롤 anchor 는 SchedulePageClient (client component) 에서 처리.
 */
export const revalidate = 60;

export default async function SchedulePage() {
  const initial = await fetchKboSchedule();
  return <SchedulePageClient initial={initial} />;
}
