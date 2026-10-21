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
    <section className="px-5 pt-6">
      <a
        href={PRACTICE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3.5 rounded-2xl p-4 transition active:scale-[0.98]"
        style={{ background: theme.text(0.07) }}
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: theme.accent, color: theme.accentText }}
        >
          <Ticket size={20} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className="block text-[16px] font-bold leading-snug tracking-[-0.01em]"
            style={{ color: theme.text(0.95), wordBreak: "keep-all" }}
          >
            가을야구 예매 연습하기
          </span>
          <span
            className="mt-0.5 block text-[13px] leading-snug"
            style={{ color: theme.text(0.55), wordBreak: "keep-all" }}
          >
            실전 예매 전에 미리 손 풀어요
          </span>
        </span>
        <ArrowUpRight size={18} className="shrink-0" style={{ color: theme.text(0.45) }} />
      </a>
    </section>
  );
}
