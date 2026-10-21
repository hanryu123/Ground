"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import StandingsSection from "@/components/StandingsSection";
import PostseasonBracket from "@/components/PostseasonBracket";
import { useMyTeam } from "@/lib/useMyTeam";
import { useStandings } from "@/lib/useStandings";

const ease = [0.22, 1, 0.36, 1] as const;
const CONTACT_EMAIL = "ground.admiin@gmail.com";

const MAIL_TO = (() => {
  const subject = encodeURIComponent("[GROUND 피드백] 야구 찐팬의 한마디");
  const body = encodeURIComponent(
    "기기명 (예: iPhone 15 Pro): \n응원 구단: \n\n불편하셨던 점이나 GROUND 팀에게 바라는 점을 자유롭게 적어주세요! ⚾️",
  );
  return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
})();

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
    <section className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-black overscroll-contain px-0 pb-10 [-webkit-overflow-scrolling:touch]">
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
          {data?.regularSeasonOver ? `${season} 정규시즌 최종 순위` : `${season} 정규시즌 · 매일 업데이트`}
        </motion.p>
      </header>

      {/* ── 탭: 개인 기록은 다음 단계 ── */}
      <div role="tablist" aria-label="순위 종류" className="mt-5 flex gap-5 border-b border-white/10 px-7">
        <button
          type="button"
          role="tab"
          aria-selected
          className="relative pb-2.5 text-[13.5px] text-white"
          style={{ fontWeight: 700 }}
        >
          팀 순위
          <span aria-hidden className="absolute inset-x-0 bottom-[-1px] h-[2px] rounded-full bg-white" />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={false}
          aria-disabled
          disabled
          className="flex items-center gap-1.5 pb-2.5 text-[13.5px] text-white/30"
          style={{ fontWeight: 600 }}
        >
          개인 기록
          <span className="rounded-full border border-white/15 px-1.5 py-px text-[9.5px] text-white/35">
            준비 중
          </span>
        </button>
      </div>

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
          <p className="px-7 py-10 text-center text-[13px] text-white/45">
            순위를 불러오지 못했어요. 잠시 후 다시 열어 주세요.
          </p>
        ) : (
          <StandingsSection myTeamId={team.id} rows={data?.standings} loading={!data} />
        )}
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
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("[GROUND] 데이터 삭제 요청")}&body=${encodeURIComponent("안녕하세요,\n\nGROUND 앱에 저장된 제 데이터(푸시 토큰, 기기 ID) 삭제를 요청합니다.\n\n앱 버전: \n요청 사유 (선택): ")}`}
            className="text-[10px] text-white/18 underline underline-offset-2 transition hover:text-white/35"
          >
            데이터 삭제 요청
          </a>
        </div>
      </motion.div>
    </section>
  );
}
