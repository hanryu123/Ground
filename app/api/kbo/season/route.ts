import { NextResponse } from "next/server";
import { fetchSeasonStatus } from "@/lib/kbo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/kbo/season → { activeTeamIds: string[] }
 * 실패하면 500 — 클라이언트는 실패 시 비시즌으로 판단하지 않는다.
 */
export async function GET() {
  try {
    const status = await fetchSeasonStatus();
    return NextResponse.json(status, {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" },
    });
  } catch (err) {
    console.warn("[season] status failed:", (err as Error).message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
