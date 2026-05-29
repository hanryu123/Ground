/**
 * GET /api/kbo/scoring/[gameId]?homeId=nc&awayId=hanwha
 *
 * Naver 릴레이 텍스트를 파싱해 득점 이벤트 목록을 반환.
 * 경기 종료 후 스케줄 탭의 "득점 정보" 패널에서 사용.
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
  /** 이 플레이에서 득점 수 */
  runs: number;
  /** "투런 홈런", "2타점 2루타", "희생플라이" 등 */
  description: string;
  /** 타자/주자 이름 (파싱 실패 시 null) */
  player: string | null;
  /** 이 플레이 이후 누적 스코어 */
  awayScore: number;
  homeScore: number;
};

// ─── 파싱 헬퍼 ────────────────────────────────────────────────────────────────

function readNum(obj: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

/** 릴레이 title이 득점 플레이인지 판정 */
function isScoringPlay(title: string): boolean {
  return /홈런|\d+\s*타점|희생플라이|적시타/.test(title);
}

/** title에서 득점 수 추출 */
function extractRuns(title: string): number {
  if (/만루\s*홈런/.test(title)) return 4;
  if (/쓰리런/.test(title)) return 3;
  if (/투런/.test(title)) return 2;
  if (/솔로\s*홈런/.test(title)) return 1;
  if (/홈런/.test(title)) return 1;
  const m = title.match(/(\d+)\s*타점/);
  if (m) return Math.max(1, parseInt(m[1], 10));
  return 1;
}

/** title에서 UI에 표시할 간결한 설명 추출 */
function extractDescription(title: string): string {
  const clean = title.replace(/\s*\(\d+호\)\s*/g, "").trim();

  if (/만루\s*홈런/.test(clean)) return "만루 홈런";
  if (/쓰리런/.test(clean)) return "쓰리런 홈런";
  if (/투런/.test(clean)) return "투런 홈런";
  if (/솔로\s*홈런/.test(clean)) return "솔로 홈런";
  if (/홈런/.test(clean)) return "홈런";

  // "N타점 X루타/안타"
  const rbiHit = clean.match(/(\d+)\s*타점\s*([23]루타|안타)/);
  if (rbiHit) return `${rbiHit[1]}타점 ${rbiHit[2]}`;

  if (/희생플라이/.test(clean)) return "희생플라이";

  const rbi = clean.match(/(\d+)\s*타점/);
  if (rbi) {
    const hitType = clean.match(/([23]루타|안타|적시타)/)?.[1];
    return hitType ? `${rbi[1]}타점 ${hitType}` : `${rbi[1]}타점`;
  }
  if (/적시타/.test(clean)) return "적시타";

  // 마지막 1~2 단어만 남겨 간결하게
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(-2).join(" ");
  return clean.slice(0, 18) || "득점";
}

/** title 앞 2~4자 한글 이름 추출 */
function extractPlayer(title: string): string | null {
  const m = title.trim().match(/^([가-힣]{2,4})\s/);
  if (!m) return null;
  const STOP = new Set([
    "안타", "홈런", "투수", "타자", "볼넷", "삼진", "아웃",
    "희생", "적시", "만루", "솔로", "투런", "쓰리런", "폭투", "보크",
  ]);
  return STOP.has(m[1]) ? null : m[1];
}

// ─── relay 배열 추출 (live-events 와 동일한 다중 fallback) ──────────────────

function extractRelayEntries(json: Record<string, unknown>): Record<string, unknown>[] {
  const result = json["result"] as Record<string, unknown> | undefined;
  const trd = result?.["textRelayData"];

  // 1순위: result.textRelayData.textRelays
  if (trd && typeof trd === "object" && !Array.isArray(trd)) {
    const textRelays = (trd as Record<string, unknown>)["textRelays"];
    if (Array.isArray(textRelays) && textRelays.length > 0)
      return textRelays as Record<string, unknown>[];
    // textRelayData 안 다른 배열 키
    for (const v of Object.values(trd as object)) {
      if (Array.isArray(v) && v.length > 0)
        return v as Record<string, unknown>[];
    }
  }
  if (Array.isArray(trd) && trd.length > 0)
    return trd as Record<string, unknown>[];

  // 2순위: 여러 레거시 경로
  const candidates: unknown[] = [
    json["relayTexts"],
    result?.["relayTexts"],
    (json["relay"] as Record<string, unknown> | undefined)?.["relayTexts"],
    result?.["relay"] && (result["relay"] as Record<string, unknown>)?.["relayTexts"],
    json["texts"],
    result?.["texts"],
    result?.["relay"],
    json["relay"],
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0)
      return c as Record<string, unknown>[];
  }
  return [];
}

// ─── currentGameState 에서 점수 읽기 (Naver 여러 필드명 시도) ─────────────────

function readGameStateScores(
  e: Record<string, unknown>
): { home: number; away: number } | null {
  // textOptions[0].currentGameState (primary)
  const textOptions = Array.isArray(e["textOptions"])
    ? (e["textOptions"] as Record<string, unknown>[])
    : [];
  const gs = (textOptions[0]?.["currentGameState"] as Record<string, unknown> | undefined) ?? {};

  // 최상단에 직접 노출되는 경우도 시도
  const directState = (e["currentGameState"] as Record<string, unknown> | undefined) ?? {};

  for (const state of [gs, directState, e]) {
    const home = readNum(
      state,
      "homeTeamScore", "homeScore", "hScore", "home", "homeRunsScored",
    );
    const away = readNum(
      state,
      "awayTeamScore", "awayScore", "aScore", "away", "awayRunsScored",
    );
    if (home !== null && away !== null) return { home, away };
  }
  return null;
}

// ─── 릴레이 파싱 ──────────────────────────────────────────────────────────────

async function fetchScoringEvents(
  gameId: string,
  homeId: string,
  awayId: string,
): Promise<ScoringEvent[]> {
  // live-events 와 동일하게 여러 엔드포인트 순차 시도
  const endpoints = [
    `${NAVER_BASE}/schedule/games/${gameId}/relay`,
    `${NAVER_BASE}/schedule/games/${gameId}/relay?fields=relayTexts`,
    `${NAVER_BASE}/schedule/games/${gameId}?fields=relay`,
    `${NAVER_BASE}/schedule/games/${gameId}/relayTexts`,
    `${NAVER_BASE}/schedule/games/${gameId}/liveText`,
    `${NAVER_BASE}/schedule/games/${gameId}/relay?size=200`,
  ];

  let textRelays: Record<string, unknown>[] = [];

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(endpoint, {
        headers: {
          "user-agent": UA,
          accept: "application/json",
          referer: "https://m.sports.naver.com/",
          "accept-language": "ko-KR,ko;q=0.9",
        },
        // no-store: 종료 경기지만 처음 파싱 시에는 신선하게 받고,
        // Route 레벨 Cache-Control 헤더로 CDN/브라우저 캐시를 제어한다.
        cache: "no-store",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        console.log(`[scoring] ${gameId} ${endpoint.split(gameId)[1]} → ${res.status}`);
        continue;
      }

      const json = (await res.json()) as Record<string, unknown>;
      const entries = extractRelayEntries(json);

      console.log(`[scoring] ${gameId} entries=${entries.length} via ${endpoint.split(gameId)[1]}`);

      if (entries.length > 0) {
        textRelays = entries;
        break;
      }
    } catch (err) {
      console.log(`[scoring] ${gameId} fetch error:`, err);
    }
  }

  if (textRelays.length === 0) {
    console.log(`[scoring] ${gameId} no relay entries found across all endpoints`);
    return [];
  }

  const events: ScoringEvent[] = [];
  let awayScore = 0;
  let homeScore = 0;

  for (const e of textRelays) {
    const inn = readNum(e, "inn", "inning", "inningCount", "currentInning") ?? 0;
    if (!inn) continue;

    const sub =
      e["inningSub"] ??
      e["inningDiv"] ??
      e["half"] ??
      e["currentInningSub"];
    const isTop = sub === 1 || sub === "1" || sub === "top"; // 초: 원정팀 공격
    const isBot = sub === 2 || sub === "2" || sub === "bottom"; // 말: 홈팀 공격
    if (!isTop && !isBot) continue;

    const title =
      (e["title"] as string | undefined) ??
      (e["playText"] as string | undefined) ??
      (e["text"] as string | undefined) ??
      "";

    // 1순위: currentGameState에서 점수 직접 추출
    const scores = readGameStateScores(e);
    if (scores !== null && (scores.home !== homeScore || scores.away !== awayScore)) {
      const dHome = scores.home - homeScore;
      const dAway = scores.away - awayScore;
      if (dHome > 0 || dAway > 0) {
        const scoringTeam = dHome > 0 ? homeId : awayId;
        const runs = dHome > 0 ? dHome : dAway;
        events.push({
          inning: inn,
          half: isTop ? "top" : "bottom",
          teamId: scoringTeam,
          runs,
          description: extractDescription(title) || `${runs}점`,
          player: extractPlayer(title),
          awayScore: scores.away,
          homeScore: scores.home,
        });
        homeScore = scores.home;
        awayScore = scores.away;
      }
      continue;
    }

    // 2순위: title 텍스트 기반 득점 감지
    if (title && isScoringPlay(title)) {
      const runs = extractRuns(title);
      const scoringTeam = isTop ? awayId : homeId;
      if (isTop) awayScore += runs;
      else homeScore += runs;
      events.push({
        inning: inn,
        half: isTop ? "top" : "bottom",
        teamId: scoringTeam,
        runs,
        description: extractDescription(title),
        player: extractPlayer(title),
        awayScore,
        homeScore,
      });
    }
  }

  return events;
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
        // 종료된 경기는 데이터가 바뀌지 않음 — 1시간 캐시
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    },
  );
}
