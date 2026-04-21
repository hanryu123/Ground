import { NextResponse } from "next/server";
import {
  fetchKboTodayGames,
  fetchKboStandings,
  todayKstDate,
} from "@/lib/kbo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/kbo/today
 *   { date, games[], standings[] }
 *
 * 네이버가 죽거나 시즌 데이터 없으면 정적 폴백으로 흐른다.
 * 결과 없을 때도 200 + 빈 배열이 아니라 폴백 데이터로 응답하므로
 * 클라이언트는 항상 무언가를 그릴 수 있다.
 */
export async function GET() {
  const date = todayKstDate();
  try {
    const [games, standings] = await Promise.all([
      fetchKboTodayGames(date),
      fetchKboStandings(),
    ]);
    return NextResponse.json({ date, games, standings });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message, date, games: [], standings: [] },
      { status: 500 }
    );
  }
}
