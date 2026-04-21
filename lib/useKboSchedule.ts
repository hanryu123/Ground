"use client";

import { useEffect, useState } from "react";
import type { ScheduleBundle } from "@/lib/kbo";

/**
 * /api/kbo/schedule 5분 마다 폴링.
 *
 *  - `initial` 을 넘기면 SSR 로 받아온 번들로 바로 시작 → 첫 paint 부터 라이브 데이터.
 *    (이전엔 null 로 시작해 클라 fetch 가 끝날 때까지 정적 fallback 이 잠깐 보임.)
 *  - 첫 로드 직후 한 번 더 백그라운드 fetch 해서 SSR 시점과의 시차(최대 60초) 보정.
 */
export function useKboSchedule(
  initial?: ScheduleBundle | null
): ScheduleBundle | null {
  const [data, setData] = useState<ScheduleBundle | null>(initial ?? null);

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
