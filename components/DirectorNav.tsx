"use client";

import { motion } from "framer-motion";
import { TEAMS } from "@/lib/teams";
import { setMyTeam, useMyTeam } from "@/lib/useMyTeam";

/**
 * 디렉터용 퀵 네비 — 10구단 즉시 전환.
 *
 * 동작:
 *  - 클릭 시 setMyTeam(id) → useMyTeam 구독 컴포넌트(예: HeroCard) 즉시 리렌더
 *  - 페이지 리로드 없음
 *  - BottomNav 위에 위치 (fixed, bottom: 96px = BottomNav 높이)
 *  - z-index: HeroCard 콘텐츠보다 위, 메인 BottomNav와 동급
 */
export default function DirectorNav() {
  const team = useMyTeam();

  return (
    <div
      className="fixed inset-x-0 z-40"
      style={{
        bottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
        pointerEvents: "auto",
      }}
      aria-label="Director quick switcher"
    >
      <div
        className="mx-auto flex w-full max-w-md items-center gap-2 px-3 py-2"
        style={{
          backdropFilter: "blur(18px) saturate(150%)",
          WebkitBackdropFilter: "blur(18px) saturate(150%)",
          backgroundColor: "rgba(0,0,0,0.32)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <span
          className="select-none uppercase text-white/30"
          style={{
            fontSize: 8,
            letterSpacing: "0.32em",
            fontWeight: 600,
          }}
          title="Director Mode (dev only)"
        >
          DIR
        </span>

        <div className="no-scrollbar flex flex-1 items-center justify-end gap-0.5 overflow-x-auto">
          {TEAMS.map((t) => {
            const active = t.id === team.id;
            return (
              <motion.button
                key={t.id}
                type="button"
                whileTap={{ scale: 0.92 }}
                onClick={() => setMyTeam(t.id)}
                className="relative flex-shrink-0 px-2 py-1.5 uppercase transition-colors"
                style={{
                  fontSize: 10,
                  fontWeight: active ? 700 : 500,
                  letterSpacing: "0.14em",
                  color: active
                    ? "rgba(255,255,255,1)"
                    : "rgba(255,255,255,0.4)",
                  textShadow: active
                    ? "0 0 8px rgba(255,255,255,0.25)"
                    : undefined,
                }}
                aria-pressed={active}
                aria-label={`Switch to ${t.nameEn}`}
              >
                {t.shortEn}
                {active && (
                  <motion.span
                    layoutId="director-underline"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    className="absolute inset-x-1 -bottom-px h-px"
                    style={{ backgroundColor: t.accent }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
