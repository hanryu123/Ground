"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import StoryBar from "@/components/StoryBar";
import GameCard from "@/components/GameCard";
import { TODAY_GAMES } from "@/lib/games";

export default function TodayPage() {
  const [active, setActive] = useState(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const idx = Number(
              (entry.target as HTMLElement).dataset.index ?? 0
            );
            setActive(idx);
          }
        });
      },
      { root: scroller, threshold: [0.6, 0.85] }
    );

    sectionRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollToCard = (i: number) => {
    sectionRefs.current[i]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setActive(i);
  };

  return (
    <section className="relative flex h-dvh flex-col pb-24">
      <StoryBar
        games={TODAY_GAMES}
        activeIndex={active}
        onSelect={scrollToCard}
      />

      <div
        ref={scrollerRef}
        className="no-scrollbar relative flex-1 snap-y snap-mandatory overflow-y-auto"
      >
        {TODAY_GAMES.map((g, i) => (
          <div
            key={g.id}
            ref={(el) => {
              sectionRefs.current[i] = el;
            }}
            data-index={i}
            className="flex h-full snap-start items-center justify-center"
          >
            <GameCard game={g} index={i} total={TODAY_GAMES.length} />
          </div>
        ))}
      </div>

      {/* 우측 세로 페이지 인디케이터 */}
      <div className="pointer-events-none absolute right-3 top-1/2 z-30 -translate-y-1/2">
        <ul className="flex flex-col items-center gap-2">
          {TODAY_GAMES.map((g, i) => (
            <li key={g.id}>
              <motion.span
                animate={{
                  height: i === active ? 22 : 6,
                  opacity: i === active ? 1 : 0.35,
                }}
                transition={{ type: "spring", stiffness: 320, damping: 28 }}
                className="block w-[3px] rounded-full bg-white"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
