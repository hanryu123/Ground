"use client";

import { useEffect, useState } from "react";
import type { SeasonStatus } from "@/lib/kbo";

/**
 * 우리 팀 비시즌 여부 (판단 전·실패 시 false → 기존 화면 유지).
 * 올해 남은 경기가 없는 팀 = 정규시즌 끝나고 가을야구 못 갔거나 탈락했거나, 한국시리즈가 끝났거나, 개막 전.
 * 4~9월은 정규시즌이라 조회하지 않는다.
 */
export function useIsOffseason(teamId: string): boolean {
  const [offseason, setOffseason] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const month = new Date(Date.now() + 9 * 3600_000).getUTCMonth() + 1;
    if (month >= 4 && month <= 9) {
      setOffseason(false);
      return;
    }

    void (async () => {
      try {
        const r = await fetch("/api/kbo/season");
        if (!r.ok) return;
        const status = (await r.json()) as SeasonStatus;
        if (!cancelled) setOffseason(!status.activeTeamIds.includes(teamId));
      } catch {
        // 조회 실패 시 기존 화면 유지
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return offseason;
}
