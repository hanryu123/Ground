"use client";

import { motion } from "framer-motion";
import StandingsSection from "@/components/StandingsSection";
import { useMyTeam } from "@/lib/useMyTeam";
import { useKboToday } from "@/lib/useKboToday";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * /rank — KBO 정규시즌 순위표 단독 페이지.
 *
 *  ── 배경 ──
 *   기존엔 /today 하단에 차트가 깔려 있었으나, hero 화보를 풀뷰포트로 살리기
 *   위해 별도 탭으로 분리. BottomNav 의 (구) MY 자리를 RANK 가 흡수.
 *
 *  ── 데이터 ──
 *   useKboToday() 로 standings 받음 (60s 폴링). HeroCard 와 동일 훅을
 *   재사용하므로 같은 세션에선 fetch 캐시 hit.
 */
export default function RankPage() {
  const team = useMyTeam();
  const live = useKboToday();

  return (
    <section className="px-0 pb-10">
      {/* ── 헤더 ── */}
      <header className="px-7 pt-7">
        <p
          className="text-[10px] uppercase tracking-[0.32em] text-white/45"
          style={{ fontWeight: 600 }}
        >
          Rank
        </p>
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease }}
          className="mt-3 text-[40px] leading-[0.95] tracking-tightest text-white"
          style={{ fontWeight: 900 }}
        >
          KBO 순위
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease, delay: 0.1 }}
          className="mt-2 text-[12.5px] text-white/45"
          style={{ fontWeight: 400, letterSpacing: "0.01em" }}
        >
          2026 정규시즌 · 라이브
        </motion.p>
      </header>

      {/* ── 표 본체 ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease, delay: 0.18 }}
        className="mt-5"
      >
        <StandingsSection
          myTeamId={team.id}
          rows={live?.standings}
          loading={!live}
        />
      </motion.div>
    </section>
  );
}
