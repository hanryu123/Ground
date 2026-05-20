import { prisma } from "../lib/prisma";

async function main() {
  const today = new Date("2026-05-20T00:00:00+09:00");
  const tomorrow = new Date("2026-05-21T00:00:00+09:00");

  const games = await prisma.game.findMany({
    where: { gameDate: { gte: today, lt: tomorrow } },
    select: { externalId: true, homeTeam: true, awayTeam: true, status: true, homeScore: true, awayScore: true, lastSyncedAt: true },
  });
  console.log("=== 오늘 게임 DB ===");
  for (const g of games) console.log(g);

  const cancels = await prisma.notificationDispatchState.findMany({
    where: { alertKind: "cancel", createdAt: { gte: today } },
    select: { alertKind: true, teamScope: true, eventKey: true, createdAt: true },
  });
  console.log("\n=== 취소 dispatch 기록 ===");
  for (const c of cancels) console.log(c);

  console.log("\n=== (cron_runs 조회 생략) ===");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
