import { NextResponse } from "next/server";

// 임시: Vercel 서버에서 다음 스포츠에 닿는지 확인용 — 확인 후 지운다
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    const res = await fetch("https://sports.daum.net/api/arms/SPORTS_GAME?gameId=80111000&detail=liveData", {
      headers: { referer: "https://sports.daum.net/schedule/kbo", "user-agent": "Mozilla/5.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as { document?: { liveData?: { liveText?: unknown[] } } };
    return NextResponse.json({
      status: res.status,
      lines: json.document?.liveData?.liveText?.length ?? null,
      ms: Date.now() - started,
      region: process.env.VERCEL_REGION ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e), ms: Date.now() - started, region: process.env.VERCEL_REGION ?? null });
  }
}
