"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { findTeam } from "@/lib/teams";
import {
  STANDINGS,
  formatWinRate,
  formatGamesBehind,
  type StandingRow,
} from "@/config/standings";
import LogoImage from "./LogoImage";

const ease = [0.22, 1, 0.36, 1] as const;

type Props = {
  /** 응원팀 id — 행 하이라이트 (acccent tint + bold) */
  myTeamId: string;
  /** 외부에서 데이터 주입할 때 사용 (없으면 STANDINGS mock 사용) */
  rows?: StandingRow[];
  /** 데이터 로딩 중 표시 강제 — true 면 스켈레톤 */
  loading?: boolean;
};

/**
 * StandingsSection — 메인 페이지 HeroCard 아래에 깔리는 KBO 순위표.
 *
 *  ── 디자인 ──
 *   - 애플 표 스타일: 선 최소화, 12~13px 본문, 헤더는 9~10px tracking-wide
 *   - 응원팀 행만 살짝 accent 틴트 + bold + 좌측 컬러 바
 *   - 화이트 8% 인터리브? → 노이즈 → 사용 안 함. 행간만 충분히.
 *
 *  ── 데이터 ──
 *   - 기본 소스: config/standings.ts (mock, 정적). 추후 API fetch 시 props.rows 주입.
 *   - 비어있으면 자동으로 스켈레톤 노출 (10행).
 */
export default function StandingsSection({ myTeamId, rows, loading }: Props) {
  const data = rows ?? STANDINGS;
  const showSkeleton = loading || data.length === 0;

  return (
    <section
      aria-label="KBO 순위표"
      className="px-6 pt-9 pb-12"
      style={{
        // HeroCard 와의 톤 매칭 — 위쪽이 자연스럽게 어둡게 떨어짐
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.0) 0%, rgba(0,0,0,0.0) 100%)",
      }}
    >
      {/* ── 헤더 ── */}
      <div className="mb-5 flex items-baseline justify-between">
        <h2
          className="text-[11px] uppercase tracking-[0.36em] text-white/55"
          style={{ fontWeight: 700 }}
        >
          Standings
        </h2>
        <span
          className="text-[9.5px] uppercase tracking-[0.32em] text-white/30"
          style={{ fontWeight: 500 }}
        >
          2026 Regular Season
        </span>
      </div>

      {/* ── 컬럼 가이드 (얇은 텍스트만) ── */}
      <div
        className="mb-2 grid items-baseline gap-2 px-3 text-[9.5px] uppercase tracking-[0.28em] text-white/35"
        style={{
          fontWeight: 600,
          gridTemplateColumns: "20px 28px 1fr 56px 44px 32px",
        }}
      >
        <span className="text-center">#</span>
        <span />
        <span>Team</span>
        <span className="text-right tracking-[0.22em]">W·L·D</span>
        <span className="text-right">PCT</span>
        <span className="text-right">GB</span>
      </div>

      {/* ── 본문 ── */}
      {showSkeleton ? (
        <SkeletonList />
      ) : (
        <ul role="list" className="flex flex-col">
          {data.map((row, i) => (
            <Row
              key={row.teamId}
              row={row}
              isMe={row.teamId === myTeamId}
              index={i}
            />
          ))}
        </ul>
      )}

      {/* ── 풋터 ── */}
      <p
        className="mt-7 text-center text-[9.5px] uppercase tracking-[0.32em] text-white/25"
        style={{ fontWeight: 600 }}
      >
        Updated · Mock data — 실시간 KBO 연동 예정
      </p>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────

function Row({
  row,
  isMe,
  index,
}: {
  row: StandingRow;
  isMe: boolean;
  index: number;
}) {
  const t = findTeam(row.teamId);

  // 진입 애니메이션은 가벼운 페이드만 — 1회성, 스크롤 인뷰 없음 (스케줄 탭 케이스 학습)
  const enter = useMemo(
    () => ({
      initial: { opacity: 0, y: 6 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.32, ease, delay: Math.min(index * 0.025, 0.2) },
    }),
    [index]
  );

  return (
    <li>
      <motion.div
        {...enter}
        className="relative grid items-center gap-2 rounded-2xl px-3 py-3"
        style={{
          gridTemplateColumns: "20px 28px 1fr 56px 44px 32px",
          backgroundColor: isMe ? `${t.accent}1a` : "transparent",
        }}
      >
        {/* 응원팀: 좌측 얇은 컬러 바 + 안쪽 글로우 */}
        {isMe && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-1 left-1 w-[2px] rounded-full"
            style={{
              backgroundColor: t.accent,
              boxShadow: `0 0 10px ${t.accent}99`,
            }}
          />
        )}

        {/* 순위 */}
        <span
          className="text-center tabular-nums"
          style={{
            fontFamily:
              '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
            fontWeight: isMe ? 800 : 600,
            fontSize: 13,
            color: isMe ? t.accent : "rgba(255,255,255,0.55)",
            letterSpacing: "-0.01em",
          }}
        >
          {row.rank}
        </span>

        {/* 로고 */}
        <span className="flex h-7 w-7 items-center justify-center">
          <LogoImage
            teamId={row.teamId}
            alt={t.nameEn}
            size={28}
            priority
            className="h-7 w-7"
            style={{
              filter: isMe
                ? `drop-shadow(0 0 6px ${t.accent}88)`
                : "drop-shadow(0 1px 2px rgba(0,0,0,0.4))",
            }}
          />
        </span>

        {/* 팀명 */}
        <span
          className="min-w-0 truncate"
          style={{
            fontFamily:
              '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
            fontWeight: isMe ? 800 : 600,
            fontSize: 13.5,
            letterSpacing: "-0.005em",
            color: isMe ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.85)",
          }}
        >
          {t.short}
        </span>

        {/* W · L · D */}
        <span
          className="text-right tabular-nums"
          style={{
            fontFamily:
              '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
            fontSize: 12.5,
            fontWeight: isMe ? 700 : 500,
            color: isMe ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.62)",
            letterSpacing: "-0.005em",
          }}
        >
          {row.wins}
          <span className="mx-0.5" style={{ color: "rgba(255,255,255,0.22)" }}>
            ·
          </span>
          {row.losses}
          {row.draws > 0 && (
            <>
              <span
                className="mx-0.5"
                style={{ color: "rgba(255,255,255,0.22)" }}
              >
                ·
              </span>
              {row.draws}
            </>
          )}
        </span>

        {/* 승률 */}
        <span
          className="text-right tabular-nums"
          style={{
            fontFamily:
              '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
            fontSize: 12,
            fontWeight: isMe ? 700 : 500,
            color: isMe ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.5)",
            letterSpacing: "0.005em",
          }}
        >
          {formatWinRate(row.winRate)}
        </span>

        {/* GB */}
        <span
          className="text-right tabular-nums"
          style={{
            fontFamily:
              '"Pretendard Variable", "Helvetica Neue", Inter, sans-serif',
            fontSize: 11.5,
            fontWeight: 500,
            color: isMe ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.32)",
          }}
        >
          {formatGamesBehind(row.gamesBehind)}
        </span>
      </motion.div>
    </li>
  );
}

// ──────────────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <ul role="list" className="flex flex-col" aria-label="순위표 로딩 중">
      {Array.from({ length: 10 }).map((_, i) => (
        <li key={i}>
          <div
            className="relative grid items-center gap-2 rounded-2xl px-3 py-3"
            style={{ gridTemplateColumns: "20px 28px 1fr 56px 44px 32px" }}
          >
            <ShimmerBar w={10} h={10} className="mx-auto rounded-sm" />
            <ShimmerBar w={24} h={24} className="rounded-full" />
            <ShimmerBar w={`${50 + ((i * 7) % 30)}%`} h={11} className="rounded" />
            <ShimmerBar w={44} h={10} className="ml-auto rounded" />
            <ShimmerBar w={32} h={10} className="ml-auto rounded" />
            <ShimmerBar w={20} h={10} className="ml-auto rounded" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ShimmerBar({
  w,
  h,
  className = "",
}: {
  w: number | string;
  h: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`block ${className}`}
      style={{
        width: typeof w === "number" ? `${w}px` : w,
        height: h,
        background:
          "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%)",
        backgroundSize: "200% 100%",
        animation: "ground-shimmer 1.6s linear infinite",
      }}
    />
  );
}
