"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { MotionConfig } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import EnvironmentBadge from "@/components/EnvironmentBadge";
import OnboardingGate from "@/components/OnboardingGate";
import PageShell from "@/components/PageShell";
import { clubCssVars } from "@/lib/clubTheme";
import { useMyTeam } from "@/lib/useMyTeam";

/** 응원팀이 바뀌면 --club-* 를 다시 깐다 (첫 페인트 값은 layout 의 부트 스크립트가 넣는다) */
function useClubVars(teamId: string) {
  useEffect(() => {
    const style = document.documentElement.style;
    for (const [key, value] of Object.entries(clubCssVars(teamId))) style.setProperty(key, value);
  }, [teamId]);
}

export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const team = useMyTeam();
  useClubVars(team.id);
  const isAdminRoute = pathname?.startsWith("/admin") ?? false;
  const isDocumentRoute =
    pathname === "/privacy" ||
    pathname?.startsWith("/privacy/") ||
    pathname === "/download";

  if (isAdminRoute) {
    return (
      <div className="touch-auto fixed inset-0 w-full overflow-y-auto overscroll-contain bg-slate-950 text-slate-100 [-webkit-overflow-scrolling:touch]">
        {children}
      </div>
    );
  }

  if (isDocumentRoute) {
    return <>{children}</>;
  }

  return (
    // 기기의 '동작 줄이기' 설정을 framer-motion 전체에 적용
    <MotionConfig reducedMotion="user">
      <OnboardingGate>
        <div
          className="app-shell fixed inset-0 mx-auto flex min-h-0 w-full max-w-md flex-col overflow-hidden bg-sys-bg text-label"
          style={{
            height: "var(--visual-viewport-height, 100dvh)",
            maxHeight: "var(--visual-viewport-height, 100dvh)",
          }}
        >
          <EnvironmentBadge />
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <PageShell>{children}</PageShell>
          </main>
          <BottomNav />
        </div>
      </OnboardingGate>
    </MotionConfig>
  );
}
