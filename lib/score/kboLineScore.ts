import { naverToKboGameId } from "@/lib/kboOfficial";
import type { ScoringEvent } from "@/app/api/kbo/scoring/[gameId]/route";

/**
 * 이닝별 득점 — KBO 공식 게임센터 스코어보드(GetScoreBoardScroll) + 박스스코어 기타 기록(홈런·결승타).
 *
 * 예전엔 네이버 문자중계(inningScore)를 썼는데, 네이버가 Vercel 서버 요청을 막아 운영에서
 * 6초 기다린 끝에 빈 목록이었다 (2026-11-25 확인). KBO 공식은 서버에서도 열린다.
 * 실패하면 null — 호출하는 쪽이 예전 경로로 넘어간다.
 */

const BASE = "https://www.koreabaseball.com/ws/Schedule.asmx";
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "x-requested-with": "XMLHttpRequest",
  referer: "https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
};

type Cell = { Text?: string | null };
type Table = { rows?: Array<{ row?: Cell[] }> };

function text(html: string | null | undefined): string {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function rows(raw: unknown): string[][] {
  const table = (typeof raw === "string" ? JSON.parse(raw) : raw ?? {}) as Table;
  return (table.rows ?? []).map((r) => (r.row ?? []).map((c) => text(c.Text)));
}

async function post(method: string, body: string, timeoutMs: number): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/${method}`, { method: "POST", headers: HEADERS, body, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`kbo ${method} HTTP ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** "고명준10호(5회3점 조상우) 김도영3호(7회2점 …)" → [{ name, inning, runs }] */
function parseHomeRuns(line: string): Array<{ name: string; inning: number; runs: number }> {
  const out: Array<{ name: string; inning: number; runs: number }> = [];
  for (const m of line.matchAll(/([가-힣A-Za-z]+)\d+호\((\d+)회(\d)점/g)) {
    out.push({ name: m[1]!, inning: Number(m[2]), runs: Number(m[3]) });
  }
  return out;
}

export async function fetchKboScoringEvents(naverGameId: string, homeId: string, awayId: string): Promise<ScoringEvent[] | null> {
  const ids = naverToKboGameId(naverGameId);
  if (!ids || !homeId || !awayId) return null;
  const body = `leId=1&srId=${ids.seriesId}&seasonId=${ids.season}&gameId=${ids.kboGameId}`;
  const [board, box] = await Promise.all([
    post("GetScoreBoardScroll", body, 4000),
    post("GetBoxScoreScroll", body, 4000).catch(() => null),
  ]);
  const lines = rows(board.table2);
  if (lines.length < 2) return null;
  const [awayLine, homeLine] = lines as [string[], string[]];

  const etc = box ? rows(box.tableEtc) : [];
  const etcValue = (label: string) => etc.find((r) => r[0] === label)?.[1] ?? "";
  const homeRuns = parseHomeRuns(etcValue("홈런"));
  const winningHit = etcValue("결승타"); // "고명준(5회 2사 2,3루서 좌월 홈런)"

  const events: ScoringEvent[] = [];
  let awayScore = 0;
  let homeScore = 0;
  const innings = Math.max(awayLine.length, homeLine.length);
  for (let i = 0; i < innings; i++) {
    for (const half of ["top", "bottom"] as const) {
      const runs = Number.parseInt((half === "top" ? awayLine : homeLine)[i] ?? "", 10);
      if (!Number.isFinite(runs) || runs <= 0) continue;
      const inning = i + 1;
      if (half === "top") awayScore += runs;
      else homeScore += runs;
      const hrs = homeRuns.filter((h) => h.inning === inning);
      const winner = winningHit.match(/^([가-힣A-Za-z]+)\((\d+)회/);
      const details = [
        ...hrs.map((h) => ({ player: h.name, description: `${h.name} ${h.runs === 4 ? "만루" : `${h.runs}점`} 홈런`, runs: h.runs })),
        ...(winner && Number(winner[2]) === inning && !hrs.some((h) => h.name === winner[1])
          ? [{ player: winner[1]!, description: `${winner[1]} 결승타`, runs: null }]
          : []),
      ];
      events.push({
        inning,
        half,
        teamId: half === "top" ? awayId : homeId,
        runs,
        description: details[0]?.description ?? `${runs}점`,
        player: details[0]?.player ?? null,
        details,
        awayScore,
        homeScore,
      });
    }
  }
  return events;
}
