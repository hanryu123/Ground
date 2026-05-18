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
 * Today 게임은 실데이터 우선이며, fetch 실패 시 빈 배열로 반환한다.
 * (잘못된 목업 경기/선발 정보를 실서비스에 노출하지 않기 위함)
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
