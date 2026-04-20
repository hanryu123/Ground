"use client";

import { motion } from "framer-motion";
import type { Game } from "@/lib/games";
import { findTeam } from "@/lib/teams";

type Props = {
  games: Game[];
  activeIndex: number;
  onSelect: (i: number) => void;
};

export default function StoryBar({ games, activeIndex, onSelect }: Props) {
  return (
    <div className="no-scrollbar flex gap-3 overflow-x-auto px-5 pt-5 pb-3">
      {games.map((g, i) => {
        const home = findTeam(g.homeId);
        const away = findTeam(g.awayId);
        const active = i === activeIndex;
        return (
          <button
            key={g.id}
            onClick={() => onSelect(i)}
            className="flex shrink-0 flex-col items-center gap-1.5"
            aria-label={`${away.short} vs ${home.short}`}
          >
            <motion.div
              animate={{ scale: active ? 1.05 : 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className={`relative h-[58px] w-[58px] rounded-full p-[2px] ${
                active
                  ? "bg-gradient-to-br from-white to-ink-300"
                  : "bg-ink-600"
              }`}
            >
              <div className="flex h-full w-full items-center justify-center rounded-full bg-ink-800 text-[11px] font-bold tracking-tight text-white">
                <span>{away.short}</span>
                <span className="mx-[3px] text-ink-400">·</span>
                <span>{home.short}</span>
              </div>
            </motion.div>
            <span
              className={`text-[10px] font-medium ${
                active ? "text-white" : "text-ink-400"
              }`}
            >
              {g.time}
            </span>
          </button>
        );
      })}
    </div>
  );
}
