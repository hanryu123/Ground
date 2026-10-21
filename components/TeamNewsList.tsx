"use client";

import { useEffect, useRef, useState } from "react";
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
  /** 처음 보여 줄 개수 */
  collapsedCount?: number;
  /** "펼치기" 한 번에 더 보여 줄 개수 */
  expandStep?: number;
  /** 최대 개수 — 다 펼치면 "접기" */
  maxCount?: number;
  /** 태그 필터 칩 (전체 + 그 팀 소식에 있는 태그만) */
  filterable?: boolean;
  /** rgba 텍스트 색 생성기 — 팀 배경 위 가독성 */
  textColor: (alpha: number) => string;
  /** 태그 pill 색 */
  accentColor: string;
  accentTextColor: string;
};

async function fetchNews(teamId: string, tag: NewsTag | null, limit: number): Promise<TeamNewsPage> {
  const qs = new URLSearchParams({ team: teamId, limit: String(limit) });
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
  collapsedCount = 5,
  expandStep = 10,
  maxCount = 30,
  filterable = false,
  textColor,
  accentColor,
  accentTextColor,
}: Props) {
  const [tag, setTag] = useState<NewsTag | null>(null);
  const [tags, setTags] = useState<NewsTag[]>([]);
  const [items, setItems] = useState<TeamNewsItem[] | null>(null);
  const [visibleCount, setVisibleCount] = useState(collapsedCount);
  // 팀·태그가 바뀌면 늦게 도착한 이전 응답을 버린다
  const requestKey = useRef("");
  const topRef = useRef<HTMLDivElement | null>(null);

  // 팀이 바뀌면 필터 초기화
  useEffect(() => {
    setTag(null);
    setTags([]);
  }, [teamId]);

  // 최대 개수까지 한 번에 받아 두고, 펼치기·접기는 화면에서만 한다
  useEffect(() => {
    const key = `${teamId}:${tag ?? ""}`;
    requestKey.current = key;
    setItems(null);
    setVisibleCount(collapsedCount);
    fetchNews(teamId, tag, maxCount)
      .then((page) => {
        if (requestKey.current !== key) return;
        setItems(page.items);
        setTags(page.tags);
      })
      .catch(() => {
        if (requestKey.current === key) setItems([]);
      });
  }, [teamId, tag, maxCount, collapsedCount]);

  const canExpand = items !== null && visibleCount < items.length;
  const canCollapse = items !== null && !canExpand && items.length > collapsedCount;

  function collapse() {
    setVisibleCount(collapsedCount);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const chips =
    filterable && tags.length > 0 ? (
      <div
        ref={topRef}
        className="-mx-5 mb-3 scroll-mt-4 flex gap-2 overflow-x-auto px-5 pb-1"
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
          {Array.from({ length: collapsedCount }, (_, i) => (
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
        {items.slice(0, visibleCount).map((item, i) => (
          <motion.li
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease, delay: Math.min(i < collapsedCount ? i : (i - collapsedCount) % expandStep, 8) * 0.04 }}
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
      {canExpand || canCollapse ? (
        <button
          type="button"
          onClick={() =>
            canExpand
              ? setVisibleCount((n) => Math.min(n + expandStep, items.length))
              : collapse()
          }
          className="mt-3 w-full rounded-2xl py-3 text-[14px] font-semibold transition active:scale-[0.98]"
          style={{ background: textColor(0.07), color: textColor(0.75) }}
        >
          {canExpand ? "펼치기" : "접기"}
        </button>
      ) : null}
    </>
  );
}
