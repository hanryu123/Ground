"use client";

import { Capacitor } from "@capacitor/core";
import {
  endLiveActivityStage,
  getLiveActivityAvailability,
  startLiveActivityStage,
  type GroundLiveActivityPayload,
} from "@/lib/liveActivity";

type StageResponse = {
  ok: boolean;
  source: string;
  payload?: GroundLiveActivityPayload;
  error?: string;
};

type RecoveryResult = {
  ok: boolean;
  action: "started" | "ended" | "skipped";
  reason?: string;
  gameId?: string;
};

const RECOVERY_KEY_PREFIX = "ground-live-activity-recovery";
const RECOVERY_THROTTLE_MS = 5 * 60 * 1000;

function recoveryKey(teamId: string): string {
  return `${RECOVERY_KEY_PREFIX}:${teamId}`;
}

function shouldThrottle(teamId: string, gameId: string): boolean {
  try {
    const raw = localStorage.getItem(recoveryKey(teamId));
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { gameId?: string; attemptedAt?: number };
    return (
      parsed.gameId === gameId &&
      typeof parsed.attemptedAt === "number" &&
      Date.now() - parsed.attemptedAt < RECOVERY_THROTTLE_MS
    );
  } catch {
    return false;
  }
}

function markAttempt(teamId: string, gameId: string): void {
  try {
    localStorage.setItem(
      recoveryKey(teamId),
      JSON.stringify({ gameId, attemptedAt: Date.now() })
    );
  } catch {
    // ignore storage failures
  }
}

async function fetchStagePayload(teamId: string): Promise<GroundLiveActivityPayload | null> {
  const params = new URLSearchParams({
    teamId,
    mockFallback: "0",
    _: String(Date.now()),
  });
  const res = await fetch(`/api/live-activity/stage?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`stage_payload_${res.status}`);
  const data = (await res.json()) as StageResponse;
  if (!data.ok || !data.payload) return null;
  return data.payload;
}

export async function recoverLiveActivityForTeam(
  teamId: string,
  options?: { force?: boolean }
): Promise<RecoveryResult> {
  if (typeof window === "undefined" || Capacitor.getPlatform() !== "ios") {
    return { ok: true, action: "skipped", reason: "ios_only" };
  }

  const availability = await getLiveActivityAvailability();
  if (!availability.available) {
    return { ok: true, action: "skipped", reason: availability.reason ?? "unavailable" };
  }

  const payload = await fetchStagePayload(teamId);
  if (!payload) {
    return { ok: true, action: "skipped", reason: "no_payload" };
  }

  if (!options?.force && shouldThrottle(teamId, payload.gameId)) {
    return { ok: true, action: "skipped", reason: "throttled", gameId: payload.gameId };
  }
  markAttempt(teamId, payload.gameId);

  if (payload.phase === "FINAL" || payload.phase === "CANCEL") {
    await endLiveActivityStage(payload);
    return { ok: true, action: "ended", gameId: payload.gameId };
  }

  await startLiveActivityStage(payload);
  return { ok: true, action: "started", gameId: payload.gameId };
}
