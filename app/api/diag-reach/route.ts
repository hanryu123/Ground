export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** 임시 진단 — 서버에서 외부 데이터 출처에 닿는지 (고정 주소만). 확인 뒤 지운다. */
const TARGETS: Array<{ name: string; url: string; init?: RequestInit }> = [
  { name: "naver-api-gw", url: "https://api-gw.sports.naver.com/schedule/games?fields=basic&upperCategoryId=kbaseball&categoryId=kbo&fromDate=2026-10-26&toDate=2026-10-26&size=5" },
  { name: "naver-m-sports", url: "https://m.sports.naver.com/kbaseball/schedule/index" },
  { name: "naver-www", url: "https://www.naver.com/" },
  {
    name: "kbo-official",
    url: "https://www.koreabaseball.com/ws/Main.asmx/GetKboGameList",
    init: { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "leId=1&srId=0,1,3,4,5,6,7,8,9&date=20261026" },
  },
  { name: "daum-sports", url: "https://sports.daum.net/prx/hermes/api/game/schedule.json?leagueCode=kbo&seasonKey=2026&fromDate=20261026&toDate=20261026" },
  { name: "youtube", url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCoVz66yWHzVsXAFG8WhJK9g" },
];

export async function GET() {
  const results = await Promise.all(
    TARGETS.map(async (t) => {
      const started = Date.now();
      try {
        const res = await fetch(t.url, {
          ...t.init,
          headers: {
            "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            referer: "https://m.sports.naver.com/",
            ...(t.init?.headers ?? {}),
          },
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        const text = await res.text();
        return { name: t.name, status: res.status, ms: Date.now() - started, sample: text.slice(0, 160) };
      } catch (err) {
        return { name: t.name, error: (err as Error).message, ms: Date.now() - started };
      }
    })
  );
  return Response.json({ region: process.env.VERCEL_REGION ?? null, results }, { headers: { "cache-control": "no-store" } });
}
