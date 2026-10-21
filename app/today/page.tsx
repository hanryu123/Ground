"use client";

import { useMemo } from "react";
import HeroCard from "@/components/HeroCard";
import LiveActivityRecoveryButton from "@/components/LiveActivityRecoveryButton";
import FeedNewsSection from "@/components/feed/FeedNewsSection";
import FeedShortsSection from "@/components/feed/FeedShortsSection";
import { getFeedTheme } from "@/components/feed/feedTheme";
import { useIsOffseason } from "@/lib/season";
import { useMyTeam } from "@/lib/useMyTeam";

/**
 * /today — Feed 탭. 세로 스크롤 피드 (위에서 아래 순서).
 *
 *   1. 경기 히어로 카드 — 오늘 경기가 있으면 스크롤 영역 한 화면을 꽉 채운다.
 *   1'. 비시즌/무경기 커버 — 같은 HeroCard 를 낮게 띄워 아래 소식이 바로 보이게 한다.
 *   2. 하이라이트 숏츠 — 우리 팀 영상이 없으면 숨김
 *   3. 팔로우 선수 카드 (Phase 3)
 *   4. 우리 팀 소식 (Highlights)
 *
 *  ── 변경 이력 ──
 *   예전엔 HeroCard 단독 한 화면 고정(overflow-hidden)이었다. 순위표는 /rank 탭으로 이전.
 *
 *  BottomNav 는 fixed 이고 main 에 pb-24 가 있어, 스크롤 영역은 BottomNav 위에서 끝난다.
 */
export default function TodayPage() {
  const team = useMyTeam();
  const offseason = useIsOffseason(team.id);
  const theme = useMemo(() => getFeedTheme(team), [team]);

  return (
    <div
      className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
      style={{ background: theme.background }}
    >
      <HeroCard team={team} offseason={offseason}>
        <div className="absolute left-5 right-5 top-[76px] z-40">
          <LiveActivityRecoveryButton
            teamId={team.id}
            teamShort={team.short}
            accent={team.accent}
          />
        </div>
      </HeroCard>

      <FeedShortsSection team={team} theme={theme} />
      {/* 3. 팔로우 선수 카드 — Phase 3 에서 이 자리에 들어간다 */}
      <div className="snap-start">
        <FeedNewsSection team={team} theme={theme} />
      </div>
    </div>
  );
}
