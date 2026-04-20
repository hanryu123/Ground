"use client";

import { useEffect, useState } from "react";
import { findStadium } from "./stadiums";

export type WeatherInfo = {
  isRainy: boolean;
  condition: string;
  description: string;
  temp?: number;
  rain1h?: number;
  forced?: boolean;
  mock?: boolean;
  loading: boolean;
};

const CLEAR: WeatherInfo = {
  isRainy: false,
  condition: "",
  description: "",
  loading: false,
};

/** 모듈 스코프 캐시 — 같은 좌표는 세션 내 1회만 fetch */
const cache = new Map<string, WeatherInfo>();

/**
 * 구장명을 받아서 해당 위치의 현재 날씨 상태를 구독한다.
 *
 *  - URL 쿼리 `?forceWeather=rain|clear`로 강제 오버라이드 가능 (검수용)
 *  - 같은 구장은 모듈 스코프 캐시 hit, 네트워크 호출 없음
 *  - fail-safe: 에러 시 isRainy: false 반환
 */
export function useWeather(
  stadiumName: string | null | undefined
): WeatherInfo {
  const stadium = findStadium(stadiumName);
  const cacheKey = stadium ? `${stadium.lat},${stadium.lon}` : "none";

  const [info, setInfo] = useState<WeatherInfo>(() => {
    const c = cache.get(cacheKey);
    if (c) return c;
    return stadium ? { ...CLEAR, loading: true } : CLEAR;
  });

  useEffect(() => {
    if (!stadium) {
      setInfo(CLEAR);
      return;
    }
    const cached = cache.get(cacheKey);
    if (cached) {
      setInfo(cached);
      return;
    }

    let alive = true;
    setInfo((prev) => ({ ...prev, loading: true }));

    // 디렉터 강제 오버라이드 (URL 쿼리)
    let forceParam = "";
    try {
      const params = new URLSearchParams(window.location.search);
      const f = params.get("forceWeather");
      if (f === "rain" || f === "clear") forceParam = `&force=${f}`;
    } catch {
      /* SSR/restricted env */
    }

    fetch(
      `/api/weather?lat=${stadium.lat}&lon=${stadium.lon}${forceParam}`
    )
      .then((r) => (r.ok ? r.json() : Promise.resolve({ isRainy: false })))
      .then((d) => {
        if (!alive) return;
        const next: WeatherInfo = {
          isRainy: Boolean(d.isRainy),
          condition: d.condition ?? "",
          description: d.description ?? "",
          temp: typeof d.temp === "number" ? d.temp : undefined,
          rain1h: typeof d.rain1h === "number" ? d.rain1h : undefined,
          forced: Boolean(d.forced),
          mock: Boolean(d.mock),
          loading: false,
        };
        cache.set(cacheKey, next);
        setInfo(next);
      })
      .catch(() => {
        if (!alive) return;
        setInfo(CLEAR);
      });

    return () => {
      alive = false;
    };
  }, [cacheKey, stadium]);

  return info;
}
