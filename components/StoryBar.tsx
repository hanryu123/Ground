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
    <div className="no-scrollbar flex gap-3.5 overflow-x-auto px-6 pt-6 pb-4">
      {games.map((g, i) => {
        const home = findTeam(g.homeId);
        const away = findTeam(g.awayId);
        const active = i === activeIndex;
        return (
          <button
            key={g.id}
            onClick={() => onSelect(i)}
            className="flex shrink-0 flex-col items-center gap-2 outline-none"
            aria-label={`${away.short} vs ${home.short}`}
          >
            <motion.div
              animate={{
                scale: active ? 1.04 : 1,
              }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              className="relative h-[60px] w-[60px] rounded-full p-[2px]"
              style={{
                background: active
                  ? "linear-gradient(135deg,#ffffff 0%,#9a9a9a 60%,#ffffff 100%)"
                  : "rgba(255,255,255,0.12)",
              }}
            >
              <div className="flex h-full w-full items-center justify-center rounded-full bg-black">
                <span
                  className="text-[12px] tracking-tight text-white"
                  style={{ fontWeight: active ? 800 : 600 }}
                >
                  {away.short}
                  <span className="mx-[3px] text-white/40">·</span>
                  {home.short}
                </span>
              </div>
            </motion.div>
            <motion.span
              animate={{ opacity: active ? 1 : 0.45 }}
              className="text-[10px] tracking-[0.18em] text-white"
              style={{ fontWeight: active ? 700 : 400 }}
            >
              {g.time}
            </motion.span>
          </button>
        );
      })}
    </div>
  );
}
