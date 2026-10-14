import { NextResponse } from "next/server";
import { fetchKboSchedule, todayKstDate, describePostseasonStakes, fetchPostseasonStateForGame } from "@/lib/kbo";
import { findTeam } from "@/lib/teams";
import { shouldSkipCronInAlpha } from "@/lib/appEnv";
import { authorizeCron, markDispatchOnce, minutesUntil, sendTeamTopicNotification, toKstDateTime } from "@/services/notificationService";
import { buildGameStartCopy } from "@/lib/fanCopyVariety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = authorizeCron(req, url);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (shouldSkipCronInAlpha(url, req)) return NextResponse.json({ ok: true, skipped: "ALPHA_ENV_CRON_DISABLED" });

  const force = url.searchParams.get("force") === "1";
  const date = todayKstDate();
  const schedule = await fetchKboSchedule(date);
  const games = schedule.today.filter((g) => g.status === "BEFORE");
  let sent = 0;
  let skipped = 0;

  for (const game of games) {
    const gameDateTime = toKstDateTime(date, game.time);
    if (!gameDateTime) continue;
    const mins = minutesUntil(gameDateTime);
    // Vercel 크론 지연 대비로 창을 넉넉히 (발송은 markDispatchOnce 로 1회 보장)
    if (!force && (mins < 0 || mins > 25)) continue;

    for (const teamId of [game.homeId, game.awayId]) {
      const lock = await markDispatchOnce({
        alertKind: "game-start",
        teamScope: teamId,
        eventKey: `${date}:${game.id}:game-start`,
        gameExternalId: game.id,
      });
      if (!lock) {
        skipped += 1;
        continue;
      }
      const opponentTeamId = teamId === game.homeId ? game.awayId : game.homeId;
      const opponent = findTeam(opponentTeamId).short;
      const teamShort = findTeam(teamId).short;
      const baseBody = buildGameStartCopy({
        seed: `${date}:${game.id}:${teamId}`,
        opponent,
        team: teamShort,
      });
      // 포스트시즌: 제목에 라운드·차전, 본문 첫머리에 오늘 걸린 것
      const series = await fetchPostseasonStateForGame(game.id, teamId);
      const stakes = series ? describePostseasonStakes(series) : null;
      const title = series ? `⏱️ ${series.roundLabel} ${series.gameNumber}차전 곧 시작` : "⏱️ 경기 시작 임박";
      const body = stakes ? `${stakes} ${baseBody}` : baseBody;
      const result = await sendTeamTopicNotification({
        teamId,
        topicKey: "preGame",
        title,
        body,
        url: "/today",
        payload: {
          kind: "game-start",
          gameId: game.id,
          teamId,
          opponentTeamId,
        },
        type: "GAME_START",
        origin: url.origin,
      });
      sent += result.sent;
    }
  }

  return NextResponse.json({ ok: true, date, sent, skipped, games: games.length });
}
