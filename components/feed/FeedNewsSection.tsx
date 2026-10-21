"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Play } from "lucide-react";
import TeamNewsList from "@/components/TeamNewsList";
import type { Team } from "@/lib/teams";
import type { ClubVideo } from "@/lib/shorts";
import type { FeedTheme } from "@/components/feed/feedTheme";

const INSERT_EVERY = 5;

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const min = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 60) return `${min || 1}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

/** 뉴스 사이에 끼우는 구단 공식 채널 영상 카드 — 누르면 YouTube 에서 연다 */
function ClubVideoCard({ video, theme }: { video: ClubVideo; theme: FeedTheme }) {
  return (
    <a href={video.url} target="_blank" rel="noopener noreferrer" className="block active:opacity-70">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
        <span className="absolute left-2.5 top-2.5 rounded-full bg-black/55 px-2 py-[2px] text-[11px] font-bold text-white backdrop-blur-sm">
          공식 영상
        </span>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
            <Play size={18} fill="white" className="ml-0.5 text-white" />
          </span>
        </span>
      </div>
      <p
        className="mt-2.5 line-clamp-2 text-[15px] font-semibold leading-snug"
        style={{ color: theme.text(0.94) }}
      >
        {video.title}
      </p>
      <p className="mt-1 flex items-center gap-1 text-[12px]" style={{ color: theme.text(0.55) }}>
        {video.channelLabel} · {timeAgo(video.publishedAt)}
        <ArrowUpRight size={13} aria-label="YouTube에서 열기" />
      </p>
    </a>
  );
}

/**
 * 피드 4번 블록 — 우리 팀 소식 (Highlights). 태그 필터 + 최대 30개,
 * "전체"에선 기사 5개마다 구단 공식 채널 최근 영상을 하나씩 끼운다.
 */
export default function FeedNewsSection({ team, theme }: { team: Team; theme: FeedTheme }) {
  const [videos, setVideos] = useState<ClubVideo[]>([]);

  useEffect(() => {
    let cancelled = false;
    setVideos([]);
    fetch(`/api/club-videos?team=${encodeURIComponent(team.id)}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items?: ClubVideo[] }) => {
        if (!cancelled) setVideos(j.items ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [team.id]);

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
        filterable
        inserts={videos.map((v) => (
          <ClubVideoCard key={v.videoId} video={v} theme={theme} />
        ))}
        insertEvery={INSERT_EVERY}
        textColor={theme.text}
        accentColor={theme.accent}
        accentTextColor={theme.accentText}
      />
    </section>
  );
}
