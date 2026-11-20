"use client";

import { motion } from "framer-motion";
import StandingsSection from "@/components/StandingsSection";
import PostseasonBracket from "@/components/PostseasonBracket";
import { useMyTeam } from "@/lib/useMyTeam";
import { useStandings } from "@/lib/useStandings";

const ease = [0.22, 1, 0.36, 1] as const;
/**
 * /rank — KBO 정규시즌 순위표 단독 페이지.
 *
 *  ── 배경 ──
 *   기존엔 /today 하단에 차트가 깔려 있었으나, hero 화보를 풀뷰포트로 살리기
 *   위해 별도 탭으로 분리. BottomNav 의 (구) MY 자리를 RANK 가 흡수.
 *
 *  ── 데이터 ──
 *   useStandings() → /api/kbo/standings (순위 + 연속·최근 10경기 + 포스트시즌 대진표, 5분 갱신).
 *
 *  ── 탭 ──
 *   팀 순위 / 개인 기록. 개인 기록은 다음 단계라 지금은 비활성.
 */
export default function RankPage() {
  const team = useMyTeam();
  const { data, error } = useStandings();
  const season = data?.season ?? new Date().getFullYear();

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-sys-bg overscroll-contain px-0 pb-nav [-webkit-overflow-scrolling:touch]">
      {/* ── 헤더 ── */}
      <header className="safe-pt px-5 pb-1">
        <h1 className="text-[34px] font-bold leading-[1.15] tracking-[-0.02em]">순위</h1>
        <p className="mt-0.5 text-[13px] text-sys-label2">
          {data?.regularSeasonOver ? `${season} 정규시즌 최종 순위` : `${season} 정규시즌 · 매일 업데이트`}
        </p>
      </header>

      {/* ── 포스트시즌 대진표 (접이식) ── */}
      {data?.bracket && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
          className="mt-4"
        >
          <PostseasonBracket bracket={data.bracket} />
        </motion.div>
      )}

      {/* ── 표 본체 ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease, delay: 0.18 }}
        className="mt-4"
      >
        {error && !data ? (
          <p className="px-7 py-10 text-center text-[15px] text-sys-label2">
            순위를 불러오지 못했어요. 잠시 후 다시 열어 주세요.
          </p>
        ) : (
          <StandingsSection myTeamId={team.id} rows={data?.standings} loading={!data} />
        )}
      </motion.div>

    </section>
  );
}
