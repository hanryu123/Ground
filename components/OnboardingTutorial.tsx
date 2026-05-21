"use client";

import { useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";

export const TUTORIAL_SEEN_KEY = "ground-has-seen-tutorial";

const ease = [0.22, 1, 0.36, 1] as const;

type MockNotif = {
  icon: string;
  app: string;
  title: string;
  body: string;
  time: string;
};

type Slide = {
  emoji: string;
  accentFrom: string;
  accentTo: string;
  title: string;
  desc: string;
  sub: string | null;
  mock: MockNotif;
};

const SLIDES: Slide[] = [
  {
    emoji: "⚾️",
    accentFrom: "#1e40af",
    accentTo: "#3b82f6",
    title: "우리 팀만을 위한\n편파 프리뷰",
    desc: "오늘의 선발 투수와 핵심 관전 포인트! 경기 시작 전, 팬의 시선으로 분석한 프리뷰 알림을 받아보세요.",
    sub: null,
    mock: {
      icon: "⚾️",
      app: "GROUND",
      title: "오늘 경기 프리뷰 도착!",
      body: "선발 임찬규 vs 양현종 · 팬의 시선 관전 포인트 3가지",
      time: "경기 1시간 전",
    },
  },
  {
    emoji: "🔥",
    accentFrom: "#991b1b",
    accentTo: "#ef4444",
    title: "도파민 폭발!\n실시간 편파 중계",
    desc: "삼진, 홈런, 투수 교체 등 결정적 순간! 뻔한 점수 대신 찐팬의 찰진 감탄사가 담긴 실시간 알림이 도착합니다.",
    sub: null,
    mock: {
      icon: "🔥",
      app: "GROUND",
      title: "⚾️ LG 실시간",
      body: "[7회초] 오스틴!! 2점 홈런ㄷㄷ 역전이다 가자!!",
      time: "방금",
    },
  },
  {
    emoji: "🍿",
    accentFrom: "#92400e",
    accentTo: "#f59e0b",
    title: "여운을 남기는\n한줄평 & 하이라이트",
    desc: "경기 종료 후 오늘의 한줄평과 하이라이트 영상을 바로 쏴드립니다.",
    sub: "※ 원치 않는 알림은 설정 탭에서 언제든 끌 수 있어요!",
    mock: {
      icon: "🏆",
      app: "GROUND",
      title: "경기 종료 · LG 5 : 3 KIA",
      body: "임찬규 7이닝 역투... 오늘 잠실은 너무 뜨거웠다 🔥",
      time: "10:12 PM",
    },
  },
];

function NotifMock({ mock, accent }: { mock: MockNotif; accent: string }) {
  return (
    <div
      className="w-full rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-md"
      style={{ boxShadow: `0 4px 24px ${accent}22, 0 8px 32px rgba(0,0,0,0.45)` }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-black/30 text-[13px]">
            {mock.icon}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
            {mock.app}
          </span>
        </div>
        <span className="text-[11px] text-white/35">{mock.time}</span>
      </div>
      <p className="text-[13px] font-bold leading-snug text-white/95">{mock.title}</p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-white/65">{mock.body}</p>
    </div>
  );
}

type Props = { onDone: () => void };

export default function OnboardingTutorial({ onDone }: Props) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);

  function dismiss() {
    try {
      localStorage.setItem(TUTORIAL_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    onDone();
  }

  function goTo(idx: number) {
    setDirection(idx > current ? 1 : -1);
    setCurrent(idx);
  }

  function next() {
    if (current < SLIDES.length - 1) goTo(current + 1);
    else dismiss();
  }

  function prev() {
    if (current > 0) goTo(current - 1);
  }

  function handleDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x < -40 && info.velocity.x < 0) next();
    else if (info.offset.x > 40 && info.velocity.x > 0) prev();
  }

  const slide = SLIDES[current];
  const isLast = current === SLIDES.length - 1;

  const variants = {
    enter: (dir: number) => ({
      x: dir > 0 ? "55%" : "-55%",
      opacity: 0,
      scale: 0.94,
    }),
    center: { x: 0, opacity: 1, scale: 1 },
    exit: (dir: number) => ({
      x: dir > 0 ? "-55%" : "55%",
      opacity: 0,
      scale: 0.94,
    }),
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease }}
      className="absolute inset-0 z-[200] flex flex-col overflow-hidden"
      style={{
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {/* 배경 글로우 */}
      <motion.div
        key={current}
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        style={{
          background: `radial-gradient(ellipse 80% 50% at 50% 30%, ${slide.accentTo}22 0%, transparent 70%)`,
        }}
      />

      {/* 건너뛰기 */}
      <div className="relative z-10 flex justify-end px-6 pt-5">
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full px-3 py-1.5 text-[12px] font-medium text-white/45 transition hover:text-white/80"
        >
          건너뛰기
        </button>
      </div>

      {/* 슬라이드 영역 */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6">
        <AnimatePresence custom={direction} mode="popLayout">
          <motion.div
            key={current}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.38, ease }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={handleDragEnd}
            className="w-full cursor-grab active:cursor-grabbing"
            style={{ touchAction: "pan-y" }}
          >
            <div className="flex flex-col gap-6">
              {/* 노티 목업 */}
              <div className="relative mx-auto w-full max-w-sm">
                {/* 뒤 겹친 카드 효과 */}
                <div
                  className="absolute inset-x-3 -bottom-2.5 h-full rounded-2xl border border-white/[0.05] bg-white/[0.03]"
                  aria-hidden
                />
                <div
                  className="absolute inset-x-1.5 -bottom-1 h-full rounded-2xl border border-white/[0.06] bg-white/[0.04]"
                  aria-hidden
                />
                <div className="relative">
                  <NotifMock mock={slide.mock} accent={slide.accentTo} />
                </div>
              </div>

              {/* 텍스트 */}
              <div className="text-center">
                <p className="text-[30px] leading-none">{slide.emoji}</p>
                <h2
                  className="mt-3 whitespace-pre-line text-[22px] font-bold leading-tight tracking-tight text-white"
                  style={{ textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
                >
                  {slide.title}
                </h2>
                <p className="mx-auto mt-3 max-w-xs text-[14px] leading-relaxed text-white/65">
                  {slide.desc}
                </p>
                {slide.sub && (
                  <p className="mx-auto mt-3 max-w-xs text-[11.5px] leading-relaxed text-white/35">
                    {slide.sub}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 하단 — 인디케이터 + 버튼 */}
      <div
        className="relative z-10 flex flex-col items-center gap-5 px-6 pb-10 pt-4"
        style={{ paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {/* 닷 인디케이터 */}
        <div className="flex items-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`슬라이드 ${i + 1}`}
              className="transition-all duration-300"
              style={{
                width: i === current ? 20 : 6,
                height: 6,
                borderRadius: 9999,
                backgroundColor:
                  i === current ? slide.accentTo : "rgba(255,255,255,0.25)",
              }}
            />
          ))}
        </div>

        {/* CTA 버튼 */}
        <motion.button
          type="button"
          onClick={next}
          whileTap={{ scale: 0.96 }}
          className="w-full max-w-xs rounded-2xl py-4 text-[15px] font-bold tracking-wide text-white shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-all"
          style={{
            background: `linear-gradient(135deg, ${slide.accentFrom} 0%, ${slide.accentTo} 100%)`,
            boxShadow: `0 8px 28px ${slide.accentTo}55`,
          }}
        >
          {isLast ? "시작하기 🔥" : "다음"}
        </motion.button>
      </div>
    </motion.div>
  );
}
