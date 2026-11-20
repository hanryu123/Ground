"use client";

import { ArrowUpRight, Ticket } from "lucide-react";
import type { FeedTheme } from "@/components/feed/feedTheme";

const PRACTICE_URL =
  "https://postseason-practice.vercel.app/?utm_source=ground&utm_medium=feed_card&utm_campaign=postseason_2026";

/**
 * 피드 히어로 아래 — 포스트시즌 동안만 보이는 예매 연습 사이트 카드 (외부 링크, 연습용 시뮬레이터).
 */
export default function FeedTicketPracticeCard({ theme }: { theme: FeedTheme }) {
  return (
    <section className="px-4 pt-4">
      <a
        href={PRACTICE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-h-[60px] items-center gap-3 rounded-[12px] bg-sys-card px-4 py-2.5 active:bg-sys-fill"
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-club-field text-club-on"
        >
          <Ticket size={16} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block text-[17px] leading-tight"
            style={{ wordBreak: "keep-all" }}
          >
            가을야구 예매 연습하기
          </span>
          <span
            className="mt-0.5 block text-[13px] text-sys-label2"
            style={{ wordBreak: "keep-all" }}
          >
            실전 예매 전에 미리 손 풀어요
          </span>
        </span>
        <ArrowUpRight size={18} className="shrink-0 text-sys-label3" />
      </a>
    </section>
  );
}
