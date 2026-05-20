import { fetchKboSchedule } from "../lib/kbo";

async function main() {
  const schedule = await fetchKboSchedule("2026-05-20");
  const today = schedule.today;
  console.log("=== Today games from fetchKboSchedule ===");
  for (const g of today) {
    console.log({
      id: g.id,
      home: g.homeId,
      away: g.awayId,
      status: g.status,
      cancelReason: g.cancelReason,
    });
  }
}

main().catch(console.error);
