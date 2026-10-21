"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { NewsTag, TeamNewsItem, TeamNewsPage } from "@/lib/news";

const ease = [0.22, 1, 0.36, 1] as const;

function timeAgo(dateTime: string): string {
  // 네이버 dateTime 은 KST 로컬 시각 (오프셋 없음)
  const ms = Date.now() - Date.parse(`${dateTime}+09:00`);
  const min = Math.max(0, Math.floor(ms / 60_000));
  if (min < 60) return `${min || 1}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

type Props = {
  teamId: string;
  /** 한 번에 받을 개수 (미지정 시 전체) */
  limit?: number;
  /** 태그 필터 칩 (전체 + 그 팀 소식에 있는 태그만) */
  filterable?: boolean;
  /** 끝까지 내리면 limit 만큼 더 받는다 (limit 필요) */
  infinite?: boolean;
  /** rgba 텍스트 색 생성기 — 팀 배경 위 가독성 */
  textColor: (alpha: number) => string;
  /** 태그 pill 색 */
  accentColor: string;
  accentTextColor: string;
};

type State = {
  items: TeamNewsItem[] | null;
  nextOffset: number | null;
};

async function fetchPage(
  teamId: string,
  tag: NewsTag | null,
  offset: number,
  limit: number | undefined
): Promise<TeamNewsPage> {
  const qs = new URLSearchParams({ team: teamId });
  if (limit) qs.set("limit", String(limit));
  if (offset) qs.set("offset", String(offset));
  if (tag) qs.set("tag", tag);
  const r = await fetch(`/api/news?${qs}`);
  if (!r.ok) throw new Error(`news ${r.status}`);
  const j = (await r.json()) as Partial<TeamNewsPage>;
  return {
    items: j.items ?? [],
    tags: j.tags ?? [],
    total: j.total ?? 0,
    nextOffset: j.nextOffset ?? null,
  };
}

export default function TeamNewsList({
  teamId,
  limit,
  filterable = false,
  infinite = false,
  textColor,
  accentColor,
  accentTextColor,
}: Props) {
  const [tag, setTag] = useState<NewsTag | null>(null);
  const [tags, setTags] = useState<NewsTag[]>([]);
  const [state, setState] = useState<State>({ items: null, nextOffset: null });
  const [loadingMore, setLoadingMore] = useState(false);
  // 팀·태그가 바뀌면 늦게 도착한 이전 응답을 버린다
  const requestKey = useRef("");
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // 팀이 바뀌면 필터 초기화
  useEffect(() => {
    setTag(null);
    setTags([]);
  }, [teamId]);

  useEffect(() => {
    const key = `${teamId}:${tag ?? ""}`;
    requestKey.current = key;
    setState({ items: null, nextOffset: null });
    setLoadingMore(false);
    fetchPage(teamId, tag, 0, limit)
      .then((page) => {
        if (requestKey.current !== key) return;
        setState({ items: page.items, nextOffset: page.nextOffset });
        setTags(page.tags);
      })
      .catch(() => {
        if (requestKey.current === key) setState({ items: [], nextOffset: null });
      });
  }, [teamId, tag, limit]);

  const loadMore = useCallback(() => {
    if (!infinite || loadingMore || state.items === null || state.nextOffset === null) return;
    const key = requestKey.current;
    setLoadingMore(true);
    fetchPage(teamId, tag, state.nextOffset, limit)
      .then((page) => {
        if (requestKey.current !== key) return;
        setState((prev) => {
          const seen = new Set((prev.items ?? []).map((i) => i.id));
          return {
            items: [...(prev.items ?? []), ...page.items.filter((i) => !seen.has(i.id))],
            nextOffset: page.nextOffset,
          };
        });
      })
      .catch(() => {
        // 다음 페이지 실패 시 더 받지 않는다 (목록은 유지)
        if (requestKey.current === key) setState((prev) => ({ ...prev, nextOffset: null }));
      })
      .finally(() => {
        if (requestKey.current === key) setLoadingMore(false);
      });
  }, [infinite, loadingMore, state.items, state.nextOffset, teamId, tag, limit]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !infinite) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "400px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [infinite, loadMore]);

  const { items, nextOffset } = state;

  const chips =
    filterable && tags.length > 0 ? (
      <div
        className="-mx-5 mb-3 flex gap-2 overflow-x-auto px-5 pb-1"
        style={{ scrollbarWidth: "none" }}
        role="tablist"
        aria-label="소식 분류"
      >
        {([null, ...tags] as Array<NewsTag | null>).map((t) => {
          const active = t === tag;
          return (
            <button
              key={t ?? "all"}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTag(t)}
              className="shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition active:scale-95"
              style={
                active
                  ? { background: accentColor, color: accentTextColor }
                  : { background: textColor(0.08), color: textColor(0.7) }
              }
            >
              {t ?? "전체"}
            </button>
          );
        })}
      </div>
    ) : null;

  if (items === null) {
    return (
      <>
        {chips}
        <ul className="flex flex-col gap-3" aria-busy>
          {Array.from({ length: Math.min(limit ?? 5, 6) }, (_, i) => (
            <li
              key={i}
              className="h-[76px] animate-pulse rounded-2xl"
              style={{ background: textColor(0.08) }}
            />
          ))}
        </ul>
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        {chips}
        <p className="py-10 text-center text-[15px]" style={{ color: textColor(0.6) }}>
          {tag ? `이번 주 ${tag} 소식은 아직 없어요.` : "이번 주엔 아직 조용해요."}
        </p>
      </>
    );
  }

  return (
    <>
      {chips}
      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <motion.li
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease, delay: Math.min(i % (limit ?? 9), 8) * 0.04 }}
          >
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-2xl py-2.5 active:opacity-70"
            >
              <div className="min-w-0 flex-1">
                {item.tag ? (
                  <span
                    className="mb-1 inline-block rounded-full px-2 py-[1px] text-[11px] font-bold"
                    style={{ background: accentColor, color: accentTextColor }}
                  >
                    {item.tag}
                  </span>
                ) : null}
                <p
                  className="line-clamp-2 text-[15px] font-semibold leading-snug"
                  style={{ color: textColor(0.94) }}
                >
                  {item.title}
                </p>
                <p className="mt-1 text-[12px]" style={{ color: textColor(0.55) }}>
                  {item.source} · {timeAgo(item.dateTime)}
                  {item.relatedCount > 0 ? ` · 관련 기사 ${item.relatedCount}` : ""}
                </p>
              </div>
              {item.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbnail}
                  alt=""
                  loading="lazy"
                  className="h-16 w-16 shrink-0 rounded-xl object-cover"
                />
              ) : null}
            </a>
          </motion.li>
        ))}
      </ul>
      {infinite && nextOffset !== null ? (
        <div ref={sentinelRef} className="flex justify-center py-6" aria-hidden>
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full"
            style={{ background: textColor(loadingMore ? 0.6 : 0.25) }}
          />
        </div>
      ) : null}
    </>
  );
}
