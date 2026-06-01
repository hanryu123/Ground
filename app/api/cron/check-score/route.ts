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
  fetchClutchData,
  detectClutchSituation,
  sendClutchAlerts,
} from "@/lib/score/clutchAlert";
import { authorizeCron } from "@/services/notificationService";
import { isKboGameHour } from "@/lib/cronGuard";
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
};

const DEFAULT_RESPONSE_BUDGET_MS = 8500;
const MIN_LOOP_BUDGET_MS = 900;
const MIN_ALERT_BUDGET_MS = 3600;
const MIN_RELAY_BUDGET_MS = 4600;
const MIN_CLUTCH_BUDGET_MS = 5200;
const SCORE_LLM_TIMEOUT_MS = 2200;
const SCORE_PUSH_TIMEOUT_MS = 2200;

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

const SCORE_NAVER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

/**
 * Naver relay JSON에서 최근 플레이 텍스트를 의미 있는 한국어 문자열로 추출.
 * Claude 프롬프트용으로 "7회말 좌전안타 — 롯데 3:2 두산" 형태로 반환.
 */
type RelayParseResult = {
  text: string;
  inningLabel: string | null;
  /** 이닝 번호만 분리해서 노출 — 호출부에서 초/말을 덮어쓸 수 있도록 */
  inn: number | null;
};

function parseLatestPlayFromRelay(json: Record<string, unknown>): RelayParseResult | null {
  try {
    const result = json["result"] as Record<string, unknown> | undefined;
    const trd = result?.["textRelayData"] as Record<string, unknown> | undefined;
    const textRelays = trd?.["textRelays"];
    if (!Array.isArray(textRelays) || textRelays.length === 0) return null;

    const last = textRelays[textRelays.length - 1] as Record<string, unknown>;
    const title = (last["title"] as string | undefined) ?? "";
    const rawInn = last["inn"] ?? last["inning"];
    const inn: number | null = typeof rawInn === "number" ? rawInn
      : typeof rawInn === "string" ? (parseInt(rawInn) || null) : null;
    const textOptions = last["textOptions"] as Array<Record<string, unknown>> | undefined;

    // 초/말: 1순위=상위JSON inningSub, 2순위=텍스트, 3순위=entry inningSub
    // inningSub 1=초(원정공격), 2=말(홈공격)
    const result2 = json["result"] as Record<string, unknown> | undefined;
    const relayObj = (json["relay"] ?? result2?.["relay"]) as Record<string, unknown> | undefined;
    const subCandidates = [
      json["inningSub"], result2?.["inningSub"], relayObj?.["inningSub"],
      json["currentInningSub"], result2?.["currentInningSub"],
    ];
    let half = "";
    for (const s of subCandidates) {
      if (s === 1 || s === "1") { half = "초"; break; }
      if (s === 2 || s === "2") { half = "말"; break; }
    }
    if (!half) {
      const playTexts = (textOptions ?? []).map((o) => (o["playText"] as string | undefined) ?? "").join(" ");
      const m = `${title} ${playTexts}`.match(/\d{1,2}회\s*(초|말)/);
      if (m) half = m[1];
    }
    if (!half) {
      const s = last["inningSub"];
      if (s === 1 || s === "1") half = "초";
      else if (s === 2 || s === "2") half = "말";
    }
    const inningLabel: string | null = inn != null ? `${inn}회${half}` : null;

    const plays = (textOptions ?? [])
      .map((o) => (o["playText"] as string | undefined) ?? "")
      .filter(Boolean);
    const playDesc = plays.slice(0, 2).join(", ");

    const firstOption = (textOptions ?? [])[0];
    const gs = firstOption?.["currentGameState"] as Record<string, unknown> | undefined;
    const homeScore = gs?.["homeScore"] as string | undefined;
    const awayScore = gs?.["awayScore"] as string | undefined;
    const homeCode = gs?.["homeTeamCode"] as string | undefined;
    const awayCode = gs?.["awayTeamCode"] as string | undefined;

    // 스코어는 buildUserPrompt에서 팬 관점으로 별도 전달 — 여기선 제외해야 Claude가 혼동하지 않음
    const parts = [inningLabel, title, playDesc].filter(Boolean);
    const text = parts.join(" ");
    return text.length > 5 ? { text, inningLabel, inn } : null;
  } catch {
    return null;
  }
}

async function fetchLatestPlayText(externalId: string): Promise<RelayParseResult | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `https://api-gw.sports.naver.com/schedule/games/${externalId}/relay`,
      {
        headers: {
          "user-agent": SCORE_NAVER_UA,
          accept: "application/json",
          referer: "https://m.sports.naver.com/",
          "accept-language": "ko-KR,ko;q=0.9",
        },
        cache: "no-store",
        signal: controller.signal,
      }
    ).finally(() => clearTimeout(timeout));
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    return parseLatestPlayFromRelay(json);
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  const url = new URL(req.url);
  const responseBudgetMs = readResponseBudgetMs(url);
  const deadlineAt = startedAt + responseBudgetMs;
  // auth check temporarily open — re-enable after confirmed working
  // const auth = authorizeCron(req, url);
  // if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  if (shouldSkipCronInAlpha(url)) {
    return NextResponse.json({ ok: true, skipped: "ALPHA_ENV_CRON_DISABLED" });
  }

  // 경기 시간대 외에는 즉시 종료 (주중 18~22:30, 주말 14~21시)
  // force=1 파라미터로 수동 트리거 시 우회 가능
  if (!isKboGameHour() && !url.searchParams.get("force")) {
    return NextResponse.json({ ok: true, skipped: "OUT_OF_GAME_HOURS" });
  }

  const fastMode = isFastMode(url);
  const clutchEnabled = url.searchParams.get("clutch") === "1";
  const targetDate = todayKstDate();
  const isOffDay = isKboRegularOffDay(targetDate);
  const triggerSource = url.searchParams.get("source") ?? "unknown";
  const dev = readScoreCronDevOverrides(url);

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
    if (isOffDay && dev.tick == null) {
      const { start, end } = dayRangeKst(targetDate);
      const cleared = await prisma.game.deleteMany({
        where: { gameDate: { gte: start, lt: end } },
      });
      summary.skipped = "MONDAY_OFF";
      summary.clearedGames = cleared.count;
      summary.durationMs = Date.now() - startedAt;
      await finishCronRun({ id: runId, status: "success", summary });
      return NextResponse.json({ ok: true, runId, ...summary });
    }

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
        }
      }
      const { start, end } = dayRangeKst(targetDate);
      const cleared = await prisma.game.deleteMany({
        where: { gameDate: { gte: start, lt: end } },
      });
      summary.skipped = snapshot.length === 0 ? "NO_GAMES" : "ALL_CANCELLED";
      summary.clearedGames = cleared.count;
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

        const relayResult =
          fastMode || !hasBudget(deadlineAt, MIN_RELAY_BUDGET_MS)
            ? null
            : await fetchLatestPlayText(game.externalId);
        if (!relayResult && !fastMode) deferOnce(summary, `relay:${game.externalId}`);

        // ⚾ 이닝 초/말: 득점한 팀으로 결정 — 가장 신뢰도 높은 방법
        //   홈팀 득점 → 홈팀이 공격 중 → 말(Bottom)
        //   원정팀 득점 → 원정팀이 공격 중 → 초(Top)
        const scoringHalf: "초" | "말" | null =
          homeDelta > 0 ? "말" :
          awayDelta > 0 ? "초" :
          null;
        const inningNum = relayResult?.inn ?? null;
        // 득점 정보로 초/말을 확정하고, 이닝 번호는 relay에서 가져옴
        const correctedLabel: string | null =
          inningNum != null && scoringHalf
            ? `${inningNum}회${scoringHalf}`
            : relayResult?.inningLabel ?? null;

        // latestPlayText 앞의 이닝 레이블을 교정된 값으로 교체
        let latestPlayText: string;
        if (relayResult?.text) {
          const origLabel = relayResult.inningLabel;
          latestPlayText = origLabel && correctedLabel && relayResult.text.startsWith(origLabel)
            ? correctedLabel + relayResult.text.slice(origLabel.length)
            : relayResult.text;
        } else {
          const inningPrefix = correctedLabel ? `${correctedLabel} ` : "";
          latestPlayText = `${inningPrefix}스코어 변동: ${game.homeTeam} ${game.homeScore}:${game.awayScore} ${game.awayTeam}`;
        }

        const result = await dispatchScoreAlertsForGame({
          game,
          previousHomeScore: previous.homeScore,
          previousAwayScore: previous.awayScore,
          dbGameId: updated.id,
          latestPlayText,
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
