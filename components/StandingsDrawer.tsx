"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { findTeam } from "@/lib/teams";
import {
  STANDINGS,
  formatWinRate,
  formatGamesBehind,
} from "@/config/standings";
import LogoImage from "./LogoImage";

const ease = [0.22, 1, 0.36, 1] as const;

type Props = {
  /** 현재 응원 팀 id (행 하이라이트) */
  myTeamId: string;
  /** 드로어 열림 상태 (controlled) */
  isOpen: boolean;
  /** 열림 상태 변경 핸들러 */
  onOpenChange: (open: boolean) => void;
  /**
   * BottomNav 위에서 드로어가 시작될 픽셀 오프셋.
   * 디렉터 네비가 켜져 있으면 ~138, 아니면 96.
   */
  bottomOffset?: number;
};

/**
 * StandingsDrawer — 슬라이드 업 순위 드로어.
 *
 *  ── 디자인 ──
 *   - 닫힘 상태: BottomNav 바로 위에 얇은 핸들(가로줄)만 노출. 탭하면 열린다.
 *   - 열림 상태: 풀 패널이 스프링으로 슬라이드 업. 검은 backdrop + 글래스모피즘 패널.
 *
 *  ── 인터랙션 ──
 *   - 핸들 탭          → 열기
 *   - 백드롭 탭        → 닫기
 *   - 패널 위에서 아래로 드래그(또는 빠른 swipe down) → 닫기
 *   - ESC 키          → 닫기
 *
 *  ── 접근성 ──
 *   - role="dialog" + aria-modal + aria-label
 *   - 열렸을 때 body 스크롤 잠금
 */
export default function StandingsDrawer({
  myTeamId,
  isOpen,
  onOpenChange,
  bottomOffset = 96,
}: Props) {
  // ESC 키로 닫기 + body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, onOpenChange]);

  return (
    <>
      {/*
        핸들 — 닫힘 상태에서만 노출. BottomNav 바로 위, 화면 가운데.
        가로줄 자체는 얇지만 탭 영역은 충분히 넉넉하게 (44px 권장 터치 타깃).
      */}
      <motion.button
        type="button"
        onClick={() => onOpenChange(true)}
        whileTap={{ scale: 0.94 }}
        animate={{
          opacity: isOpen ? 0 : 1,
          y: isOpen ? 6 : 0,
        }}
        transition={{ duration: 0.25, ease }}
        style={{
          bottom: bottomOffset + 4,
          pointerEvents: isOpen ? "none" : "auto",
        }}
        className="fixed left-1/2 z-40 -translate-x-1/2 px-7 py-2.5"
        aria-label="순위표 열기"
      >
        <span
          aria-hidden
          className="block h-[3px] w-10 rounded-full"
          style={{
            background: "rgba(255,255,255,0.32)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
          }}
        />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* 백드롭 — 탭하면 닫힘. BottomNav(z-50)도 가려서 정합 모달 동작. */}
            <motion.div
              key="standings-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32, ease }}
              onClick={() => onOpenChange(false)}
              className="fixed inset-0 z-[55] bg-black/45"
              aria-hidden
            />

            {/* 드로어 패널 — 스프링 슬라이드 업, 아래로 드래그하면 닫힘 */}
            <motion.div
              key="standings-panel"
              role="dialog"
              aria-modal
              aria-label="KBO 순위표"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 36,
                mass: 0.9,
              }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              dragMomentum={false}
              onDragEnd={(_, info) => {
                // 80px 이상 끌어내렸거나 빠르게 아래로 swipe → 닫기
                if (info.offset.y > 80 || info.velocity.y > 500) {
                  onOpenChange(false);
                }
              }}
              className="fixed inset-x-0 z-[60] mx-auto flex max-w-md flex-col overflow-hidden rounded-t-[28px]"
              style={{
                bottom: bottomOffset,
                maxHeight: `calc(100dvh - ${bottomOffset + 60}px)`,
                backgroundColor: "rgba(0,0,0,0.30)",
                backdropFilter: "blur(20px) saturate(180%)",
                WebkitBackdropFilter: "blur(20px) saturate(180%)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderBottom: "none",
                boxShadow: "0 -24px 60px rgba(0,0,0,0.55)",
              }}
            >
              {/* 핸들(드래그 그립) */}
              <div className="flex shrink-0 cursor-grab justify-center pt-3 pb-1.5 active:cursor-grabbing">
                <span
                  className="block h-[3px] w-10 rounded-full"
                  style={{ background: "rgba(255,255,255,0.32)" }}
                />
              </div>

              {/* 헤더 */}
              <div className="flex shrink-0 items-baseline justify-between px-6 pt-1 pb-3">
                <p
                  className="text-[10px] uppercase tracking-[0.36em] text-white/45"
                  style={{ fontWeight: 600 }}
                >
                  Standings
                </p>
                <p
                  className="text-[9.5px] uppercase tracking-[0.32em] text-white/30"
                  style={{ fontWeight: 500 }}
                >
                  W · L · PCT · GB
                </p>
              </div>

              {/* 컬럼 가이드 (얇은 디바이더) */}
              <div className="mx-6 mb-1 h-px shrink-0 bg-white/[0.06]" />

              {/* 순위 리스트 — 내부 스크롤 */}
              <ul className="no-scrollbar flex-1 overflow-y-auto px-3 pb-7 pt-1">
                {STANDINGS.map((row) => {
                  const t = findTeam(row.teamId);
                  const isMe = row.teamId === myTeamId;
                  return (
                    <li key={row.teamId}>
                      <div
                        className="relative flex items-center gap-3 rounded-2xl px-3 py-3"
                        style={{
                          backgroundColor: isMe
                            ? `${t.accent}1f` // ~12% alpha
                            : "transparent",
                        }}
                      >
                        {/* 활성 글로우 보더 */}
                        {isMe && (
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-0 rounded-2xl"
                            style={{
                              border: `1px solid ${t.accent}66`,
                              boxShadow: `inset 0 0 24px ${t.accent}1a, 0 0 18px ${t.accent}33`,
                            }}
                          />
                        )}

                        {/* 순위 */}
                        <span
                          className="relative w-5 shrink-0 text-center tabular-nums"
                          style={{
                            fontFamily:
                              '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
                            fontWeight: isMe ? 800 : 600,
                            fontSize: 14,
                            color: isMe ? t.accent : "rgba(255,255,255,0.55)",
                            letterSpacing: "-0.02em",
                          }}
                        >
                          {row.rank}
                        </span>

                        {/* 로고 */}
                        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
                          <LogoImage
                            teamId={row.teamId}
                            alt={t.nameEn}
                            size={32}
                            priority
                            className="h-8 w-8"
                            style={{
                              filter: isMe
                                ? `drop-shadow(0 0 8px ${t.accent}88)`
                                : "drop-shadow(0 1px 3px rgba(0,0,0,0.45))",
                              transition: "filter 0.2s",
                            }}
                          />
                        </span>

                        {/* 팀 약칭 */}
                        <span
                          className="relative min-w-0 flex-1 truncate"
                          style={{
                            fontFamily:
                              '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
                            fontWeight: isMe ? 800 : 600,
                            fontSize: 15,
                            letterSpacing: "-0.005em",
                            color: isMe
                              ? "rgba(255,255,255,1)"
                              : "rgba(255,255,255,0.85)",
                          }}
                        >
                          {t.short}
                        </span>

                        {/* W-L (-D) */}
                        <span
                          className="relative tabular-nums"
                          style={{
                            fontFamily:
                              '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
                            fontSize: 12.5,
                            fontWeight: isMe ? 700 : 500,
                            color: isMe
                              ? "rgba(255,255,255,0.92)"
                              : "rgba(255,255,255,0.6)",
                            letterSpacing: "-0.005em",
                          }}
                        >
                          {row.wins}
                          <span
                            className="mx-0.5"
                            style={{ color: "rgba(255,255,255,0.25)" }}
                          >
                            ·
                          </span>
                          {row.losses}
                          {row.draws > 0 && (
                            <>
                              <span
                                className="mx-0.5"
                                style={{ color: "rgba(255,255,255,0.25)" }}
                              >
                                ·
                              </span>
                              {row.draws}
                            </>
                          )}
                        </span>

                        {/* 승률 */}
                        <span
                          className="relative w-11 text-right tabular-nums"
                          style={{
                            fontFamily:
                              '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
                            fontSize: 12,
                            fontWeight: isMe ? 700 : 500,
                            color: isMe
                              ? "rgba(255,255,255,0.85)"
                              : "rgba(255,255,255,0.45)",
                            letterSpacing: "0.005em",
                          }}
                        >
                          {formatWinRate(row.winRate)}
                        </span>

                        {/* 게임차 */}
                        <span
                          className="relative w-8 text-right tabular-nums"
                          style={{
                            fontFamily:
                              '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
                            fontSize: 11.5,
                            fontWeight: 500,
                            color: isMe
                              ? "rgba(255,255,255,0.65)"
                              : "rgba(255,255,255,0.32)",
                          }}
                        >
                          {formatGamesBehind(row.gamesBehind)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* 하단 캡션 */}
              <div className="shrink-0 border-t border-white/[0.05] px-6 py-3 text-center">
                <span
                  className="text-[9.5px] uppercase tracking-[0.32em] text-white/30"
                  style={{ fontWeight: 500 }}
                >
                  Updated · 2026 Regular Season
                </span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
