"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
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
  date: string; // 4월 19일 (토)
  games: Game[];
  muted?: boolean;
};

const SECTIONS: Section[] = [
  {
    id: "yesterday",
    label: "YESTERDAY",
    date: "4월 18일 · 금",
    games: YESTERDAY_GAMES,
    muted: true,
  },
  {
    id: "today",
    label: "TODAY",
    date: "4월 19일 · 토",
    games: TODAY_GAMES,
  },
  {
    id: "tomorrow",
    label: "TOMORROW",
    date: "4월 20일 · 일",
    games: TOMORROW_GAMES,
    muted: true,
  },
];

const ease = [0.22, 1, 0.36, 1] as const;

export default function SchedulePage() {
  const todayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    todayRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
  }, []);

  return (
    <section className="flex min-h-dvh flex-col">
      {/* 미니멀 상단 라벨 */}
      <header className="px-7 pt-7">
        <p
          className="text-[10px] uppercase tracking-[0.32em] text-white/45"
          style={{ fontWeight: 600 }}
        >
          Schedule
        </p>
      </header>

      <div className="no-scrollbar flex-1 overflow-y-auto pb-10">
        {SECTIONS.map((sec) => (
          <DaySection
            key={sec.id}
            section={sec}
            innerRef={sec.id === "today" ? todayRef : undefined}
          />
        ))}

        <p
          className="px-7 pt-12 text-[10px] uppercase tracking-[0.32em] text-white/30"
          style={{ fontWeight: 600 }}
        >
          End of feed
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
    <div ref={innerRef} className="px-7 pt-12">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.5, ease }}
        className="mb-5"
      >
        <div className="mb-2 flex items-center gap-1.5 text-white/45">
          {section.id === "yesterday" && (
            <ChevronUp size={12} strokeWidth={2.4} />
          )}
          {section.id === "tomorrow" && (
            <ChevronDown size={12} strokeWidth={2.4} />
          )}
          <span
            className="text-[10px] uppercase tracking-[0.3em]"
            style={{ fontWeight: 600 }}
          >
            {section.label}
          </span>
        </div>
        <h2
          className={`text-[40px] leading-[0.95] tracking-tightest ${
            section.muted ? "text-white/35" : "text-white"
          }`}
          style={{ fontWeight: 900 }}
        >
          {section.date}
        </h2>
      </motion.div>

      <ul className="flex flex-col">
        {section.games.map((g, i) => (
          <GameRow key={g.id} game={g} muted={section.muted} delay={i * 0.05} />
        ))}
        {section.games.length === 0 && (
          <li
            className="py-10 text-center text-[11px] uppercase tracking-[0.3em] text-white/30"
            style={{ fontWeight: 600 }}
          >
            No games
          </li>
        )}
      </ul>
    </div>
  );
}

function GameRow({
  game,
  muted,
  delay,
}: {
  game: Game;
  muted?: boolean;
  delay: number;
}) {
  const home = findTeam(game.homeId);
  const away = findTeam(game.awayId);
  const text = muted ? "text-white/40" : "text-white";
  const subtext = muted ? "text-white/25" : "text-white/55";

  return (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.45, ease, delay }}
      className="group flex items-center gap-5 py-5"
    >
      {/* 시간 */}
      <div className="w-14 shrink-0">
        <span
          className={`text-[20px] tracking-tight ${text}`}
          style={{ fontWeight: 800 }}
        >
          {game.time}
        </span>
      </div>

      {/* 팀 컬러 닷 */}
      <div className="flex shrink-0 items-center gap-1">
        <span
          className="block h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: muted ? "rgba(255,255,255,0.25)" : away.accent,
          }}
        />
        <span
          className="block h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: muted ? "rgba(255,255,255,0.15)" : home.accent,
          }}
        />
      </div>

      {/* 매치업 + 메타 */}
      <div className="min-w-0 flex-1">
        <div className={`flex items-baseline gap-2 ${text}`}>
          <span className="text-[18px] tracking-tight" style={{ fontWeight: 800 }}>
            {away.short}
          </span>
          <span
            className="text-[10px] italic tracking-[0.3em] text-white/35"
            style={{ fontWeight: 300 }}
          >
            vs
          </span>
          <span className="text-[18px] tracking-tight" style={{ fontWeight: 800 }}>
            {home.short}
          </span>
        </div>
        <p
          className={`mt-1 truncate text-[12px] tracking-wide ${subtext}`}
          style={{ fontWeight: 300 }}
        >
          {game.stadium}
          <span className="mx-2 text-white/15">·</span>
          {game.awayPitcher} vs {game.homePitcher}
        </p>
      </div>
    </motion.li>
  );
}
