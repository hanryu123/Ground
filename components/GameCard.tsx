"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Share, MapPin } from "lucide-react";
import type { Game } from "@/lib/games";
import { findTeam, type Team } from "@/lib/teams";

type Props = {
  game: Game;
  index?: number;
  total?: number;
};

const ease = [0.22, 1, 0.36, 1] as const;

export default function GameCard({ game, index = 0, total = 0 }: Props) {
  const home = findTeam(game.homeId);
  const away = findTeam(game.awayId);
  const src = game.image ?? "/images/matchup.png";
  const matchNo = String(index + 1).padStart(2, "0");
  const matchTotal = String(total).padStart(2, "0");

  return (
    <motion.article
      initial={{ opacity: 0, scale: 0.985 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: false, amount: 0.6 }}
      transition={{ duration: 0.55, ease }}
      className="relative w-full overflow-hidden bg-black"
      style={{ aspectRatio: "4 / 5" }}
    >
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 1.06 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: false, amount: 0.6 }}
        transition={{ duration: 1.1, ease }}
      >
        <Image
          src={src}
          alt={`${away.short} vs ${home.short}`}
          fill
          priority
          sizes="(max-width: 448px) 100vw, 448px"
          className={
            game.imageOnly ? "object-cover" : "object-cover filter-cinema"
          }
        />
      </motion.div>

      {!game.imageOnly && (
        <>
          {/* 상단 비네팅 */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-40 bg-gradient-to-b from-black/70 via-black/20 to-transparent" />
          {/* 하단 비네팅 — 더 길고 깊게 */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-2/3 bg-gradient-to-t from-black/95 via-black/45 to-transparent" />

          {/* 상단 라벨 + 공유 */}
          <div className="absolute inset-x-0 top-0 z-20 flex items-start justify-between px-7 pt-6">
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: false, amount: 0.6 }}
              transition={{ duration: 0.5, ease, delay: 0.1 }}
              className="flex flex-col"
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/55">
                KBO · 2026
              </span>
              <span className="mt-1 text-[11px] font-light tracking-[0.18em] text-white/80">
                MATCH {matchNo}
                {total > 0 && (
                  <span className="text-white/35"> / {matchTotal}</span>
                )}
              </span>
            </motion.div>

            <button
              aria-label="share"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 backdrop-blur-md ring-1 ring-white/10 transition active:scale-95 active:bg-black/55"
            >
              <Share size={17} strokeWidth={1.8} className="text-white" />
            </button>
          </div>

          {/* 좌·우 팀 마크 */}
          <div className="absolute inset-0 z-[2] flex items-center justify-between px-7">
            <TeamMark
              team={away}
              pitcher={game.awayPitcher}
              align="left"
              delay={0.18}
            />
            <TeamMark
              team={home}
              pitcher={game.homePitcher}
              align="right"
              delay={0.26}
            />
          </div>

          {/* 중앙 미세 VS (이탤릭) */}
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.28 }}
            viewport={{ once: false, amount: 0.6 }}
            transition={{ duration: 0.7, ease, delay: 0.4 }}
            className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 select-none text-[13px] italic tracking-[0.4em] text-white"
            style={{ fontWeight: 300 }}
          >
            vs
          </motion.span>

          {/* 하단 메타 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: false, amount: 0.6 }}
            transition={{ duration: 0.55, ease, delay: 0.32 }}
            className="absolute inset-x-0 bottom-0 z-[3] px-7 pb-9"
          >
            <div className="divider-fade mb-5 h-px w-full" />

            <div className="flex items-end justify-between gap-6">
              <div className="flex min-w-0 flex-col">
                <span className="text-shadow-soft text-[10px] font-semibold uppercase tracking-[0.32em] text-white/55">
                  First Pitch
                </span>
                <span
                  className="text-shadow-soft mt-1.5 text-[34px] leading-none tracking-tightest text-white"
                  style={{ fontWeight: 800 }}
                >
                  {game.time}
                </span>
              </div>

              <div className="flex min-w-0 flex-col items-end">
                <span className="text-shadow-soft text-[10px] font-semibold uppercase tracking-[0.32em] text-white/55">
                  Venue
                </span>
                <span className="text-shadow-soft mt-1.5 flex items-center gap-1.5 text-right text-[13px] font-light tracking-wide text-white">
                  <MapPin size={12} strokeWidth={1.8} className="text-white/60" />
                  {game.stadium}
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </motion.article>
  );
}

function TeamMark({
  team,
  pitcher,
  align,
  delay = 0,
}: {
  team: Team;
  pitcher: string;
  align: "left" | "right";
  delay?: number;
}) {
  const alignClass = align === "left" ? "items-start" : "items-end";
  const textAlign = align === "left" ? "text-left" : "text-right";

  return (
    <motion.div
      initial={{ opacity: 0, x: align === "left" ? -16 : 16 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: false, amount: 0.6 }}
      transition={{ duration: 0.6, ease, delay }}
      className={`flex flex-col ${alignClass}`}
    >
      <span
        className={`text-shadow-glow text-[104px] leading-[0.84] tracking-tightest text-white ${textAlign}`}
        style={{
          fontFamily:
            '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
          fontWeight: 900,
          fontStretch: "100%",
        }}
      >
        {team.short}
      </span>

      <div className={`mt-4 flex flex-col gap-1 ${textAlign}`}>
        <span
          className="text-[9px] uppercase tracking-[0.34em] text-white/45"
          style={{ fontWeight: 500 }}
        >
          선발
        </span>
        <span
          className="text-shadow-soft text-[14px] tracking-[0.04em] text-white/95"
          style={{ fontWeight: 200 }}
        >
          {pitcher}
        </span>
      </div>
    </motion.div>
  );
}
