"use client";

import HeroCard from "@/components/HeroCard";
import DirectorNav from "@/components/DirectorNav";
import { useMyTeam } from "@/lib/useMyTeam";
import { useDirectorMode } from "@/lib/director";

/**
 * /today — 메인 화면 (HeroCard 단독 풀뷰포트).
 *
 *  ── 변경 이력 ──
 *   기존엔 HeroCard 아래로 StandingsSection(순위표) 가 스크롤로 따라붙었으나,
 *   순위표는 별도 /rank 탭으로 이전 (BottomNav 의 RANK 진입). today 탭은
 *   화보·매치업·선발에만 집중.
 *
 *  BottomNav 는 layout 의 fixed 요소이고 main 에 pb-24 가 잡혀 있어
 *  HeroCard 는 안전하게 100dvh 사용 가능.
 */
export default function TodayPage() {
  const team = useMyTeam();
  const directorOn = useDirectorMode();

  return (
    <div className="relative">
      <div className="relative h-dvh w-full overflow-hidden">
        <HeroCard team={team} />
      </div>
      {directorOn && <DirectorNav />}
    </div>
  );
}
