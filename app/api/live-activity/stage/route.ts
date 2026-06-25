import { NextResponse } from "next/server";
import { fetchKboTodayGames, todayKstDate, type LiveGame } from "@/lib/kbo";
import { fetchLiveScoreSnapshot } from "@/lib/score/snapshot";
import { findTeam } from "@/lib/teams";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StagePhase = "PRE" | "LIVE" | "FINAL" | "CANCEL";

type StagePayload = {
  gameId: string;
  teamId: string;
  homeTeam: string;
  awayTeam: string;
  stadium: string;
  gameStartEpochMs: number | null;
  phase: StagePhase;
  status: string;
  inning: string;
  homeScore: number;
  awayScore: number;
  resultLabel: string | null;
  winningPitcher: string | null;
  losingPitcher: string | null;
  updatedAtEpochMs: number;
};

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const res = NextResponse.json(body, init);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");
  return res;
}

function gameStartEpochMs(game: Pick<LiveGame, "date" | "time">): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(game.time.trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const ms = Date.parse(
    `${game.date}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+09:00`
  );
  return Number.isFinite(ms) ? ms : null;
}

function resolvePhase(game: LiveGame): StagePhase {
  if (game.status === "RESULT") return "FINAL";
  if (game.status === "LIVE") return "LIVE";
  if (game.status === "CANCEL") return "CANCEL";
  return "PRE";
}

function resolveResultLabel(game: LiveGame, teamId: string): string | null {
  if (!game.result) return null;
  if (game.result.winnerId == null) return "무";
  return game.result.winnerId === teamId ? "승" : "패";
}

function buildMockPayload(teamId: string, mode: string | null): StagePayload {
  const team = findTeam(teamId);
  const opponent = findTeam(teamId === "lg" ? "kia" : "lg");
  const phase: StagePhase =
    mode === "pre" ? "PRE" : mode === "final" ? "FINAL" : mode === "cancel" ? "CANCEL" : "LIVE";
  const now = Date.now();
  return {
    gameId: `stage-${team.id}-${phase.toLowerCase()}`,
    teamId: team.id,
    homeTeam: team.short,
    awayTeam: opponent.short,
    stadium: "잠실",
    gameStartEpochMs: phase === "PRE" ? now + 42 * 60 * 1000 : now - 90 * 60 * 1000,
    phase,
    status: phase === "FINAL" ? "경기 종료" : phase === "PRE" ? "경기 전" : phase === "CANCEL" ? "우천 취소" : "LIVE",
    inning: phase === "FINAL" ? "FINAL" : phase === "PRE" ? "18:30" : phase === "CANCEL" ? "취소" : "7회말",
    homeScore: phase === "PRE" || phase === "CANCEL" ? 0 : 3,
    awayScore: phase === "PRE" || phase === "CANCEL" ? 0 : phase === "FINAL" ? 2 : 2,
    resultLabel: phase === "FINAL" ? "승" : null,
    winningPitcher: phase === "FINAL" ? "김진수" : null,
    losingPitcher: phase === "FINAL" ? "박세웅" : null,
    updatedAtEpochMs: now,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const teamId = (url.searchParams.get("teamId") ?? "lg").trim().toLowerCase();
  const mode = url.searchParams.get("mode");
  const forceMock = url.searchParams.get("mock") === "1";
  const allowMockFallback = url.searchParams.get("mockFallback") !== "0";

  if (forceMock) {
    return jsonNoStore({ ok: true, source: "mock", payload: buildMockPayload(teamId, mode) });
  }

  try {
    const date = todayKstDate();
    const [games, scores] = await Promise.all([
      fetchKboTodayGames(date, { cacheMode: "live", includeLineups: false }),
      fetchLiveScoreSnapshot(date).catch(() => []),
    ]);
    const game = games.find((item) => item.homeId === teamId || item.awayId === teamId);
    if (!game) {
      if (!allowMockFallback) {
        return jsonNoStore({
          ok: true,
          source: "none:no-team-game",
          payload: null,
        });
      }
      return jsonNoStore({
        ok: true,
        source: "mock:no-team-game",
        payload: buildMockPayload(teamId, mode),
      });
    }

    const score = scores.find((item) => item.externalId === game.id);
    const phase = resolvePhase(game);
    const homeScore =
      game.result?.homeScore ?? score?.homeScore ?? game.liveScore?.homeScore ?? 0;
    const awayScore =
      game.result?.awayScore ?? score?.awayScore ?? game.liveScore?.awayScore ?? 0;
    const inning =
      phase === "FINAL"
        ? "FINAL"
        : phase === "CANCEL"
          ? game.cancelReason === "RAIN" ? "우천 취소" : "취소"
          : phase === "PRE"
            ? game.time
            : score?.currentInningLabel ?? "LIVE";

    const payload: StagePayload = {
      gameId: game.id,
      teamId,
      homeTeam: findTeam(game.homeId).short,
      awayTeam: findTeam(game.awayId).short,
      stadium: game.stadium,
      gameStartEpochMs: gameStartEpochMs(game),
      phase,
      status:
        phase === "FINAL"
          ? "경기 종료"
          : phase === "PRE"
            ? "경기 전"
            : phase === "CANCEL"
              ? game.cancelReason === "RAIN" ? "우천 취소" : "경기 취소"
              : "LIVE",
      inning,
      homeScore,
      awayScore,
      resultLabel: resolveResultLabel(game, teamId),
      winningPitcher: game.result?.winningPitcher ?? null,
      losingPitcher: game.result?.losingPitcher ?? null,
      updatedAtEpochMs: Date.now(),
    };

    return jsonNoStore({ ok: true, source: "live", payload });
  } catch (error) {
    if (!allowMockFallback) {
      return jsonNoStore(
        {
          ok: false,
          source: "none:error",
          error: error instanceof Error ? error.message : "unknown_error",
          payload: null,
        },
        { status: 200 }
      );
    }
    return jsonNoStore(
      {
        ok: true,
        source: "mock:error",
        error: error instanceof Error ? error.message : "unknown_error",
        payload: buildMockPayload(teamId, mode),
      },
      { status: 200 }
    );
  }
}
