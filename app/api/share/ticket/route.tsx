import { ImageResponse } from "next/og";
import { findTeam } from "@/lib/teams";
import { getClubTheme } from "@/lib/clubTheme";

export const runtime = "nodejs";

/**
 * GET /api/share/ticket?team=kia&opp=samsung&my=5&op=3&round=플레이오프 3차전&date=10월 29일&venue=광주
 * 경기 결과 티켓 — 인스타 스토리(1080×1920) 크기 PNG. 오늘 탭 "결과 티켓 공유하기"가 쓴다.
 * 점수·팀은 쿼리로 받는다 (공유 이미지라 DB 를 다시 읽지 않는다). 모르는 팀이면 400.
 */

const FONT_BASE = "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/woff";
const NUM_FONT = "https://cdn.jsdelivr.net/fontsource/fonts/barlow-condensed@latest/latin-700-normal.ttf";

let fontsPromise: Promise<Array<{ name: string; data: ArrayBuffer; weight: 700 | 900; style: "normal" }>> | null = null;

function loadFonts() {
  fontsPromise ??= Promise.all([
    fetch(`${FONT_BASE}/Pretendard-Black.woff`).then((r) => r.arrayBuffer()),
    fetch(`${FONT_BASE}/Pretendard-Bold.woff`).then((r) => r.arrayBuffer()),
    fetch(NUM_FONT).then((r) => r.arrayBuffer()),
  ])
    .then(([black, bold, num]) => [
      { name: "Pretendard", data: black, weight: 900 as const, style: "normal" as const },
      { name: "Pretendard", data: bold, weight: 700 as const, style: "normal" as const },
      { name: "Barlow", data: num, weight: 700 as const, style: "normal" as const },
    ])
    .catch((err) => {
      fontsPromise = null;
      throw err;
    });
  return fontsPromise;
}

function clean(value: string | null, max: number): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const teamId = (q.get("team") ?? "").toLowerCase();
  const oppId = (q.get("opp") ?? "").toLowerCase();
  const my = Number.parseInt(q.get("my") ?? "", 10);
  const op = Number.parseInt(q.get("op") ?? "", 10);
  const team = findTeam(teamId);
  const opp = findTeam(oppId);
  if (team.id !== teamId || opp.id !== oppId || !Number.isFinite(my) || !Number.isFinite(op)) {
    return new Response("bad params", { status: 400 });
  }
  const club = getClubTheme(teamId);
  const round = clean(q.get("round"), 20) || "오늘 경기";
  const date = clean(q.get("date"), 20);
  const venue = clean(q.get("venue"), 16);
  const outcome = my > op ? "승" : my < op ? "패" : "무";
  const fonts = await loadFonts();
  const bg = "#0B0B0C";

  return new ImageResponse(
    (
      <div style={{ width: 1080, height: 1920, display: "flex", flexDirection: "column", alignItems: "center", background: bg, fontFamily: "Pretendard", color: "#fff" }}>
        <div style={{ marginTop: 330, display: "flex", fontSize: 40, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>
          {[date, venue].filter(Boolean).join(" · ")}
        </div>

        {/* 티켓 위쪽 */}
        <div style={{ marginTop: 60, width: 900, display: "flex", flexDirection: "column", background: club.field, color: club.onField, borderTopLeftRadius: 44, borderTopRightRadius: 44, padding: "48px 56px 56px" }}>
          <div style={{ display: "flex", fontSize: 38, fontWeight: 700, opacity: 0.9 }}>{round}</div>
          <div style={{ marginTop: 70, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontSize: 150, fontWeight: 900, letterSpacing: -4 }}>{team.short}</div>
            <div style={{ display: "flex", fontSize: 44, fontWeight: 700, opacity: 0.7 }}>vs</div>
            <div style={{ display: "flex", fontSize: 150, fontWeight: 900, letterSpacing: -4, opacity: 0.75 }}>{opp.short}</div>
          </div>
        </div>

        {/* 절취선 */}
        <div style={{ width: 900, height: 0, display: "flex", position: "relative" }}>
          <div style={{ position: "absolute", left: -28, top: -28, width: 56, height: 56, borderRadius: 28, background: bg }} />
          <div style={{ position: "absolute", right: -28, top: -28, width: 56, height: 56, borderRadius: 28, background: bg }} />
          <div style={{ position: "absolute", left: 40, right: 40, top: -2, borderTop: "5px dashed rgba(255,255,255,0.55)" }} />
        </div>

        {/* 찢긴 반쪽 — 점수와 도장 */}
        <div style={{ width: 900, display: "flex", alignItems: "center", justifyContent: "space-between", background: club.stub, color: club.onField, borderBottomLeftRadius: 44, borderBottomRightRadius: 44, padding: "56px 56px 64px", transform: "translateY(22px) rotate(-1.5deg)" }}>
          <div style={{ display: "flex", alignItems: "baseline", fontFamily: "Barlow", fontWeight: 700 }}>
            <span style={{ fontSize: 260, lineHeight: 1 }}>{my}</span>
            <span style={{ fontSize: 140, margin: "0 28px", opacity: 0.6 }}>:</span>
            <span style={{ fontSize: 260, lineHeight: 1, opacity: 0.75 }}>{op}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 200, height: 200, border: `10px solid ${club.onField}`, borderRadius: 34, fontSize: 120, fontWeight: 900, transform: "rotate(-8deg)" }}>
            {outcome}
          </div>
        </div>

        <div style={{ marginTop: "auto", marginBottom: 150, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 72, fontWeight: 900, letterSpacing: 6 }}>GROUND</div>
          <div style={{ marginTop: 16, display: "flex", fontSize: 36, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>내 팀을 위한 극단적 편파 알림</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, fonts, headers: { "Cache-Control": "public, max-age=86400, immutable" } }
  );
}
