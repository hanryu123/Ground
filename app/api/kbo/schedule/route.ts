import { NextResponse } from "next/server";
import { fetchKboSchedule } from "@/lib/kbo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/kbo/schedule
 *   { date, past[], today[], tomorrow[], fallback }
 *
 *  - 한 방 호출로 D-7 ~ D+1 통합 반환 (Schedule 탭 페이지 1회 fetch 로 끝)
 *  - 라이브 실패 시에도 fallback=true 와 정적 데이터로 응답 → UI 항상 그릴 수 있음
 */
export async function GET() {
  const bundle = await fetchKboSchedule();
  return NextResponse.json(bundle);
}
