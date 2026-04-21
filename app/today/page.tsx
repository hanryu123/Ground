"use client";

import HeroCard from "@/components/HeroCard";
import DirectorNav from "@/components/DirectorNav";
import StandingsSection from "@/components/StandingsSection";
import { useMyTeam } from "@/lib/useMyTeam";
import { useDirectorMode } from "@/lib/director";
import { useKboToday } from "@/lib/useKboToday";

/**
 * /today — 메인 화면.
 *
 *  ── 레이아웃 ──
 *   1. HeroCard      : 첫 화면 100dvh — 화보 + 슬로건 + 오늘 매치업
 *   2. StandingsSection: 아래로 스크롤하면 KBO 순위표(애플 스타일 표)
 *   3. DirectorNav    : (개발자용) BottomNav 위에 fixed 로 떠 있음
 *
 *  스크롤은 <main> 의 자연스러운 흐름을 사용한다 (h-dvh overflow-hidden 금지).
 *  BottomNav 는 layout 의 fixed 요소이고 main 에 pb-24 가 잡혀 있어
 *  마지막 콘텐츠가 가려지지 않는다.
 */
export default function TodayPage() {
  const team = useMyTeam();
  const directorOn = useDirectorMode();
  // 라이브 KBO standings → StandingsSection 에 주입 (HeroCard 도 동일 훅을 사용)
  const live = useKboToday();

  return (
    <div className="relative">
      {/* HeroCard — 첫 화면 풀뷰포트 */}
      <div className="relative h-dvh w-full overflow-hidden">
        <HeroCard team={team} />
      </div>

      {/* StandingsSection — 라이브 standings 가 있으면 우선 사용, 없으면 mock 폴백 */}
      <StandingsSection
        myTeamId={team.id}
        rows={live?.standings}
        loading={!live}
      />

      {directorOn && <DirectorNav />}
    </div>
  );
}
