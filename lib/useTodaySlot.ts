"use client";

import { useEffect, useState } from "react";

/**
 * 시간대 기반 화보 슬롯
 *  - "morning": 06:00 ~ 21:59
 *  - "night"  : 22:00 ~ 익일 05:59
 */
export type TodaySlot = "morning" | "night";

/** 디바이스 로컬 시간을 기준으로 슬롯 계산 */
export function computeSlot(now: Date = new Date()): TodaySlot {
  const h = now.getHours();
  return h >= 6 && h < 22 ? "morning" : "night";
}

/** 다음 슬롯 경계까지 남은 ms (06:00 또는 22:00 도달 시점) */
function msUntilNextBoundary(now: Date): number {
  const next = new Date(now);
  const h = now.getHours();
  if (h >= 6 && h < 22) {
    // morning → 오늘 22:00 까지
    next.setHours(22, 0, 0, 0);
  } else if (h >= 22) {
    // night(밤) → 다음날 06:00
    next.setDate(next.getDate() + 1);
    next.setHours(6, 0, 0, 0);
  } else {
    // night(새벽 0~5:59) → 오늘 06:00
    next.setHours(6, 0, 0, 0);
  }
  return Math.max(1000, next.getTime() - now.getTime());
}

/**
 * 현재 슬롯을 반환. 슬롯 경계(06:00 / 22:00)에 자동으로 재계산되어
 * 화보가 별도 새로고침 없이도 자연스럽게 전환된다.
 *
 * SSR 안전: 첫 렌더는 항상 "morning"으로 시작 → 클라이언트 마운트 직후
 * 실제 시간으로 동기화. 초기 hydration mismatch 발생하지 않음.
 */
export function useTodaySlot(): TodaySlot {
  const [slot, setSlot] = useState<TodaySlot>("morning");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      const now = new Date();
      setSlot(computeSlot(now));
      timer = setTimeout(tick, msUntilNextBoundary(now));
    };
    tick();

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  return slot;
}
