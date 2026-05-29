"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import StandingsSection from "@/components/StandingsSection";
import { useMyTeam } from "@/lib/useMyTeam";
import { useKboToday } from "@/lib/useKboToday";

const ease = [0.22, 1, 0.36, 1] as const;

const MAIL_TO = (() => {
  const to = "janghanr@gmail.com";
  const subject = encodeURIComponent("[GROUND 피드백] 야구 찐팬의 한마디");
  const body = encodeURIComponent(
    "기기명 (예: iPhone 15 Pro): \n응원 구단: \n\n불편하셨던 점이나 GROUND 팀에게 바라는 점을 자유롭게 적어주세요! ⚾️",
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
})();

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
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-0 pb-10 [-webkit-overflow-scrolling:touch]">
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

      {/* ── 개발자에게 연락하기 ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease, delay: 0.32 }}
        className="flex flex-col items-center gap-2 px-7 pb-6 pt-10"
      >
        <a
          href={MAIL_TO}
          className="rounded-full border border-white/[0.14] px-5 py-2.5 text-[11.5px] tracking-wide text-white/38 transition-colors hover:border-white/25 hover:text-white/55 active:opacity-70"
          style={{ fontWeight: 500 }}
        >
          GROUND 개선 의견 보내기
        </a>
        <p className="text-[10px] text-white/20" style={{ letterSpacing: "0.02em" }}>
          찐팬의 목소리가 GROUND를 만들어요 ⚾️
        </p>
        <div className="mt-2 flex items-center gap-3">
          <Link
            href="/privacy"
            className="text-[10px] text-white/18 underline underline-offset-2 transition hover:text-white/35"
          >
            개인정보처리방침
          </Link>
          <span className="text-[10px] text-white/12">·</span>
          <a
            href={`mailto:janghanr@gmail.com?subject=${encodeURIComponent("[GROUND] 데이터 삭제 요청")}&body=${encodeURIComponent("안녕하세요,\n\nGROUND 앱에 저장된 제 데이터(푸시 토큰, 기기 ID) 삭제를 요청합니다.\n\n앱 버전: \n요청 사유 (선택): ")}`}
            className="text-[10px] text-white/18 underline underline-offset-2 transition hover:text-white/35"
          >
            데이터 삭제 요청
          </a>
        </div>
      </motion.div>
    </section>
  );
}
