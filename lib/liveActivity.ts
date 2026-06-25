"use client";

import { Capacitor, registerPlugin } from "@capacitor/core";

export type GroundLiveActivityPayload = {
  gameId: string;
  teamId: string;
  homeTeam: string;
  awayTeam: string;
  stadium?: string | null;
  gameStartEpochMs?: number | null;
  phase: "PRE" | "LIVE" | "FINAL" | "CANCEL";
  status: string;
  inning: string;
  homeScore: number;
  awayScore: number;
  resultLabel?: string | null;
  winningPitcher?: string | null;
  losingPitcher?: string | null;
  updatedAtEpochMs: number;
  subscribeUrl?: string | null;
};

type Availability = {
  available: boolean;
  platform: string;
  reason?: string;
  activitiesEnabled?: boolean;
};

type GroundLiveActivityPlugin = {
  isAvailable(): Promise<Availability>;
  start(input: GroundLiveActivityPayload): Promise<{ ok: boolean; activityId?: string }>;
  update(input: GroundLiveActivityPayload): Promise<{ ok: boolean; activityId?: string }>;
  end(input: GroundLiveActivityPayload): Promise<{ ok: boolean; activityId?: string }>;
};

const GroundLiveActivity = registerPlugin<GroundLiveActivityPlugin>("GroundLiveActivity");

function withSubscribeUrl(payload: GroundLiveActivityPayload): GroundLiveActivityPayload {
  if (typeof window === "undefined" || payload.subscribeUrl) return payload;
  return {
    ...payload,
    subscribeUrl: new URL("/api/live-activity/subscribe", window.location.origin).toString(),
  };
}

export async function getLiveActivityAvailability(): Promise<Availability> {
  if (Capacitor.getPlatform() !== "ios") {
    return { available: false, platform: Capacitor.getPlatform(), reason: "ios_only" };
  }
  try {
    return await GroundLiveActivity.isAvailable();
  } catch (error) {
    return {
      available: false,
      platform: "ios",
      reason: error instanceof Error ? error.message : "native_plugin_unavailable",
    };
  }
}

export async function startLiveActivityStage(payload: GroundLiveActivityPayload) {
  return GroundLiveActivity.start(withSubscribeUrl(payload));
}

export async function updateLiveActivityStage(payload: GroundLiveActivityPayload) {
  return GroundLiveActivity.update(withSubscribeUrl(payload));
}

export async function endLiveActivityStage(payload: GroundLiveActivityPayload) {
  return GroundLiveActivity.end(withSubscribeUrl(payload));
}
