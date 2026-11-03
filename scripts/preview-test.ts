/**
 * 지난 경기로 경기 전 프리뷰를 실제 LLM 으로 뽑아 보기 — 저장·발송 없이 출력만.
 *
 *   ANTHROPIC_API_KEY 가 있어야 한다 (.env.local 에 넣고):
 *   npx tsx --env-file=.env.local scripts/preview-test.ts 2026-10-29 2026-11-03
 *
 * 로컬엔 DB 가 없어서 LLM 예산 확인(DB 조회)을 "0원 썼음"으로 바꿔 끼운다. 이 실행 비용은 예산 표에 안 쌓인다.
 * 선발 성적은 KBO 가 지금 보여주는 값이라, 지난 날짜면 그날이 아니라 오늘 기준 시즌 성적이 들어간다.
 */
import { fetchKboTodayGames, fetchPostseasonSeriesState, describePostseasonSeries } from "../lib/kbo";
import { fetchPregameNewsContext, generatePregamePreview } from "../lib/pregamePreview";
import { findTeam } from "../lib/teams";

// lib/prisma 는 첫 사용 때 globalThis.__ground_prisma__ 를 만든다 — 그 자리에 가짜 클라이언트를 먼저 넣어 둔다
(globalThis as Record<string, unknown>).__ground_prisma__ = {
  $executeRawUnsafe: async () => 0,
  $queryRawUnsafe: async () => [{ month: 0, day: 0 }],
  $queryRaw: async () => [{ month: 0, day: 0 }],
};

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) console.warn("⚠ ANTHROPIC_API_KEY 없음 — LLM 대신 대체 문구가 나온다\n");
  const dates = process.argv.slice(2);
  for (const date of dates.length > 0 ? dates : ["2026-10-29"]) {
    const games = await fetchKboTodayGames(date, { includeLineups: false });
    for (const game of games) {
      for (const teamId of [game.homeId, game.awayId]) {
        const opponentTeamId = teamId === game.homeId ? game.awayId : game.homeId;
        const series = await fetchPostseasonSeriesState(game, teamId, { includeTarget: false });
        const preview = await generatePregamePreview({
          date,
          game,
          teamId,
          opponentTeamId,
          recentGames: [],
          newsContext: await fetchPregameNewsContext({ gameId: game.id, teamId, opponentTeamId }).catch(() => []),
          postseasonContext: series ? describePostseasonSeries(series, findTeam(teamId).short) : null,
          llmTimeoutMs: 15000,
          llmRetryTimeoutMs: 20000,
        });
        console.log(`\n━━ ${date} ${findTeam(teamId).short} 팬 (vs ${findTeam(opponentTeamId).short}) · ${preview.source}`);
        console.log(`제목: ${preview.title}`);
        for (const line of preview.lines) console.log(`  · ${line}`);
      }
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
