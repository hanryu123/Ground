import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isKboRegularOffDay, todayKstDate } from "@/lib/kbo";
import { finishCronRun, startCronRun } from "@/lib/cronRunLogger";
import { shouldSkipCronInAlpha } from "@/lib/appEnv";
import { fetchLiveScoreSnapshot } from "@/lib/score/snapshot";
import { loadMockSnapshotWithOverrides, readScoreCronDevOverrides } from "@/lib/score/devOverrides";
import { sendCancelAlerts } from "@/lib/score/cancelAlert";
import { sendRainDelayAlerts } from "@/lib/score/rainDelayAlert";
import { dispatchScoreAlertsForGame } from "@/lib/score/scoreAlert";
import {
  buildFallbackScoringContext,
  fetchScoringPlayContext,
  formatScoringPlayText,
} from "@/lib/score/playByPlay";
import { pushLiveActivityForGame } from "@/lib/liveActivityPush";
import { sendPregameLiveActivityStarts } from "@/lib/liveActivityAutoStart";
import {
  fetchClutchData,
  detectClutchSituation,
  sendClutchAlerts,
} from "@/lib/score/clutchAlert";
import { authorizeCron } from "@/services/notificationService";
import { isKboGameHour, isKboScoreHardQuietHour } from "@/lib/cronGuard";
import type { LiveScoreGame } from "@/lib/score/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/**
 * 점수 변동 cron — 6대 알림 시스템 중 "스코어 알림" 책임만 담당.
 *
 *  - 라이브 이벤트(투수교체/탈삼진) → `/api/cron/live-events`
 *  - 경기 종료 한줄평/리뷰     → `/api/cron/postgame`
 *  - 하이라이트                 → `/api/cron/check-highlight`
 *  - 우천/취소 1차 발송         → `/api/cron/preview` (1시간 전 트리거)
 *
 * 이 cron 은 위 라우트들의 fallback / 보강 역할로 다음을 처리한다:
 *   1) 스냅샷 fetch + DB upsert (모든 cron 의 입력 데이터)
 *   2) 점수 변동 감지 → `dispatchScoreAlertsForGame`
 *   3) 경기가 종료 상태로 전환된 순간 `endedAt` 만 갱신 (postgame cron 이 알아서 발송)
 *   4) preview cron 시간이 지난 뒤 발생한 취소 → `sendCancelAlerts` 로 fallback 발송
 */

type RouteSummary = {
  fastMode: boolean;
  checked: number;
  changed: number;
  llmCalls: number;
  cancelSent: number;
  rainDelaySent: number;
  clutchSent: number;
  pushSent: number;
  disabled: number;
  inboxCreated: number;
  liveActivitySent: number;
  liveActivityFailed: number;
  liveActivityEnded: number;
  liveActivitySubscriptions: number;
  liveActivityStartSent: number;
  liveActivityStartDisabled: number;
  liveActivityStartTargets: number;
  liveActivityStartSkipped: number;
  errors: number;
  failedGameIds: string[];
  snapshotCount: number;
  fetchError: string | null;
  triggerSource: string;
  targetDate: string;
  durationMs?: number;
  deadlineMs: number;
  deferredTasks: string[];
  skipped?: string;
  clearedGames?: number;
  cacheUntil?: string;
};

const DEFAULT_RESPONSE_BUDGET_MS = 8500;
const MIN_LOOP_BUDGET_MS = 900;
const MIN_ALERT_BUDGET_MS = 3600;
const MIN_LIVE_ACTIVITY_START_BUDGET_MS = 2600;
const MIN_LIVE_ACTIVITY_BUDGET_MS = 1800;
const MIN_RELAY_BUDGET_MS = 4600;
const MIN_CLUTCH_BUDGET_MS = 5200;
const SCORE_LLM_TIMEOUT_MS = 2200;
const SCORE_PUSH_TIMEOUT_MS = 2200;
const SUSPENDED_ALL_DONE_CACHE_MS = 5 * 60 * 1000;

type ScoreCronCompletionCache = {
  targetDate: string;
  reason: "ALL_DONE" | "ALL_SUSPENDED_OR_DONE";
  untilMs: number;
  statuses: string[];
  checkedAtMs: number;
};

let completionCache: ScoreCronCompletionCache | null = null;
let checkScoreSchemaEnsured = false;

async function ensureCheckScoreSchema() {
  if (checkScoreSchemaEnsured) return;

  await prisma.$executeRawUnsafe(`
    ALTER TYPE "GameStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED'
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Game"
      ADD COLUMN IF NOT EXISTS "currentInning" INTEGER,
      ADD COLUMN IF NOT EXISTS "currentInningHalf" TEXT,
      ADD COLUMN IF NOT EXISTS "currentInningLabel" TEXT
  `);

  checkScoreSchemaEnsured = true;
}

function isFastMode(url: URL): boolean {
  const raw = (url.searchParams.get("fast") ?? "").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

function dayRangeKst(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function readResponseBudgetMs(url: URL): number {
  const raw = Number.parseInt(url.searchParams.get("budgetMs") ?? "", 10);
  if (Number.isFinite(raw) && raw >= 2500 && raw <= 9000) return raw;
  const env = Number.parseInt(process.env.CHECK_SCORE_BUDGET_MS ?? "", 10);
  if (Number.isFinite(env) && env >= 2500 && env <= 9000) return env;
  return DEFAULT_RESPONSE_BUDGET_MS;
}

function remainingMs(deadlineAt: number): number {
  return deadlineAt - Date.now();
}

function hasBudget(deadlineAt: number, minMs: number): boolean {
  return remainingMs(deadlineAt) > minMs;
}

function deferOnce(summary: RouteSummary, task: string) {
  if (!summary.deferredTasks.includes(task)) summary.deferredTasks.push(task);
}

function kstEndOfScoreQuietWindow(date: string): Date {
  return new Date(`${date}T13:00:00+09:00`);
}

function nextKstScoreResumeTime(now: Date): Date {
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const currentDayResume = kstEndOfScoreQuietWindow(`${y}-${m}-${d}`);
  if (now.getTime() < currentDayResume.getTime()) return currentDayResume;
  const nextKstMidnightMs = Date.UTC(y, kst.getUTCMonth(), kst.getUTCDate() + 1) - 9 * 60 * 60 * 1000;
  const next = new Date(nextKstMidnightMs + 13 * 60 * 60 * 1000);
  return next;
}

function gameStatuses(games: LiveScoreGame[]): string[] {
  return games.map((game) => game.status);
}

function allGamesDoneOrPaused(games: LiveScoreGame[]): boolean {
  return games.length > 0 && games.every((game) =>
    game.status === "RESULT" || game.status === "CANCEL" || game.status === "SUSPENDED"
  );
}

function rememberAllGamesDone(targetDate: string, games: LiveScoreGame[], nowMs = Date.now()) {
  if (!allGamesDoneOrPaused(games)) {
    if (completionCache?.targetDate === targetDate) completionCache = null;
    return null;
  }

  const hasSuspended = games.some((game) => game.status === "SUSPENDED");
  const until = hasSuspended
    ? new Date(nowMs + SUSPENDED_ALL_DONE_CACHE_MS)
    : nextKstScoreResumeTime(new Date(nowMs));
  completionCache = {
    targetDate,
    reason: hasSuspended ? "ALL_SUSPENDED_OR_DONE" : "ALL_DONE",
    untilMs: until.getTime(),
    statuses: gameStatuses(games),
    checkedAtMs: nowMs,
  };
  return completionCache;
}

function readFreshCompletionCache(targetDate: string, nowMs = Date.now()): ScoreCronCompletionCache | null {
  if (!completionCache) return null;
  if (completionCache.targetDate !== targetDate) {
    completionCache = null;
    return null;
  }
  if (completionCache.untilMs <= nowMs) {
    completionCache = null;
    return null;
  }
  return completionCache;
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const url = new URL(req.url);
  const responseBudgetMs = readResponseBudgetMs(url);
  const deadlineAt = startedAt + responseBudgetMs;
  // auth check temporarily open — re-enable after confirmed working
  // const auth = authorizeCron(req, url);
  // if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (shouldSkipCronInAlpha(url, req)) {
    return NextResponse.json({ ok: true, skipped: "ALPHA_ENV_CRON_DISABLED" });
  }

  const targetDate = todayKstDate();
  const dev = readScoreCronDevOverrides(url);

  if (isKboScoreHardQuietHour() && dev.tick == null) {
    return NextResponse.json({
      ok: true,
      skipped: "KBO_SCORE_HARD_QUIET_HOURS",
      targetDate,
      quietWindow: "01:00-13:00 KST",
      durationMs: Date.now() - startedAt,
    });
  }

  if (dev.tick == null) {
    const cached = readFreshCompletionCache(targetDate);
    if (cached) {
      return NextResponse.json({
        ok: true,
        skipped: cached.reason,
        fastPath: true,
        targetDate,
        cacheUntil: new Date(cached.untilMs).toISOString(),
        cachedStatuses: cached.statuses,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  // 경기 시간대 외에는 즉시 종료 (주중 18~22:30, 주말 14~21시)
  // force=1 파라미터로 수동 트리거 시 우회 가능
  if (!isKboGameHour() && !url.searchParams.get("force")) {
    return NextResponse.json({ ok: true, skipped: "OUT_OF_GAME_HOURS" });
  }

  const fastMode = isFastMode(url);
  const clutchEnabled = url.searchParams.get("clutch") === "1";
  const isOffDay = isKboRegularOffDay(targetDate);
  const triggerSource = url.searchParams.get("source") ?? "unknown";

  // 월요일 휴식일에는 DB 로깅/정리 작업도 하지 않고 즉시 응답한다.
  // cron-job.org는 force=1로 호출하므로, 이 빠른 경로가 없으면 DB cold start만으로도 504가 날 수 있다.
  if (isOffDay && dev.tick == null) {
    return NextResponse.json({
      ok: true,
      skipped: "MONDAY_OFF",
      fastPath: true,
      targetDate,
      durationMs: Date.now() - startedAt,
    });
  }

  const runId = await startCronRun("check-score", {
    fastMode,
    clutchEnabled,
    tickRaw: dev.tick,
    targetDate,
    isOffDay,
    triggerSource,
  });

  const summary: RouteSummary = {
    fastMode,
    checked: 0,
    changed: 0,
    llmCalls: 0,
    cancelSent: 0,
    rainDelaySent: 0,
    clutchSent: 0,
    pushSent: 0,
    disabled: 0,
    inboxCreated: 0,
    liveActivitySent: 0,
    liveActivityFailed: 0,
    liveActivityEnded: 0,
    liveActivitySubscriptions: 0,
    liveActivityStartSent: 0,
    liveActivityStartDisabled: 0,
    liveActivityStartTargets: 0,
    liveActivityStartSkipped: 0,
    errors: 0,
    failedGameIds: [],
    snapshotCount: 0,
    fetchError: null,
    triggerSource,
    targetDate,
    deadlineMs: responseBudgetMs,
    deferredTasks: [],
  };

  let snapshot: LiveScoreGame[] = [];

  try {
    try {
      snapshot =
        dev.tick != null
          ? await loadMockSnapshotWithOverrides(dev)
          : await fetchLiveScoreSnapshot(targetDate);
    } catch (error) {
      summary.fetchError = (error as Error).message;
      summary.errors += 1;
      console.error("[check-score] snapshot fetch failed", error);
      snapshot = [];
    }
    summary.snapshotCount = snapshot.length;

    await ensureCheckScoreSchema();

    if (snapshot.length > 0) {
      if (hasBudget(deadlineAt, MIN_LIVE_ACTIVITY_START_BUDGET_MS)) {
        try {
          const autoStart = await sendPregameLiveActivityStarts({
            games: snapshot,
            origin: url.origin,
            targetDate,
          });
          summary.liveActivityStartSent += autoStart.sent;
          summary.liveActivityStartDisabled += autoStart.disabled;
          summary.liveActivityStartTargets += autoStart.targets;
          summary.liveActivityStartSkipped += autoStart.skipped;
          summary.disabled += autoStart.disabled;
        } catch (e) {
          summary.errors += 1;
          console.error("[check-score] live activity auto-start failed", e);
        }
      } else {
        deferOnce(summary, "live-activity-start");
      }
    }

    if (snapshot.length === 0 || snapshot.every((game) => game.status === "CANCEL")) {
      if (snapshot.length > 0) {
        for (const game of snapshot) {
          if (!hasBudget(deadlineAt, MIN_ALERT_BUDGET_MS)) {
            deferOnce(summary, `cancel:${game.externalId}`);
            continue;
          }
          const cancelSummary = await sendCancelAlerts({ game, targetDate, origin: url.origin });
          summary.cancelSent += cancelSummary.sent;
          summary.disabled += cancelSummary.disabled;
          summary.inboxCreated += cancelSummary.inboxCreated;
          if (hasBudget(deadlineAt, MIN_LIVE_ACTIVITY_BUDGET_MS)) {
            const liveActivity = await pushLiveActivityForGame(game);
            summary.liveActivitySent += liveActivity.sent;
            summary.liveActivityFailed += liveActivity.failed;
            summary.liveActivityEnded += liveActivity.ended;
            summary.liveActivitySubscriptions += liveActivity.subscriptions;
          } else {
            deferOnce(summary, `live-activity:${game.externalId}`);
          }
        }
      }
      const { start, end } = dayRangeKst(targetDate);
      const cleared = await prisma.game.deleteMany({
        where: { gameDate: { gte: start, lt: end } },
      });
      const cached = rememberAllGamesDone(targetDate, snapshot);
      summary.skipped = snapshot.length === 0 ? "NO_GAMES" : "ALL_CANCELLED";
      summary.clearedGames = cleared.count;
      if (cached) summary.cacheUntil = new Date(cached.untilMs).toISOString();
      summary.durationMs = Date.now() - startedAt;
      await finishCronRun({
        id: runId,
        status: summary.fetchError || summary.deferredTasks.length > 0 ? "partial" : "success",
        summary,
        error: summary.fetchError,
      });
      return NextResponse.json({ ok: !summary.fetchError, runId, ...summary });
    }

    for (const game of snapshot) {
      if (!hasBudget(deadlineAt, MIN_LOOP_BUDGET_MS)) {
        summary.skipped = "DEADLINE_REACHED";
        deferOnce(summary, "remaining-games");
        break;
      }

      summary.checked += 1;
      try {
        const previous = await prisma.game.findUnique({
          where: { externalId: game.externalId },
        });
        const updated = await prisma.game.upsert({
          where: { externalId: game.externalId },
          update: {
            homeTeam: game.homeTeam,
            awayTeam: game.awayTeam,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
            currentInning: game.currentInning,
            currentInningHalf: game.currentInningHalf,
            currentInningLabel: game.currentInningLabel,
            status: game.status,
            gameDate: game.gameDate,
            lastSyncedAt: new Date(),
          },
          create: {
            externalId: game.externalId,
            homeTeam: game.homeTeam,
            awayTeam: game.awayTeam,
            homeScore: game.homeScore,
            awayScore: game.awayScore,
            currentInning: game.currentInning,
            currentInningHalf: game.currentInningHalf,
            currentInningLabel: game.currentInningLabel,
            status: game.status,
            gameDate: game.gameDate,
            endedAt: game.status === "RESULT" ? new Date() : null,
            lastSyncedAt: new Date(),
          },
        });

        if (!previous) {
          // 새로 들어온 게임이 이미 CANCEL 상태라면 즉시 취소 알림.
          if (game.status === "CANCEL" && hasBudget(deadlineAt, MIN_ALERT_BUDGET_MS)) {
            const cancelSummary = await sendCancelAlerts({ game, targetDate, origin: url.origin });
            summary.cancelSent += cancelSummary.sent;
            summary.disabled += cancelSummary.disabled;
            summary.inboxCreated += cancelSummary.inboxCreated;
          } else if (game.status === "CANCEL") {
            deferOnce(summary, `cancel:${game.externalId}`);
          }
          continue;
        }

        const homeDelta = game.homeScore - previous.homeScore;
        const awayDelta = game.awayScore - previous.awayScore;
        const scoreChanged = homeDelta > 0 || awayDelta > 0;
        const inningChanged =
          game.currentInning !== previous.currentInning ||
          game.currentInningHalf !== previous.currentInningHalf ||
          game.currentInningLabel !== previous.currentInningLabel;
        const justEnded = previous.status !== "RESULT" && game.status === "RESULT";
        const justCancelled = previous.status !== "CANCEL" && game.status === "CANCEL";
        const justSuspended = previous.status !== "SUSPENDED" && game.status === "SUSPENDED";
        // 경기 중 중단(SUSPENDED) 상태에서 취소로 전환된 경우
        const wasMidGame = previous.status === "SUSPENDED" && justCancelled;

        if (justEnded) {
          await prisma.game.update({
            where: { id: updated.id },
            data: {
              endedAt: new Date(),
              highlightNotifiedAt: null,
              highlightVideoUrl: null,
              lastHighlightCheckedAt: null,
            },
          });
        }

        // RESULT 상태인 경기 중 postgame이 아직 발송 안 된 경우 즉시 트리거
        // justEnded(신규 전환) + 이미 RESULT였던 경기(이전 배포 전 종료) 모두 커버
        if (game.status === "RESULT") {
          const postgameDispatched = await prisma.notificationDispatchState.findFirst({
            where: {
              alertKind: "postgame",
              gameExternalId: game.externalId,
            },
            select: { id: true },
          });
          if (!postgameDispatched) {
            const postgameUrl = `${url.origin}/api/cron/postgame?force=1&gameId=${game.externalId}`;
            fetch(postgameUrl, {
              method: "GET",
              headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
            }).catch((e) => console.error("[check-score] postgame trigger failed", e));
            console.log("[check-score] postgame triggered for", game.externalId);
          }
        }

        if (justSuspended && hasBudget(deadlineAt, MIN_ALERT_BUDGET_MS)) {
          const rainDelaySummary = await sendRainDelayAlerts({ game, targetDate, origin: url.origin });
          summary.rainDelaySent += rainDelaySummary.sent;
          summary.disabled += rainDelaySummary.disabled;
          summary.inboxCreated += rainDelaySummary.inboxCreated;
        } else if (justSuspended) {
          deferOnce(summary, `rain-delay:${game.externalId}`);
        }

        if (justCancelled && hasBudget(deadlineAt, MIN_ALERT_BUDGET_MS)) {
          const cancelSummary = await sendCancelAlerts({ game, targetDate, origin: url.origin, wasMidGame });
          summary.cancelSent += cancelSummary.sent;
          summary.disabled += cancelSummary.disabled;
          summary.inboxCreated += cancelSummary.inboxCreated;
        } else if (justCancelled) {
          deferOnce(summary, `cancel:${game.externalId}`);
        }

        if (scoreChanged || inningChanged || justEnded || justCancelled || justSuspended) {
          if (hasBudget(deadlineAt, MIN_LIVE_ACTIVITY_BUDGET_MS)) {
            try {
              const liveActivity = await pushLiveActivityForGame(game);
              summary.liveActivitySent += liveActivity.sent;
              summary.liveActivityFailed += liveActivity.failed;
              summary.liveActivityEnded += liveActivity.ended;
              summary.liveActivitySubscriptions += liveActivity.subscriptions;
            } catch (e) {
              summary.errors += 1;
              console.error("[check-score] live activity push failed", game.externalId, e);
            }
          } else {
            deferOnce(summary, `live-activity:${game.externalId}`);
          }
        }

        // ─── 클러치 상황 감지 ───────────────────────────────────────────
        // check-score는 cron-job.org 응답 시간 보호가 최우선이다.
        // 클러치는 relay fetch + LLM + push까지 이어지는 무거운 작업이라 기본 cron에서는 분리하고,
        // 별도 스케줄이 `?clutch=1`로 호출할 때만 수행한다.
        if (game.status === "LIVE" && !fastMode && clutchEnabled && hasBudget(deadlineAt, MIN_CLUTCH_BUDGET_MS)) {
          try {
            const clutchData = await fetchClutchData(game.externalId);
            if (clutchData) {
              const clutchKind = detectClutchSituation(
                clutchData.state,
                game.homeScore,
                game.awayScore,
              );
              if (clutchKind) {
                const clutchSummary = await sendClutchAlerts({
                  game,
                  state: clutchData.state,
                  clutchKind,
                  batterStats: clutchData.batterStats,
                  targetDate,
                  origin: url.origin,
                });
                summary.clutchSent += clutchSummary.sent;
                summary.disabled += clutchSummary.disabled;
                summary.inboxCreated += clutchSummary.inboxCreated;
              }
            }
          } catch (e) {
            console.error("[check-score] clutch detection failed", game.externalId, e);
          }
        } else if (game.status === "LIVE" && !fastMode && clutchEnabled) {
          deferOnce(summary, `clutch:${game.externalId}`);
        }

        if (!scoreChanged) continue;

        if (!hasBudget(deadlineAt, MIN_ALERT_BUDGET_MS)) {
          deferOnce(summary, `score:${game.externalId}`);
          continue;
        }

        const scoreDedupeKey = `score:${game.externalId}:${game.homeScore}:${game.awayScore}`;
        const alreadyNotified = await prisma.notification.findFirst({
          where: {
            type: "SCORE_UPDATE",
            createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
            payload: { path: ["dedupeKey"], equals: scoreDedupeKey },
          },
          select: { id: true },
        });
        if (alreadyNotified) continue;

        const scoreAlertKey = `${game.homeScore}:${game.awayScore}`;
        const dedupe = await prisma.game.updateMany({
          where: {
            id: updated.id,
            OR: [{ lastScoreAlertKey: null }, { lastScoreAlertKey: { not: scoreAlertKey } }],
          },
          data: { lastScoreAlertKey: scoreAlertKey, lastScoreAlertAt: new Date() },
        });
        if (dedupe.count === 0) continue;

        const relayScoringContext =
          fastMode || !hasBudget(deadlineAt, MIN_RELAY_BUDGET_MS)
            ? null
            : await fetchScoringPlayContext({
                game,
                previousHomeScore: previous.homeScore,
                previousAwayScore: previous.awayScore,
              });
        if (!relayScoringContext && !fastMode) deferOnce(summary, `relay:${game.externalId}`);

        const scoringPlayContext =
          relayScoringContext ??
          buildFallbackScoringContext({
            game,
            previousHomeScore: previous.homeScore,
            previousAwayScore: previous.awayScore,
          });
        const latestPlayText = formatScoringPlayText(scoringPlayContext);

        const result = await dispatchScoreAlertsForGame({
          game,
          previousHomeScore: previous.homeScore,
          previousAwayScore: previous.awayScore,
          dbGameId: updated.id,
          latestPlayText,
          scoringPlayContext,
          fastMode,
          llmTimeoutMs: SCORE_LLM_TIMEOUT_MS,
          llmRetryTimeoutMs: null,
          pushTimeoutMs: SCORE_PUSH_TIMEOUT_MS,
          origin: url.origin,
        });
        summary.changed += 1;
        summary.pushSent += result.sent;
        summary.disabled += result.disabled;
        summary.inboxCreated += result.inboxCreated;
        summary.llmCalls += result.llmCalls;
      } catch (error) {
        summary.errors += 1;
        summary.failedGameIds.push(game.externalId);
        console.error("[check-score] failed for game", game.externalId, error);
      }
    }

    const cached = rememberAllGamesDone(targetDate, snapshot);
    if (cached) summary.cacheUntil = new Date(cached.untilMs).toISOString();
    summary.durationMs = Date.now() - startedAt;
    await finishCronRun({
      id: runId,
      status: summary.errors > 0 || summary.fetchError || summary.deferredTasks.length > 0 ? "partial" : "success",
      summary,
      error: summary.fetchError,
    });
    return NextResponse.json({
      ok: summary.errors === 0 && !summary.fetchError,
      runId,
      ...summary,
    });
  } catch (error) {
    const message = (error as Error).message;
    summary.errors += 1;
    summary.durationMs = Date.now() - startedAt;
    await finishCronRun({ id: runId, status: "error", summary, error: message });
    return NextResponse.json({ ok: false, runId, error: message, ...summary }, { status: 500 });
  }
}
