import { NextResponse } from "next/server";
import { getTeamNews } from "@/lib/news";
import { TEAMS } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/news?team=ssg[&limit=3]
 *   최근 7일 우리 팀 소식 { items: TeamNewsItem[] }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const team = searchParams.get("team") ?? "";
  if (!TEAMS.some((t) => t.id === team)) {
    return NextResponse.json({ ok: false, error: "unknown_team" }, { status: 400 });
  }
  const limit = Number(searchParams.get("limit")) || undefined;
  const items = await getTeamNews(team);
  return NextResponse.json(
    { ok: true, items: limit ? items.slice(0, limit) : items },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } }
  );
}
