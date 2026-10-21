"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
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
  /** 최대 개수 */
  maxCount?: number;
  /** "전체" 목록에서 insertEvery 개마다 하나씩 끼울 요소 (구단 영상 등) — 태그 필터 중엔 안 끼운다 */
  inserts?: ReactNode[];
  insertEvery?: number;
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
  maxCount = 30,
  inserts = [],
  insertEvery = 5,
  filterable = false,
  textColor,
  accentColor,
  accentTextColor,
}: Props) {
  const [tag, setTag] = useState<NewsTag | null>(null);
  const [tags, setTags] = useState<NewsTag[]>([]);
  const [items, setItems] = useState<TeamNewsItem[] | null>(null);
  // 팀·태그가 바뀌면 늦게 도착한 이전 응답을 버린다
  const requestKey = useRef("");

  // 팀이 바뀌면 필터 초기화
  useEffect(() => {
    setTag(null);
    setTags([]);
  }, [teamId]);

  useEffect(() => {
    const key = `${teamId}:${tag ?? ""}`;
    requestKey.current = key;
    setItems(null);
    fetchNews(teamId, tag, maxCount)
      .then((page) => {
        if (requestKey.current !== key) return;
        setItems(page.items);
        setTags(page.tags);
      })
      .catch(() => {
        if (requestKey.current === key) setItems([]);
      });
  }, [teamId, tag, maxCount]);

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
          {Array.from({ length: 5 }, (_, i) => (
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
        {items.map((item, i) => {
          const insert =
            tag === null && (i + 1) % insertEvery === 0 ? inserts[(i + 1) / insertEvery - 1] : null;
          return (
            <Fragment key={item.id}>
              <motion.li
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease, delay: Math.min(i, 8) * 0.04 }}
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
              {insert ? <li className="py-5">{insert}</li> : null}
            </Fragment>
          );
        })}
      </ul>
    </>
  );
}
