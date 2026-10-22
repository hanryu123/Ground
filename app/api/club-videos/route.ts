import { NextResponse } from "next/server";
import { getClubLatestVideos } from "@/lib/shorts";
import { TEAMS } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// YouTube 일부 채널(티빙)은 한국 밖에서 숏츠 목록을 주지 않는다 → vercel.json functions 에서 이 라우트만 서울(icn1)

/**
 * GET /api/club-videos?team=lg
 *   구단 공식 채널 최근 일반 영상 { items: ClubVideo[] } — 피드 뉴스 5개마다 하나씩 끼운다.
 */
export async function GET(req: Request) {
  const team = new URL(req.url).searchParams.get("team") ?? "";
  if (!TEAMS.some((t) => t.id === team)) {
    return NextResponse.json({ ok: false, error: "unknown_team" }, { status: 400 });
  }
  const items = await getClubLatestVideos(team);
  return NextResponse.json(
    { ok: true, items },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } }
  );
}
