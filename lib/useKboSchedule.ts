"use client";

import { useEffect, useState } from "react";
import type { ScheduleBundle } from "@/lib/kbo";

/**
 * /api/kbo/schedule 5분 마다 폴링.
 * 첫 로드 직전엔 null 만 반환 — 페이지에서 정적 폴백 또는 스켈레톤으로 처리.
 */
export function useKboSchedule(): ScheduleBundle | null {
  const [data, setData] = useState<ScheduleBundle | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/kbo/schedule", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as ScheduleBundle;
        if (!cancelled) setData(j);
      } catch {
        // 네트워크 일시 장애는 다음 주기로 넘김
      }
    };
    void load();
    const t = window.setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  return data;
}
