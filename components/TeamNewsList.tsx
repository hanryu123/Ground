"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import type { TeamNewsItem } from "@/lib/news";

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
  /** 표시 개수 (미지정 시 전체) */
  limit?: number;
  /** rgba 텍스트 색 생성기 — 팀 배경 위 가독성 */
  textColor: (alpha: number) => string;
  /** 태그 pill 색 */
  accentColor: string;
  accentTextColor: string;
};

export default function TeamNewsList({
  teamId,
  limit,
  textColor,
  accentColor,
  accentTextColor,
}: Props) {
  const [items, setItems] = useState<TeamNewsItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    const qs = new URLSearchParams({ team: teamId });
    if (limit) qs.set("limit", String(limit));
    fetch(`/api/news?${qs}`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((j: { items?: TeamNewsItem[] }) => {
        if (!cancelled) setItems(j.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, limit]);

  if (items === null) {
    return (
      <ul className="flex flex-col gap-3" aria-busy>
        {Array.from({ length: limit ?? 5 }, (_, i) => (
          <li
            key={i}
            className="h-[76px] animate-pulse rounded-2xl"
            style={{ background: textColor(0.08) }}
          />
        ))}
      </ul>
    );
  }

  if (items.length === 0) {
    return (
      <p className="py-10 text-center text-[15px]" style={{ color: textColor(0.6) }}>
        이번 주엔 아직 조용해요.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item, i) => (
        <motion.li
          key={item.id}
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
      ))}
    </ul>
  );
}
