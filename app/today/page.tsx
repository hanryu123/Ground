"use client";

import { useState } from "react";
import HeroCard from "@/components/HeroCard";
import DirectorNav from "@/components/DirectorNav";
import StandingsDrawer from "@/components/StandingsDrawer";
import { useMyTeam } from "@/lib/useMyTeam";
import { useDirectorMode } from "@/lib/director";

export default function TodayPage() {
  const team = useMyTeam();
  const directorOn = useDirectorMode();

  // BottomNav(96px) 위로 드로어/핸들을 띄움. 디렉터 네비가 떠 있으면 ~138px.
  const bottomOffset = directorOn ? 138 : 96;

  // 순위 드로어 상태
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <section
      className="relative h-dvh overflow-hidden"
      style={{
        paddingBottom: bottomOffset,
      }}
    >
      <HeroCard team={team} hideBottomInfo={drawerOpen} />
      {directorOn && <DirectorNav />}

      <StandingsDrawer
        myTeamId={team.id}
        isOpen={drawerOpen}
        onOpenChange={setDrawerOpen}
        bottomOffset={bottomOffset}
      />
    </section>
  );
}
