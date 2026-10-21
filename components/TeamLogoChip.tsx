"use client";

import LogoImage from "@/components/LogoImage";
import { findTeam } from "@/lib/teams";

/**
 * 검은 배경 표·대진표용 작은 로고. LG·KT 로고가 검정이라 밝은 원 위에 올린다.
 */
export default function TeamLogoChip({ teamId, size = 22 }: { teamId: string; size?: number }) {
  const inner = Math.round(size * 0.74);
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: "rgba(255,255,255,0.94)" }}
    >
      <LogoImage teamId={teamId} alt="" size={inner} fallbackText={findTeam(teamId).shortEn} />
    </span>
  );
}
