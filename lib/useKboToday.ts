"use client";

import { useCallback, useEffect, useState } from "react";
import type { LiveGame } from "@/lib/kbo";
import type { TodayFeedStatus } from "@/lib/kbo";
import type { StandingRow } from "@/config/standings";

export type KboTodayPayload = {
  date: string;
  status: TodayFeedStatus;
  gamePhase?: "NONE" | "PRE" | "LIVE" | "END";
  message: string | null;
  fallback?: boolean;
  games: LiveGame[];
  standings: StandingRow[];
  pregamePreview?: {
    status: "PENDING" | "READY" | "FAILED";
    title: string | null;
    lines: string[];
    active: boolean;
    generatedAt: string | null;
  } | null;
  postGameReport?: {
    status: "PENDING" | "GENERATING" | "READY" | "FAILED";
    headline: string | null;
    content: string | null;
    active: boolean;
    visibleUntil: string | null;
    generatedAt: string | null;
  } | null;
  highlightVideo?: {
    url: string;
    thumbnailUrl: string | null;
    videoId: string;
  } | null;
};

type UseKboTodayOptions = {
  withStandings?: boolean;
};

export function useKboToday(
  teamId?: string,
  options?: UseKboTodayOptions
): KboTodayPayload | null {
  const [data, setData] = useState<KboTodayPayload | null>(null);
  const withStandings = options?.withStandings ?? true;
  const phase = data?.gamePhase ?? null;

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (teamId) params.set("teamId", teamId);
      if (!withStandings) params.set("withStandings", "0");
      params.set("_", String(Date.now()));
      const qs = params.toString();
      const r = await fetch(`/api/kbo/today?${qs}`, {
        cache: "no-store",
        headers: {
          "cache-control": "no-cache",
          pragma: "no-cache",
        },
      });
      if (!r.ok) return;
      const j = (await r.json()) as KboTodayPayload;
      setData(j);
    } catch {
      // 네트워크 일시 장애는 조용히 다음 주기로 넘김
    }
  }, [teamId, withStandings]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const intervalMs = phase === "LIVE" ? 12_000 : phase === "PRE" ? 30_000 : 60_000;
    const tick = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const onFocus = () => void load();

    const t = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onFocus);

    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onFocus);
    };
  }, [load, phase]);

  return data;
}
