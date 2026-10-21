import { todayKstDate } from "@/lib/kbo";
import { fetchDayGames, fetchMonthGames } from "@/lib/schedule";
import { monthKey } from "@/lib/calendar";
import SchedulePageClient from "./SchedulePageClient";

/**
 * /schedule — Games 탭 (주간 스와이프 캘린더 + 고른 날의 경기).
 *
 *  ── 렌더 전략 ──
 *   - 첫 화면은 오늘이 속한 달 일정 + 오늘 경기 상세를 SSR 로 박아 보낸다 (깜빡임 없음).
 *   - 다른 날짜·달은 클라이언트에서 /api/kbo/games 로 그때그때 가져온다.
 *   - 60초 ISR.
 */
export const revalidate = 60;

export default async function SchedulePage() {
  const today = todayKstDate();
  const [month, day] = await Promise.all([
    fetchMonthGames(monthKey(today)),
    fetchDayGames(today),
  ]);
  return <SchedulePageClient today={today} initialMonth={month} initialDay={day} />;
}
