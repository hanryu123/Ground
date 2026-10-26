import { NAVER_ORIGIN } from "@/lib/naverApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * GET /api/naver/<path>?<query> → api-gw.sports.naver.com/<path>?<query>
 * 서울(icn1) 리전에서만 돈다 (vercel.json). 미국 리전 함수가 네이버를 직접 못 부를 때 쓰는 중계 — lib/naverApi.ts 참고.
 * 공개 스포츠 데이터만, 경기 일정·중계·뉴스 경로만 허용한다.
 */
const ALLOWED = /^(schedule|news)\//;
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const joined = path.map(encodeURIComponent).join("/");
  if (!ALLOWED.test(joined)) return new Response("not allowed", { status: 403 });
  const { search } = new URL(req.url);
  try {
    const res = await fetch(`${NAVER_ORIGIN}/${joined}${search}`, {
      headers: { "user-agent": UA, accept: "application/json", referer: "https://m.sports.naver.com/" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "naver_unreachable", message: (err as Error).message }), {
      status: 502,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
}
