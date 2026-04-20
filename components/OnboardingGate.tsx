"use client";

import { AnimatePresence, motion } from "framer-motion";
import TeamSelectScreen from "./TeamSelectScreen";
import { useMyTeamMeta } from "@/lib/useMyTeam";

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
 *   - SSR/첫 클라 렌더에서는 isReady=false 라 검은 가림막만 그린다 (서버/클라 동일).
 *   - 클라이언트 useEffect 후 isReady=true 가 되면 hasChosen 분기로 전환.
 *   - 잘못된 분기 플래시 없음.
 */
export default function OnboardingGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { hasChosen, isReady } = useMyTeamMeta();

  if (!isReady) {
    return <div className="h-dvh bg-black" aria-hidden />;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {!hasChosen ? (
        <motion.div
          key="onboarding"
          exit={{ opacity: 0, transition: { duration: 0.4, ease } }}
        >
          <TeamSelectScreen />
        </motion.div>
      ) : (
        <motion.div
          key="app"
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            transition: { duration: 0.5, ease, delay: 0.05 },
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
