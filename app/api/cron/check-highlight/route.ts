import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findTeam } from "@/lib/teams";
import { shouldSkipCronInAlpha } from "@/lib/appEnv";
import {
  fetchOfficialHighlightEntries,
  pickMatchingHighlightForGame,
} from "@/lib/highlightFeed";
import { authorizeCron, markDispatchOnce, sendTeamTopicNotification } from "@/services/notificationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LOSE_MESSAGES = [
  "오늘 야구 기억 삭제하고 싶지만... 그래도 봐야겠다면 여기 클릭.",
  "오늘 경기는 액땜입니다. 대인배의 마음으로 하이라이트 슥- 훑어주고 내일 준비하죠.",
  "오늘 야구는 우천 취소된 겁니다. 아무튼 그런 겁니다. 그래도... 하이라이트는 여기.",
  "오늘 자 우리 팀 경기 결과는 유해 매체로 지정되었습니다. 시청 주의.",
] as const;

const WIN_MESSAGES = [
  "오늘 역대급 명경기! 안 본 사람 없게 해라. 지금 바로 확인!",
  "이게 야구고 이게 내 팀입니다! 짜릿하다 못해 지려버린 오늘 경기 요약 배달 완료.",
  "승리의 스멜 가득한 명경기 하이라이트 보면서 꿀잠 주무세요.",
  "오늘 하이라이트는 우리가 독식합니다. 정주행 렛츠고",
  "오늘 야구 왜 이렇게 재밌냐? 타 팀 팬들도 부러워서 훔쳐본다는 우리 팀 찢어버린 경기 하이라이트",
] as const;

const DRAW_MESSAGES = [
  "비겼지만 핵심 장면은 다시 봐야 한다. 요약 영상 확인.",
] as const;

function pickRandomMessage(messages: readonly string[]): string {
  return messages[Math.floor(Math.random() * messages.length)] ?? messages[0] ?? "";
}

function buildHighlightMessage(input: {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  fanTeamId: string;
}) {
  const isHomeFan = input.fanTeamId === input.homeTeam;
  const myScore = isHomeFan ? input.homeScore : input.awayScore;
  const oppScore = isHomeFan ? input.awayScore : input.homeScore;
  if (myScore > oppScore) {
    return {
      title: "🔥 [승리 요약]",
      body: pickRandomMessage(WIN_MESSAGES),
    };
  }
  if (myScore < oppScore) {
    return {
      title: "😱 [하이라이트]",
      body: pickRandomMessage(LOSE_MESSAGES),
    };
  }
  return {
    title: "🎬 [하이라이트]",
    body: pickRandomMessage(DRAW_MESSAGES),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = authorizeCron(req, url);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (shouldSkipCronInAlpha(url)) return NextResponse.json({ ok: true, skipped: "ALPHA_ENV_CRON_DISABLED" });

  const now = new Date();
  const force = url.searchParams.get("force") === "1";
  const teamId = url.searchParams.get("teamId") ?? undefined;
  const minEndedAt = new Date(now.getTime() - 30 * 60 * 1000);
  const highlightPollThreshold = new Date(now.getTime() - 5 * 60 * 1000);

  const teamFilter = teamId
    ? { OR: [{ homeTeam: teamId }, { awayTeam: teamId }] }
    : {};

  const candidates = await prisma.game.findMany({
    where: {
      status: "RESULT",
      endedAt: { lte: minEndedAt },
      // force+teamId: 이미 보낸 게임도 재발송 허용 (특정 팀 재전송용)
      ...(force && teamId ? {} : { highlightNotifiedAt: null }),
      OR: [
        { lastHighlightCheckedAt: null },
        { lastHighlightCheckedAt: { lte: highlightPollThreshold } },
      ],
      ...teamFilter,
    },
    orderBy: [{ endedAt: "desc" }],
    take: 16,
  });

  const entries = await fetchOfficialHighlightEntries(16);
  let checked = 0;
  let sent = 0;
  let matched = 0;

  for (const game of candidates) {
    checked += 1;
    await prisma.game.update({
      where: { id: game.id },
      data: { lastHighlightCheckedAt: new Date() },
    });
    const hit = pickMatchingHighlightForGame(entries, {
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
    });
    if (!hit) continue;
    matched += 1;

    // teamId가 지정된 경우 해당 팀에만 발송
    const teamsToNotify = teamId
      ? [game.homeTeam, game.awayTeam].filter((t) => t === teamId)
      : [game.homeTeam, game.awayTeam];

    for (const notifyTeamId of teamsToNotify) {
      const lock = await markDispatchOnce({
        alertKind: "highlight",
        teamScope: notifyTeamId,
        eventKey: `${game.externalId}:${hit.videoId}`,
        gameExternalId: game.externalId,
      });
      if (!lock) continue;
      const copy = buildHighlightMessage({
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homeScore: game.homeScore,
        awayScore: game.awayScore,
        fanTeamId: notifyTeamId,
      });
      const result = await sendTeamTopicNotification({
        teamId: notifyTeamId,
        topicKey: "highlight",
        title: copy.title,
        body: copy.body,
        url: `${url.origin}/`,
        payload: {
          kind: "highlight",
          gameExternalId: game.externalId,
          highlightVideoId: hit.videoId,
          highlightVideoUrl: hit.url,
          highlightTitle: hit.title,
          channelId: hit.channelId,
          channelLabel: hit.channelLabel,
        },
        type: "GAME_RESULT",
        origin: url.origin,
      });
      sent += result.sent;
    }

    await prisma.game.update({
      where: { id: game.id },
      data: {
        highlightNotifiedAt: new Date(),
        highlightVideoUrl: hit.url,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    checked,
    matched,
    sent,
    candidates: candidates.length,
  });
}
