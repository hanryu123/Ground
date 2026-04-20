"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Share } from "lucide-react";
import type { Game } from "@/lib/games";
import { findTeam, type Team } from "@/lib/teams";

type Props = {
  game: Game;
};

export default function GameCard({ game }: Props) {
  const home = findTeam(game.homeId);
  const away = findTeam(game.awayId);
  const src = game.image ?? "/images/matchup.png";

  return (
    <motion.article
      initial={{ opacity: 0.6 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full overflow-hidden bg-black"
      style={{ aspectRatio: "4 / 5" }}
    >
      <Image
        src={src}
        alt={`${away.short} vs ${home.short}`}
        fill
        priority
        sizes="(max-width: 448px) 100vw, 448px"
        className={game.imageOnly ? "object-cover" : "object-cover filter-cinema"}
      />

      {/* 텍스트 오버레이는 이미지에 burn-in 텍스트가 없을 때만 */}
      {!game.imageOnly && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-32 bg-gradient-to-b from-black/55 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-44 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

          <div className="absolute inset-0 z-[2] flex items-center justify-between px-7">
            <TeamMark team={away} pitcher={game.awayPitcher} align="left" />
            <TeamMark team={home} pitcher={game.homePitcher} align="right" />
          </div>

          <div className="absolute inset-x-0 bottom-0 z-[3] px-7 pb-8">
            <div className="flex items-end justify-between">
              <div className="flex flex-col">
                <span className="text-shadow-soft text-[11px] font-medium uppercase tracking-[0.32em] text-white/55">
                  First Pitch
                </span>
                <span className="text-shadow-soft mt-1 text-[28px] font-bold leading-none tracking-tightest text-white">
                  {game.time}
                </span>
              </div>
              <span className="text-shadow-soft pb-1 text-right text-[12px] font-light tracking-wide text-white/85">
                {game.stadium}
              </span>
            </div>
          </div>
        </>
      )}

      {/* 공유 버튼은 imageOnly 카드엔 이미 박혀 있으므로 표시 안 함 */}
      {!game.imageOnly && (
        <button
          aria-label="share"
          className="absolute right-5 top-5 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/35 backdrop-blur-md transition active:scale-95 active:bg-black/55"
        >
          <Share size={18} strokeWidth={2} className="text-white" />
        </button>
      )}
    </motion.article>
  );
}

function TeamMark({
  team,
  pitcher,
  align,
}: {
  team: Team;
  pitcher: string;
  align: "left" | "right";
}) {
  const alignClass = align === "left" ? "items-start" : "items-end";
  return (
    <div className={`flex flex-col ${alignClass}`}>
      <span
        className="text-shadow-glow text-[96px] font-black leading-[0.85] tracking-tightest text-white"
        style={{
          fontFamily:
            '"Pretendard Variable", "Helvetica Neue", sans-serif',
          fontWeight: 900,
        }}
      >
        {team.short}
      </span>
      <span
        className="text-shadow-soft mt-3 text-[12px] tracking-[0.18em] text-white/85"
        style={{ fontWeight: 200 }}
      >
        {pitcher}
      </span>
    </div>
  );
}
