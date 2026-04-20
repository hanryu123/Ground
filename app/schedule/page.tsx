"use client";

import { useEffect, useRef } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import {
  TODAY_GAMES,
  YESTERDAY_GAMES,
  TOMORROW_GAMES,
  type Game,
} from "@/lib/games";
import { findTeam } from "@/lib/teams";

type Section = {
  id: string;
  label: string;
  big: string;
  games: Game[];
  muted?: boolean;
};

const SECTIONS: Section[] = [
  {
    id: "yesterday",
    label: "어제",
    big: "어제, 4월 18일",
    games: YESTERDAY_GAMES,
    muted: true,
  },
  {
    id: "today",
    label: "오늘",
    big: "오늘, 4월 19일",
    games: TODAY_GAMES,
  },
  {
    id: "tomorrow",
    label: "내일",
    big: "내일, 4월 20일",
    games: TOMORROW_GAMES,
    muted: true,
  },
];

export default function SchedulePage() {
  const todayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    todayRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }, []);

  return (
    <section className="flex min-h-dvh flex-col">
      <header className="px-5 pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-ink-300">
          SCHEDULE
        </p>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto">
        {SECTIONS.map((sec) => (
          <DaySection
            key={sec.id}
            section={sec}
            innerRef={sec.id === "today" ? todayRef : undefined}
          />
        ))}

        <p className="py-10 text-center text-[11px] text-ink-500">
          더 이상 일정이 없습니다
        </p>
      </div>
    </section>
  );
}

function DaySection({
  section,
  innerRef,
}: {
  section: Section;
  innerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={innerRef} className="px-5 pt-8">
      <div className="mb-1 flex items-center gap-1.5 text-ink-400">
        {section.id === "yesterday" && (
          <ChevronUp size={14} strokeWidth={2.4} />
        )}
        {section.id === "tomorrow" && (
          <ChevronDown size={14} strokeWidth={2.4} />
        )}
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em]">
          {section.label}
        </span>
      </div>

      <h2
        className={`text-[28px] font-black leading-tight tracking-tightest ${
          section.muted ? "text-ink-300" : "text-white"
        }`}
      >
        {section.big}
      </h2>

      <ul className="mt-5 flex flex-col gap-5 pb-2">
        {section.games.map((g) => (
          <GameRow key={g.id} game={g} muted={section.muted} />
        ))}
        {section.games.length === 0 && (
          <li className="py-8 text-center text-[13px] text-ink-400">
            경기 없음
          </li>
        )}
      </ul>
    </div>
  );
}

function GameRow({ game, muted }: { game: Game; muted?: boolean }) {
  const home = findTeam(game.homeId);
  const away = findTeam(game.awayId);

  return (
    <li className="flex items-start gap-5">
      <div className="w-14 shrink-0 pt-0.5">
        <span
          className={`text-[18px] font-bold tracking-tight ${
            muted ? "text-ink-300" : "text-white"
          }`}
        >
          {game.time}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={`flex items-baseline gap-2 text-[18px] font-bold tracking-tight ${
            muted ? "text-ink-300" : "text-white"
          }`}
        >
          <span>{away.short}</span>
          <span className="text-[11px] font-medium text-ink-400">vs</span>
          <span>{home.short}</span>
        </div>
        <p className="mt-1 text-[12px] text-ink-400">
          {game.stadium}
          <span className="mx-1.5 text-ink-500">·</span>
          {game.awayPitcher} vs {game.homePitcher}
        </p>
      </div>
    </li>
  );
}
