import { NextResponse } from "next/server";
import { fetchStandingsPayload } from "@/lib/standings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/kbo/standings → StandingsPayload
 *   { standings[] (연속·최근 10경기 포함), regularSeasonOver, bracket, season }
 * 순위 자체는 fetchKboStandings 가 정적 폴백까지 내려주므로 여기서 실패하는 건 예외 상황뿐.
 */
export async function GET() {
  try {
    const payload = await fetchStandingsPayload();
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900" },
    });
  } catch (err) {
    console.warn("[standings] payload failed:", (err as Error).message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
