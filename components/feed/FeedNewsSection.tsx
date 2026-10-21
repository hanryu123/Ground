"use client";

import TeamNewsList from "@/components/TeamNewsList";
import type { Team } from "@/lib/teams";
import type { FeedTheme } from "@/components/feed/feedTheme";

const PAGE_SIZE = 10;

/** 피드 4번 블록 — 우리 팀 소식 (Highlights). 태그 필터 + 무한 스크롤. */
export default function FeedNewsSection({ team, theme }: { team: Team; theme: FeedTheme }) {
  return (
    <section className="px-5 pb-10 pt-7" aria-labelledby="feed-news-title">
      <div className="mb-4 flex items-baseline justify-between">
        <h2
          id="feed-news-title"
          className="text-[20px] font-bold tracking-[-0.02em]"
          style={{ color: theme.text(0.95) }}
        >
          {team.short} 소식
        </h2>
        <span
          className="text-[11px] font-medium uppercase tracking-[0.24em]"
          style={{ color: theme.text(0.4) }}
        >
          Highlights
        </span>
      </div>
      <TeamNewsList
        teamId={team.id}
        limit={PAGE_SIZE}
        filterable
        infinite
        textColor={theme.text}
        accentColor={theme.accent}
        accentTextColor={theme.accentText}
      />
    </section>
  );
}
