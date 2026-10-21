"use client";

import { useEffect, useState } from "react";
import type { StandingsPayload } from "@/lib/standings";

/** /rank 순위표 데이터 — 진입 시 1회 + 5분마다 갱신. 실패하면 error 만 세운다. */
export function useStandings(): { data: StandingsPayload | null; error: boolean } {
  const [data, setData] = useState<StandingsPayload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/kbo/standings", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as StandingsPayload;
        if (alive) {
          setData(json);
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      }
    };
    void load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return { data, error };
}
