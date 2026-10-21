"use client";

import { useEffect, useState } from "react";
import type { SeasonStatus } from "@/lib/kbo";

export type SeasonPhase = {
  /** 우리 팀 올해 경기가 끝났는지 (판단 전·실패 시 false → 기존 화면 유지) */
  offseason: boolean;
  /** 포스트시즌 진행 중 — 정규시즌은 끝났고 아직 경기가 남은 팀이 있다 */
  postseason: boolean;
};

const IN_SEASON: SeasonPhase = { offseason: false, postseason: false };

/**
 * 시즌 단계.
 *  - 비시즌 팀 = 정규시즌 끝나고 가을야구 못 갔거나 탈락했거나, 한국시리즈가 끝났거나, 개막 전.
 *  - 포스트시즌 = 남은 팀이 1~9개 (정규시즌 중엔 10개, 한국시리즈 뒤엔 0개).
 * 4~9월은 정규시즌이라 조회하지 않는다.
 */
export function useSeasonPhase(teamId: string): SeasonPhase {
  const [phase, setPhase] = useState<SeasonPhase>(IN_SEASON);

  useEffect(() => {
    let cancelled = false;
    const month = new Date(Date.now() + 9 * 3600_000).getUTCMonth() + 1;
    if (month >= 4 && month <= 9) {
      setPhase(IN_SEASON);
      return;
    }

    void (async () => {
      try {
        const r = await fetch("/api/kbo/season");
        if (!r.ok) return;
        const { activeTeamIds } = (await r.json()) as SeasonStatus;
        if (cancelled) return;
        setPhase({
          offseason: !activeTeamIds.includes(teamId),
          postseason: activeTeamIds.length > 0 && activeTeamIds.length < 10,
        });
      } catch {
        // 조회 실패 시 기존 화면 유지
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [teamId]);

  return phase;
}
