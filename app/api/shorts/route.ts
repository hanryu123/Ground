import { NextResponse } from "next/server";
import { getTeamShorts, teamShortsMoreUrl } from "@/lib/shorts";
import { TEAMS } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/shorts?team=lg
 *   최근 14일 우리 팀 숏츠 { items: ShortsItem[], moreUrl } — 비어 있으면 피드에서 블록을 숨긴다.
 */
export async function GET(req: Request) {
  const team = new URL(req.url).searchParams.get("team") ?? "";
  if (!TEAMS.some((t) => t.id === team)) {
    return NextResponse.json({ ok: false, error: "unknown_team" }, { status: 400 });
  }
  const items = await getTeamShorts(team);
  return NextResponse.json(
    { ok: true, items, moreUrl: teamShortsMoreUrl(team) },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } }
  );
}
