"use client";

import { useEffect, useRef, useState } from "react";
import StoryBar from "@/components/StoryBar";
import GameCard from "@/components/GameCard";
import { TODAY_GAMES } from "@/lib/games";

export default function TodayPage() {
  const [active, setActive] = useState(0);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  // 스크롤 시 가시성 가장 높은 카드를 활성화
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
      {
        root: scroller,
        threshold: [0.6, 0.8],
      }
    );

    sectionRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // 스토리 탭 → 해당 카드로 스크롤
  const scrollToCard = (i: number) => {
    sectionRefs.current[i]?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setActive(i);
  };

  return (
    <section className="flex h-dvh flex-col pb-24">
      <StoryBar
        games={TODAY_GAMES}
        activeIndex={active}
        onSelect={scrollToCard}
      />

      <div
        ref={scrollerRef}
        className="no-scrollbar flex-1 snap-y snap-mandatory overflow-y-auto"
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
            <GameCard game={g} />
          </div>
        ))}
      </div>
    </section>
  );
}
