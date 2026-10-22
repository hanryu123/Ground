import { NextResponse } from "next/server";
import { TEAMS } from "@/lib/teams";
import { getTeamNews } from "@/lib/news";
import { getClubLatestVideos, getTeamShorts } from "@/lib/shorts";
import { mapWithConcurrency } from "@/lib/concurrency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/warm-feed — 피드 캐시 미리 채우기 (Vercel cron 10분마다, 서울 리전).
 *
 * 숏츠(채널 24개 수집·임베드 확인·날짜 확인)와 뉴스(Claude 분류)는 캐시가 비어 있으면 첫 요청이
 * 수십 초를 기다렸다 (배포 직후·리전 변경 직후 실측 숏츠 40초). 사용자 대신 크론이 먼저 계산해 둔다.
 * 데이터 캐시는 리전별이라 이 라우트도 피드 API 와 같은 서울(icn1)에서 돌아야 한다 (vercel.json).
 * DB 를 쓰지 않으므로 알림 크론용 인증 헬퍼(DB 모듈 포함) 대신 CRON_SECRET 만 직접 확인한다.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  // 숏츠는 전체를 한 번 모아 팀별로 나누므로 첫 팀이 계산을 맡고 나머지는 캐시를 탄다
  const shorts = await mapWithConcurrency(TEAMS, 1, async (t) => (await getTeamShorts(t.id)).length);
  const club = await mapWithConcurrency(TEAMS, 4, async (t) => (await getClubLatestVideos(t.id)).length);
  const news = await mapWithConcurrency(TEAMS, 3, async (t) =>
    (await getTeamNews(t.id).catch(() => [])).length
  );

  return NextResponse.json({
    ok: true,
    ms: Date.now() - started,
    teams: Object.fromEntries(
      TEAMS.map((t, i) => [t.id, { shorts: shorts[i], club: club[i], news: news[i] }])
    ),
  });
}
