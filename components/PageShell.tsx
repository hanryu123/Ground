"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";

/**
 * 탭 전환 셸 — 탭 이동은 하단 탭으로만 하고, 여기선 전환 페이드만 맡는다.
 *
 *  ── 변경 이력 ──
 *   예전엔 화면 어디서든 좌우로 밀면 탭이 바뀌었으나, 피드 숏츠 넘기기·Games 주간 캘린더
 *   넘기기와 같은 제스처라 충돌해서 탭 전환 스와이프를 없앴다.
 */
const ROUTES = ["/today", "/schedule", "/rank"] as const;

// 진입 페이지는 즉시 보이고, 퇴장 페이지만 짧게 페이드아웃.
const variants = {
  enter: { opacity: 1 },   // 즉시 표시 — 진입 시 blank 방지
  center: { opacity: 1 },
  exit: {
    opacity: 0,
    transition: { duration: 0.12, ease: "easeIn" },
  },
};

function resolveIndex(path: string | null | undefined): number {
  if (!path) return -1;
  return ROUTES.findIndex((r) => path.startsWith(r));
}

export default function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inTabRoute = resolveIndex(pathname) !== -1;

  // 탭 라우트 밖(/my 등)은 전환 없이 렌더
  if (!inTabRoute) {
    return <>{children}</>;
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={pathname}
          className="flex min-h-0 flex-1 flex-col"
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

