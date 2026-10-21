import { NextResponse } from "next/server";
import { fetchDayGames, fetchMonthGames } from "@/lib/schedule";
import { isValidDate, isValidMonth } from "@/lib/calendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/kbo/games?month=YYYY-MM  → MonthGamesPayload (그 달 경기 + 그 해 경기일 목록)
 * GET /api/kbo/games?date=YYYY-MM-DD → DayGamesPayload (그날 경기 + 선발·구장·승패 투수)
 *
 *  지난 시즌 날짜도 그대로 조회된다 (네이버 시즌 일정은 연도별로 남아 있음).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const date = searchParams.get("date");

  if (isValidDate(date)) {
    return NextResponse.json(await fetchDayGames(date));
  }
  if (isValidMonth(month)) {
    return NextResponse.json(await fetchMonthGames(month));
  }
  return NextResponse.json(
    { error: "month=YYYY-MM 또는 date=YYYY-MM-DD 가 필요해요" },
    { status: 400 }
  );
}
