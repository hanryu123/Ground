"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import OnboardingFlow from "./OnboardingFlow";
import { MY_TEAM_EVENT, MY_TEAM_KEY, ONBOARDING_DONE_KEY } from "@/lib/useMyTeam";
import { registerNativePush } from "@/lib/nativePush";
import { getOrCreateNotifyUserId } from "@/lib/webPushClient";
import { recoverLiveActivityForTeam } from "@/lib/liveActivityRecovery";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * OnboardingGate — 앱 전역 첫 진입 게이트.
 *
 *  팀 정보(localStorage `kbo-my-team`)가 없으면 라우트와 무관하게
 *  무조건 풀스크린 `<TeamSelectScreen />` 만 보여주고, 본 앱(children: BottomNav 포함)은
 *  렌더 자체를 차단한다.
 *  → /today, /schedule, /my 어느 경로로 진입해도 동일하게 가로챈다.
 *
 *  hydration:
 *   - SSR/첫 클라 렌더에서는 isReady=false 라 배경색 가림막만 그린다 (서버/클라 동일).
 *   - 클라이언트 useEffect 후 isReady=true 가 되면 hasChosen 분기로 전환.
 *   - 잘못된 분기 플래시 없음.
 */
export default function OnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin") ?? false;
  const [isReady, setIsReady] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [isOnboardingDone, setIsOnboardingDone] = useState(false);

  useEffect(() => {
    const sync = () => {
      try {
        const selected = localStorage.getItem(MY_TEAM_KEY);
        const done = localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
        setTeamId(selected);
        setIsOnboardingDone(done);
        setIsReady(true);
      } catch {
        setTeamId(null);
        setIsOnboardingDone(false);
        setIsReady(true);
      }
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(MY_TEAM_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(MY_TEAM_EVENT, sync);
    };
  }, []);

  // 네이티브 앱: 온보딩 완료 후 FCM 토큰 등록
  // ※ 조건부 return 이전에 위치해야 React hooks 규칙을 준수함
  useEffect(() => {
    const unlocked = Boolean(teamId) && isOnboardingDone;
    if (!unlocked || !teamId) return;
    try {
      const userId = getOrCreateNotifyUserId();
      void registerNativePush({ userId, favoriteTeam: teamId });
      void recoverLiveActivityForTeam(teamId).catch((error) => {
        console.warn("[liveActivityRecovery] failed:", error);
      });
    } catch {
      // 웹 환경에서는 무시
    }
  }, [isOnboardingDone, teamId]);

  if (isAdminRoute) {
    return <>{children}</>;
  }

  if (!isReady) {
    // 앱 시작 화면(iOS 스플래시)과 같은 그림을 같은 크기로 — 네이티브 스플래시가 걷힌 뒤 화면이 끊기지 않게
    return (
      <div className="flex h-dvh items-center justify-center bg-[#071a31]" aria-label="GROUND 불러오는 중">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/ground-poster.webp" alt="" width={1024} height={1024} className="w-[min(91vw,42vh)]" fetchPriority="high" />
      </div>
    );
  }

  const unlocked = Boolean(teamId) && isOnboardingDone;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {!unlocked ? (
        <motion.div
          key="onboarding"
          exit={{ opacity: 0, transition: { duration: 0.4, ease } }}
        >
          <OnboardingFlow
            onComplete={() => {
              try {
                setTeamId(localStorage.getItem(MY_TEAM_KEY));
              } catch {
                setTeamId(null);
              }
              setIsOnboardingDone(true);
            }}
          />
        </motion.div>
      ) : (
        <motion.div
          key="app"
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            transition: { duration: 0.5, ease, delay: 0.05 },
          }}
          className="relative"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
