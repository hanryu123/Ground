import { NextResponse } from "next/server";
import { fetchKboSchedule, todayKstDate } from "@/lib/kbo";
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
    if (!force && (mins < 10 || mins > 20)) continue;

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
      const body = buildGameStartCopy({
        seed: `${date}:${game.id}:${teamId}`,
        opponent,
        team: findTeam(teamId).short,
      });
      const result = await sendTeamTopicNotification({
        teamId,
        topicKey: "preGame",
        title: "⏱️ 경기 시작 임박",
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
