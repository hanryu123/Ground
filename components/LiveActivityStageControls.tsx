"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCcw, Square, Zap } from "lucide-react";
import {
  endLiveActivityStage,
  getLiveActivityAvailability,
  startLiveActivityStage,
  updateLiveActivityStage,
  type GroundLiveActivityPayload,
} from "@/lib/liveActivity";

type Props = {
  teamId: string;
};

type StageResponse = {
  ok: boolean;
  source: string;
  payload: GroundLiveActivityPayload;
  error?: string;
};

type StatusState = {
  label: string;
  detail?: string;
  tone: "idle" | "ok" | "error";
};

export default function LiveActivityStageControls({ teamId }: Props) {
  const [availability, setAvailability] = useState<string>("checking");
  const [payload, setPayload] = useState<GroundLiveActivityPayload | null>(null);
  const [status, setStatus] = useState<StatusState>({
    label: "Live Activity stage",
    tone: "idle",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLiveActivityAvailability().then((result) => {
      if (cancelled) return;
      setAvailability(
        result.available
          ? "available"
          : result.reason ?? (result.activitiesEnabled === false ? "disabled" : "unavailable")
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPayload = useCallback(
    async (mode?: "pre" | "live" | "final" | "cancel") => {
      const params = new URLSearchParams({ teamId, _: String(Date.now()) });
      if (mode) {
        params.set("mock", "1");
        params.set("mode", mode);
      }
      const response = await fetch(`/api/live-activity/stage?${params.toString()}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`stage_payload_${response.status}`);
      const data = (await response.json()) as StageResponse;
      if (!data.ok || !data.payload) throw new Error(data.error ?? "stage_payload_empty");
      setPayload(data.payload);
      return { payload: data.payload, source: data.source };
    },
    [teamId]
  );

  const run = useCallback(
    async (
      action: "start" | "update" | "end",
      mode?: "pre" | "live" | "final" | "cancel"
    ) => {
      setBusy(true);
      try {
        const loaded = await loadPayload(mode);
        if (action === "start") await startLiveActivityStage(loaded.payload);
        else if (action === "update") await updateLiveActivityStage(loaded.payload);
        else await endLiveActivityStage(loaded.payload);
        setStatus({
          label: `${action} ok`,
          detail: `${loaded.payload.inning} · ${loaded.payload.homeTeam} ${loaded.payload.homeScore}:${loaded.payload.awayScore} ${loaded.payload.awayTeam} · ${loaded.source}`,
          tone: "ok",
        });
      } catch (error) {
        setStatus({
          label: `${action} failed`,
          detail: error instanceof Error ? error.message : "unknown_error",
          tone: "error",
        });
      } finally {
        setBusy(false);
      }
    },
    [loadPayload]
  );

  return (
    <div className="absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-40 rounded-lg border border-white/15 bg-black/72 p-3 text-white shadow-2xl backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
            stage only
          </p>
          <p className="truncate text-sm font-bold">{status.label}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
            availability === "available"
              ? "bg-emerald-400/15 text-emerald-200"
              : "bg-amber-400/15 text-amber-200"
          }`}
        >
          {availability}
        </span>
      </div>

      {status.detail && (
        <p
          className={`mb-2 line-clamp-2 text-xs ${
            status.tone === "error" ? "text-red-200" : "text-white/70"
          }`}
        >
          {status.detail}
        </p>
      )}

      <div className="grid grid-cols-4 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("start")}
          className="flex h-10 items-center justify-center rounded-md bg-white/12 text-white disabled:opacity-45"
          aria-label="Live Activity 시작"
          title="Live Activity 시작"
        >
          <Zap size={16} />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("update")}
          className="flex h-10 items-center justify-center rounded-md bg-white/12 text-white disabled:opacity-45"
          aria-label="Live Activity 업데이트"
          title="Live Activity 업데이트"
        >
          <RefreshCcw size={16} />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run("end", "final")}
          className="flex h-10 items-center justify-center rounded-md bg-white/12 text-white disabled:opacity-45"
          aria-label="Live Activity 종료"
          title="Live Activity 종료"
        >
          <Square size={15} />
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(payload?.phase === "PRE" ? "update" : "start", "pre")}
          className="flex h-10 items-center justify-center rounded-md bg-white/12 text-white disabled:opacity-45"
          aria-label="Mock 카운트다운"
          title="Mock 카운트다운"
        >
          <Activity size={16} />
        </button>
      </div>
    </div>
  );
}
