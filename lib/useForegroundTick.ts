"use client";

import { useEffect, useState } from "react";

/**
 * 앱(웹뷰)이 백그라운드에서 다시 앞으로 올 때마다 1씩 오르는 값.
 * 피드 블록은 처음 열릴 때 한 번만 데이터를 받으므로, 그때 실패하거나 비어 있으면 앱을 껐다 켜기 전까지
 * 계속 비어 있었다 → 이 값을 의존성에 넣어 다시 앞으로 올 때 새로 받는다.
 */
export function useForegroundTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") setTick((t) => t + 1);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  return tick;
}
