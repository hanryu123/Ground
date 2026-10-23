import { NextResponse } from "next/server";
import { getTeamNews, NEWS_TAGS, pageTeamNews, type NewsTag } from "@/lib/news";
import { TEAMS } from "@/lib/teams";
import { llmUsageThisMonth } from "@/lib/llmBudget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/news?team=ssg[&limit=10][&offset=0][&tag=FA]
 *   최근 7일 우리 팀 소식 { items, tags, total, nextOffset }
 *   tags 는 태그 필터와 상관없이 그 팀 소식에 있는 태그만 (필터 칩용).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  // ?debug=llm — 이번 달 Claude 사용량·예산 (금액만, 진단용)
  if (searchParams.get("debug") === "llm") {
    try {
      return NextResponse.json({ ok: true, ...(await llmUsageThisMonth()) }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
    }
  }
  const team = searchParams.get("team") ?? "";
  if (!TEAMS.some((t) => t.id === team)) {
    return NextResponse.json({ ok: false, error: "unknown_team" }, { status: 400 });
  }
  const limit = Math.max(0, Number(searchParams.get("limit")) || 0) || undefined;
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);
  const rawTag = searchParams.get("tag");
  const tag = NEWS_TAGS.includes(rawTag as NewsTag) ? (rawTag as NewsTag) : null;

  const all = await getTeamNews(team);
  return NextResponse.json(
    { ok: true, ...pageTeamNews(all, { tag, offset, limit }) },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } }
  );
}
