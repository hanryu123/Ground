/**
 * GET /api/kbo/scoring/[gameId]?homeId=lg&awayId=kia
 *
 * Naver relay API의 inningScore 필드를 파싱해 이닝별 득점 이벤트를 반환.
 * 경기 종료 후 스케줄 탭의 "득점 정보" 패널에서 사용.
 *
 * 데이터 소스: result.textRelayData.inningScore
 *   { home: { "1": "5", "2": "0", ... }, away: { "1": "0", ... } }
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

const NAVER_BASE = "https://api-gw.sports.naver.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 GroundBot/1.0";

export type ScoringEvent = {
  inning: number;
  /** top=초=원정팀 공격, bottom=말=홈팀 공격 */
  half: "top" | "bottom";
  /** 득점한 팀 ID */
  teamId: string;
  /** 이 이닝에서 득점 수 */
  runs: number;
  /** UI 표시용 설명 */
  description: string;
  /** 타자/주자 이름 (relay 텍스트에서 보강, 없으면 null) */
  player: string | null;
  /** relay 텍스트에서 잡은 개별 득점 장면들 */
  details?: ScoringDetail[];
  /** 이 이닝 종료 후 누적 스코어 */
  awayScore: number;
  homeScore: number;
};

export type ScoringDetail = {
  player: string | null;
  description: string;
  runs: number | null;
};

// ─── inningScore 파싱 ─────────────────────────────────────────────────────────

function parseRuns(val: unknown): number {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const n = parseInt(val, 10);
    if (!Number.isNaN(n)) return n;
  }
  return 0; // "-", "x", "" → 0
}

function buildScoringEvents(
  inningScore: { home: Record<string, unknown>; away: Record<string, unknown> },
  homeId: string,
  awayId: string,
): ScoringEvent[] {
  const homeMap = inningScore.home ?? {};
  const awayMap = inningScore.away ?? {};
  const allInnings = Array.from(
    new Set([...Object.keys(homeMap), ...Object.keys(awayMap)]),
  )
    .map(Number)
    .filter((n) => !Number.isNaN(n) && n > 0)
    .sort((a, b) => a - b);

  const events: ScoringEvent[] = [];
  let homeScore = 0;
  let awayScore = 0;

  for (const inn of allInnings) {
    const awayRuns = parseRuns(awayMap[String(inn)]);
    const homeRuns = parseRuns(homeMap[String(inn)]);

    // 초 먼저 (원정팀 공격)
    if (awayRuns > 0) {
      awayScore += awayRuns;
      events.push({
        inning: inn,
        half: "top",
        teamId: awayId,
        runs: awayRuns,
        description: `${awayRuns}점`,
        player: null,
        awayScore,
        homeScore,
      });
    }

    // 말 (홈팀 공격)
    if (homeRuns > 0) {
      homeScore += homeRuns;
      events.push({
        inning: inn,
        half: "bottom",
        teamId: homeId,
        runs: homeRuns,
        description: `${homeRuns}점`,
        player: null,
        awayScore,
        homeScore,
      });
    }
  }

  return events;
}

// ─── Relay 텍스트로 설명 보강 ─────────────────────────────────────────────────
// inningScore로 이미 정확한 득점은 잡혔으므로, 텍스트 relay는 설명 문구만 보강.

function normalizeRelayTitle(title: string): string {
  return title
    .replace(/\s*\(\d+호\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPlayer(title: string): string | null {
  const m = title.trim().match(/^([가-힣]{2,4})\s/);
  if (!m) return null;
  const STOP = new Set([
    "안타", "홈런", "투수", "타자", "볼넷", "삼진", "아웃",
    "희생", "적시", "만루", "솔로", "투런", "쓰리런", "폭투", "보크",
    "득점", "실책", "포일", "주자",
  ]);
  return STOP.has(m[1]) ? null : m[1];
}

function isScoringPlay(title: string): boolean {
  return /홈런|\d+\s*타점|희생플라이|희생\s*플라이|적시타|밀어내기|폭투|보크|포일|실책|득점|홈인/.test(title);
}

function extractRunsFromTitle(title: string): number | null {
  if (/만루\s*홈런|그랜드\s*슬램/.test(title)) return 4;
  if (/쓰리런|3\s*점\s*홈런|3점포/.test(title)) return 3;
  if (/투런|2\s*점\s*홈런|2점포/.test(title)) return 2;
  if (/솔로|1\s*점\s*홈런|1점포/.test(title)) return 1;
  const rbi = title.match(/(\d+)\s*타점/);
  if (rbi) return parseInt(rbi[1], 10);
  if (/희생플라이|희생\s*플라이|밀어내기|폭투|보크|포일|득점|홈인/.test(title)) return 1;
  return null;
}

function extractDescription(title: string): string {
  const clean = normalizeRelayTitle(title);
  if (/만루\s*홈런|그랜드\s*슬램/.test(clean)) return "만루 홈런";
  if (/쓰리런|3\s*점\s*홈런|3점포/.test(clean)) return "쓰리런 홈런";
  if (/투런|2\s*점\s*홈런|2점포/.test(clean)) return "투런 홈런";
  if (/솔로|1\s*점\s*홈런|1점포/.test(clean)) return "솔로 홈런";
  if (/홈런/.test(clean)) return "홈런";
  const rbiHit = clean.match(/(\d+)\s*타점\s*([23]루타|안타|적시타)/);
  if (rbiHit) return `${rbiHit[1]}타점 ${rbiHit[2]}`;
  if (/희생플라이|희생\s*플라이/.test(clean)) return "희생플라이";
  if (/밀어내기/.test(clean)) return "밀어내기";
  if (/폭투/.test(clean)) return "폭투로 득점";
  if (/보크/.test(clean)) return "보크로 득점";
  if (/포일/.test(clean)) return "포일로 득점";
  if (/실책/.test(clean)) return "실책으로 득점";
  const rbi = clean.match(/(\d+)\s*타점/);
  if (rbi) {
    const hitType = clean.match(/([23]루타|안타|적시타)/)?.[1];
    return hitType ? `${rbi[1]}타점 ${hitType}` : `${rbi[1]}타점`;
  }
  if (/적시타/.test(clean)) return "적시타";
  if (/득점|홈인/.test(clean)) return "득점";
  return "";
}

function extractScoringDetail(title: string): ScoringDetail | null {
  const clean = normalizeRelayTitle(title);
  if (!isScoringPlay(clean)) return null;
  const description = extractDescription(clean);
  const player = extractPlayer(clean);
  if (!description && !player) return null;
  return {
    player,
    description: description || "득점",
    runs: extractRunsFromTitle(clean),
  };
}

function readRelayTitle(relay: Record<string, unknown>): string {
  const parts: string[] = [];
  const direct = relay["title"] ?? relay["text"] ?? relay["playText"];
  if (typeof direct === "string" && direct.trim()) parts.push(direct);
  const textOptions = relay["textOptions"];
  if (Array.isArray(textOptions)) {
    parts.push(...textOptions
      .map((item) => {
        if (!item || typeof item !== "object") return "";
        const obj = item as Record<string, unknown>;
        return obj["title"] ?? obj["text"] ?? obj["playText"] ?? "";
      })
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0));
  }
  return parts.join(" ");
}

function parseRelayHalf(relay: Record<string, unknown>): "top" | "bottom" {
  const raw = relay["homeOrAway"] ?? relay["inningSub"];
  return raw === 1 || raw === "1" ? "top" : "bottom";
}

// ─── Naver relay fetch ─────────────────────────────────────────────────────────

async function fetchScoringEvents(
  gameId: string,
  homeId: string,
  awayId: string,
): Promise<ScoringEvent[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(`${NAVER_BASE}/schedule/games/${gameId}/relay`, {
      headers: {
        "user-agent": UA,
        accept: "application/json",
        referer: "https://m.sports.naver.com/",
        "accept-language": "ko-KR,ko;q=0.9",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!res.ok) {
      console.log(`[scoring] ${gameId} relay → ${res.status}`);
      return [];
    }

    const json = (await res.json()) as Record<string, unknown>;
    const trd = (
      (json["result"] as Record<string, unknown> | undefined)
        ?.["textRelayData"] as Record<string, unknown> | undefined
    ) ?? {};

    // ── 1순위: inningScore (정확한 이닝별 득점) ─────────────────────────────
    const inningScore = trd["inningScore"] as
      | { home: Record<string, unknown>; away: Record<string, unknown> }
      | undefined;

    if (
      inningScore &&
      typeof inningScore === "object" &&
      inningScore.home &&
      inningScore.away
    ) {
      const events = buildScoringEvents(inningScore, homeId, awayId);
      console.log(`[scoring] ${gameId} inningScore → ${events.length} events`);

      // ── 2순위: textRelays로 description/player 보강 ──────────────────────
      const relays = Array.isArray(trd["textRelays"])
        ? (trd["textRelays"] as Record<string, unknown>[])
        : [];

      // {inning}_{half} → 개별 득점 장면들
      const enrichMap = new Map<string, ScoringDetail[]>();
      const seenDetail = new Set<string>();
      for (const relay of relays) {
        const inn = parseInt(String(relay["inn"] ?? 0), 10);
        if (!inn) continue;

        const half = parseRelayHalf(relay);
        const title = readRelayTitle(relay);
        const detail = extractScoringDetail(title);
        if (!detail) continue;

        const key = `${inn}_${half}`;
        const dedupeKey = `${key}:${detail.player ?? ""}:${detail.description}:${detail.runs ?? ""}`;
        if (seenDetail.has(dedupeKey)) continue;
        seenDetail.add(dedupeKey);
        const list = enrichMap.get(key) ?? [];
        list.push(detail);
        enrichMap.set(key, list);
      }

      return events.map((ev) => {
        const key = `${ev.inning}_${ev.half}`;
        const details = enrichMap.get(key) ?? [];
        if (details.length === 0) return ev;
        const first = details[0];
        const totalDetailRuns = details.reduce((sum, detail) => sum + (detail.runs ?? 0), 0);
        const detailSummary = details
          .slice(0, 2)
          .map((detail) => `${detail.player ? `${detail.player} ` : ""}${detail.description}`)
          .join(", ");
        const singleDetailDescription =
          first.runs == null || first.runs === ev.runs
            ? first.description
            : `${ev.runs}점 · ${first.description} 포함`;
        return {
          ...ev,
          description:
            details.length === 1
              ? singleDetailDescription
              : `${ev.runs}점 · ${detailSummary}${details.length > 2 ? " 외" : ""}`,
          player: details.length === 1 ? first.player : null,
          details: totalDetailRuns > 0 || details.some((detail) => detail.player)
            ? details
            : undefined,
        };
      });
    }

    console.log(`[scoring] ${gameId} inningScore not found`);
    return [];
  } catch (err) {
    console.log(`[scoring] ${gameId} error:`, err);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;
  const url = new URL(req.url);
  const homeId = url.searchParams.get("homeId") ?? "";
  const awayId = url.searchParams.get("awayId") ?? "";

  const events = await fetchScoringEvents(gameId, homeId, awayId);

  return NextResponse.json(
    { events },
    {
      headers: {
        // 종료 경기: 데이터 불변 → 1시간 CDN 캐시
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    },
  );
}
