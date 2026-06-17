import { NextResponse } from "next/server";
import {
  fetchKboTodayGames,
  fetchKboStandings,
  resolveTodayFeedMessage,
  resolveTodayFeedStatus,
  todayKstDate,
} from "@/lib/kbo";
import { generateTodayStatusMessageWithLlm } from "@/lib/todayStatusLlm";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const res = NextResponse.json(body, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  return res;
}

function isPregamePreviewWindow(gameTime: string | undefined, date: string, now = new Date()): boolean {
  // gameTime이 있으면 경기 시작 -90분 ~ +0분 구간에만 노출
  // (경기 시작 후엔 status가 LIVE/RESULT로 바뀌어 이 함수 자체가 호출되지 않음)
  if (gameTime) {
    const [hh, mm] = gameTime.split(":").map(Number);
    if (Number.isFinite(hh) && Number.isFinite(mm)) {
      const gameMs = Date.parse(`${date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`);
      if (Number.isFinite(gameMs)) {
        const minsUntil = (gameMs - now.getTime()) / 60_000;
        return minsUntil >= -10 && minsUntil <= 90;
      }
    }
  }
  // fallback: 17:00~18:30 KST (주중 기본값)
  const start = Date.parse(`${date}T17:00:00+09:00`);
  const end = Date.parse(`${date}T18:30:00+09:00`);
  return now.getTime() >= start && now.getTime() < end;
}

function postGameVisibleUntilKst(gameDate: Date): Date {
  // gameDate는 KST 자정(예: 2026-05-20T00:00:00+09:00 = UTC 2026-05-19T15:00:00Z)으로 저장됨.
  // toISOString()은 UTC 기준이므로 날짜가 하루 밀려 "2026-05-19"가 됨.
  // KST 기준 날짜를 구하려면 +9h 오프셋을 더해야 한다.
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const dateKst = new Date(gameDate.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
  // 해당 날짜 KST 정오 + 24h = 익일 정오까지 노출
  const visibleUntilMs = Date.parse(`${dateKst}T12:00:00+09:00`) + 24 * 60 * 60 * 1000;
  return new Date(visibleUntilMs);
}

function isPostGameWindowActive(gameDate: Date, now = new Date()): boolean {
  return now.getTime() <= postGameVisibleUntilKst(gameDate).getTime();
}

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
    // ── 핵심 최적화: 오늘 경기만 가져오기 + standings 병렬 실행 ──────────────
    // 기존: fetchKboSchedule(date) → D-7~D+6 14일치 fetch + enrichStarters 70건+
    // 개선: fetchKboTodayGames(date) → 오늘 경기(최대 5건) + 병렬 실행
    // 실시간 스코어는 서버 내부 캐시도 타면 안 된다. 라인업은 선택팀 경기만 보강해 로딩을 줄인다.
    const [games, standings] = await Promise.all([
      fetchKboTodayGames(date, {
        cacheMode: "live",
        includeLineups: Boolean(teamId),
        lineupTeamId: teamId,
      }),
      withStandings ? fetchKboStandings() : Promise.resolve([] as import("@/config/standings").StandingRow[]),
    ]);
    const teamGame = teamId
      ? games.find((game) => game.homeId === teamId || game.awayId === teamId) ?? null
      : null;
    const gamePhase =
      teamGame == null
        ? "NONE"
        : teamGame.status === "RESULT"
          ? "END"
          : teamGame.status === "LIVE"
            ? "LIVE"
            : "PRE";
    const status = resolveTodayFeedStatus(date, games);
    const fallback = resolveTodayFeedMessage(status);
    const message = fallback
      ? await generateTodayStatusMessageWithLlm({
          status,
          fallback,
          teamId,
        })
      : null;

    // ── DB 쿼리 병렬 실행 ────────────────────────────────────────────────────
    const isResult = teamId != null && teamGame?.status === "RESULT";
    const isBefore = teamId != null && teamGame?.status === "BEFORE";

    const [gameRow, directReport, previewRow] = await Promise.all([
      // 하이라이트 영상
      isResult && teamGame.id
        ? prisma.game.findUnique({ where: { externalId: teamGame.id }, select: { highlightVideoUrl: true } })
        : Promise.resolve(null),
      // 오늘 경기 포스트게임 리포트
      isResult && teamGame.id
        ? prisma.postGameReport.findUnique({
            where: { externalId_teamId: { externalId: teamGame.id, teamId: teamId! } },
            select: { status: true, gameDate: true, title: true, content: true, bodyLines: true, generatedAt: true },
          })
        : Promise.resolve(null),
      // 프리뷰
      isBefore
        ? prisma.pregamePreview.findUnique({
            where: { date_teamId: { date, teamId: teamId! } },
            select: { status: true, title: true, bodyLines: true, generatedAt: true },
          })
        : Promise.resolve(null),
    ]);

    // 하이라이트
    let highlightVideo: { url: string; thumbnailUrl: string | null; videoId: string } | null = null;
    if (gameRow?.highlightVideoUrl) {
      const vidIdMatch = /[?&]v=([^&]+)/.exec(gameRow.highlightVideoUrl) ??
        /youtu\.be\/([^?]+)/.exec(gameRow.highlightVideoUrl);
      const videoId = vidIdMatch?.[1] ?? null;
      highlightVideo = {
        url: gameRow.highlightVideoUrl,
        thumbnailUrl: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null,
        videoId: videoId ?? "",
      };
    }

    // 포스트게임 리포트 — 선택팀의 오늘 경기가 끝난 경우에만 해당 경기 리포트 노출
    let postGameReport: {
      status: "PENDING" | "GENERATING" | "READY" | "FAILED";
      headline: string | null; content: string | null; active: boolean;
      visibleUntil: string | null; generatedAt: string | null;
    } | null = null;
    const reportSource = directReport;
    if (reportSource) {
      const fallbackContent = Array.isArray(reportSource.bodyLines)
        ? reportSource.bodyLines.filter((l): l is string => typeof l === "string").join(" ")
        : null;
      const isActive = reportSource === directReport
        ? (reportSource.gameDate ? isPostGameWindowActive(reportSource.gameDate) : true)
        : (reportSource.gameDate ? isPostGameWindowActive(reportSource.gameDate) : false);
      if (isActive) {
        postGameReport = {
          status: reportSource.status,
          headline: reportSource.title,
          content: reportSource.content ?? fallbackContent,
          active: true,
          visibleUntil: reportSource.gameDate ? postGameVisibleUntilKst(reportSource.gameDate).toISOString() : null,
          generatedAt: reportSource.generatedAt ? reportSource.generatedAt.toISOString() : null,
        };
      }
    }

    // 프리뷰
    let pregamePreview: {
      status: "PENDING" | "READY" | "FAILED"; title: string | null;
      lines: string[]; active: boolean; generatedAt: string | null;
    } | null = null;
    if (previewRow && isBefore && teamGame) {
      pregamePreview = {
        status: previewRow.status,
        title: previewRow.title,
        lines: Array.isArray(previewRow.bodyLines)
          ? previewRow.bodyLines.filter((l): l is string => typeof l === "string")
          : [],
        active: previewRow.status === "READY" && isPregamePreviewWindow(teamGame.time, date),
        generatedAt: previewRow.generatedAt ? previewRow.generatedAt.toISOString() : null,
      };
    }

    return jsonNoStore({
      date,
      status,
      gamePhase,
      teamId: teamId ?? null,
      message,
      games,
      standings,
      pregamePreview,
      postGameReport,
      highlightVideo,
      fallback: false,
    });
  } catch (err) {
    return jsonNoStore(
      {
        error: (err as Error).message,
        date,
        teamId: teamId ?? null,
        status: "NO_GAMES",
        gamePhase: "NONE",
        message: resolveTodayFeedMessage("NO_GAMES"),
        games: [],
        standings: [],
        pregamePreview: null,
        postGameReport: null,
      },
      { status: 500 }
    );
  }
}
