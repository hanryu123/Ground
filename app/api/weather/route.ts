import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * 날씨 프록시 — OpenWeather Current Weather Data API 래핑.
 *
 *  GET /api/weather?lat=...&lon=...
 *  GET /api/weather?lat=...&lon=...&force=rain   ← 디렉터 디버그용 (강제 우천)
 *  GET /api/weather?lat=...&lon=...&force=clear  ← 디렉터 디버그용 (강제 맑음)
 *
 *  응답:
 *    { isRainy: boolean, condition: string, description: string,
 *      temp?: number, rain1h?: number, forced?: boolean, mock?: boolean }
 *
 *  - REPLICATE_API_TOKEN 처럼 OPENWEATHER_API_KEY 가 .env.local에 필요
 *  - 키가 없으면 fail-safe로 isRainy: false 반환 (서비스 중단 X)
 */

const RAIN_CONDITIONS = new Set(["Rain", "Drizzle", "Thunderstorm"]);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  const force = searchParams.get("force");

  // ── 디버그/디렉터 강제 모드 ──
  if (force === "rain") {
    return NextResponse.json({
      isRainy: true,
      condition: "Rain",
      description: "강제 우천 (debug)",
      forced: true,
    });
  }
  if (force === "clear") {
    return NextResponse.json({
      isRainy: false,
      condition: "Clear",
      description: "강제 맑음 (debug)",
      forced: true,
    });
  }

  if (!lat || !lon) {
    return NextResponse.json(
      { isRainy: false, error: "missing lat/lon" },
      { status: 400 }
    );
  }

  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) {
    return NextResponse.json({
      isRainy: false,
      condition: "Unknown",
      description: "OPENWEATHER_API_KEY 미설정 — 기본 맑음 처리",
      mock: true,
    });
  }

  const url =
    `https://api.openweathermap.org/data/2.5/weather` +
    `?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}` +
    `&appid=${key}&units=metric&lang=kr`;

  try {
    const res = await fetch(url, { next: { revalidate: 600 } }); // 10분 캐시
    if (!res.ok) throw new Error(`OpenWeather ${res.status}`);
    const data = await res.json();

    const arr = Array.isArray(data?.weather) ? data.weather : [];
    const main = String(arr[0]?.main ?? "");
    const desc = String(arr[0]?.description ?? "");
    const rain1h = Number(data?.rain?.["1h"] ?? 0) || 0;

    const isRainy = RAIN_CONDITIONS.has(main) || rain1h > 0.1;

    return NextResponse.json({
      isRainy,
      condition: main,
      description: desc,
      temp: typeof data?.main?.temp === "number" ? data.main.temp : undefined,
      rain1h,
    });
  } catch (e) {
    // 네트워크/타임아웃 → fail open (맑음으로 가정, 서비스 정상 동작)
    return NextResponse.json({
      isRainy: false,
      condition: "Unknown",
      description: "weather fetch failed — assume clear",
      error: String(e),
    });
  }
}
