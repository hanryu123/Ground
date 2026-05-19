import { NextResponse } from "next/server";
import {
  fetchKboSchedule,
  fetchKboStandings,
  resolveTodayFeedMessage,
  resolveTodayFeedStatus,
  todayKstDate,
} from "@/lib/kbo";
import { generateTodayStatusMessageWithLlm } from "@/lib/todayStatusLlm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/kbo/today
 *   { date, status, message, games[], standings[], fallback }
 *
 * Today 탭은 Schedule 소스와 동일한 today 배열을 사용해 탭 간 데이터 정합성을 유지한다.
 * withStandings=0 이면 standings 계산을 생략해 로딩 지연을 줄인다.
 * 월요일/우천취소 상태 문구는 LLM 우선 생성 후, 실패 시 즉시 폴백 문구를 반환한다.
 */
export async function GET(req: Request) {
  const date = todayKstDate();
  const search = new URL(req.url).searchParams;
  const teamId = search.get("teamId");
  const withStandings = search.get("withStandings") !== "0";
  try {
    const schedule = await fetchKboSchedule(date);
    const standings = withStandings ? await fetchKboStandings() : [];
    const games = schedule.today;
    const status = resolveTodayFeedStatus(date, games);
    const fallback = resolveTodayFeedMessage(status);
    const message = fallback
      ? await generateTodayStatusMessageWithLlm({
          status,
          fallback,
          teamId,
        })
      : null;
    return NextResponse.json({
      date,
      status,
      message,
      games,
      standings,
      fallback: schedule.fallback,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: (err as Error).message,
        date,
        status: "NO_GAMES",
        message: resolveTodayFeedMessage("NO_GAMES"),
        games: [],
        standings: [],
      },
      { status: 500 }
    );
  }
}
