import { NextResponse } from "next/server";
import { fetchKboSchedule, todayKstDate } from "@/lib/kbo";
import { findTeam } from "@/lib/teams";
import { shouldSkipCronInAlpha } from "@/lib/appEnv";
import { authorizeCron, markDispatchOnce, minutesUntil, sendTeamTopicNotification, toKstDateTime } from "@/services/notificationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TEMPLATES = [
  "15분 뒤 {상대팀}전 플레이볼! 치킨 세팅하셨죠? 오늘 꼭 잡겠습니다!",
  "칼퇴 성공하셨습니까? 15분 뒤 {상대팀}전! 지금 바로 켜시죠!",
  "15분 뒤 {상대팀}전 시작! 오늘 우리 팀 믿습니다. 함께 가시죠!",
  "잠시 후 플레이볼! {상대팀} 상대로 오늘 기대 큽니다. 켜세요!",
  "15분 뒤 {상대팀}전. 오늘 이 경기, 꼭 잡겠습니다!",
  "야구 시작 15분 전! {상대팀}전 오늘 우리 팀 할 수 있습니다!",
  "곧 플레이볼! {상대팀} 상대로 오늘 신나는 경기 기대됩니다!",
  "15분 뒤 {상대팀}전. 오늘 타선 폭발 예감! 지금 켜세요!",
  "15분 뒤 {상대팀}전 시작합니다. 오늘 분위기 좋습니다, 가봅시다!",
  "15분 뒤 {상대팀}전. 오늘은 우리 팀 날입니다! 함께 응원해요!",
] as const;

function pickTemplate(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return TEMPLATES[(hash >>> 0) % TEMPLATES.length] ?? TEMPLATES[0];
}

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
      const body = pickTemplate(`${date}:${game.id}:${teamId}`).replaceAll("{상대팀}", opponent);
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
