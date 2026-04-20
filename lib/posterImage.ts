/**
 * 정적 화보 경로 빌더 (Zero Latency)
 *
 * 실시간 생성 없음. 디스크에 떨어진 정적 파일을 0초 지연으로 렌더링한다.
 *
 * ── 우선순위 규칙 ──────────────────────────────────────────────
 *
 *   [기본 — 시간대/승패 무관]
 *     1순위  /images/refs/ready/${teamId}.{jpg|jpeg|png|webp}
 *            (대/소문자 변형 자동 시도. 팀 전용 화보가 떨어져 있으면 무조건 이것.)
 *     2순위  /images/refs/ready/ 안의 공통 풀에서 teamId 해시로 결정론적 1장
 *            (팀 전용 파일이 아직 없을 때 — 팀마다 항상 같은 컷이 매칭되어
 *             모든 팀이 같은 배경으로 떨어지는 사고를 막는다.)
 *
 *   [밤 10시 ~ 익일 06시 + 해당 팀이 이긴 경우 ONLY]
 *     1순위  /images/refs/victory/{Winning.jpg | winning2.jpg | Winning3.jpg} 중 1장
 *            (파일명 대/소문자 엄수, teamId+date 시드로 결정론적 픽)
 *     2순위  위 ready 풀 폴백
 *
 *   ⚠ /images/refs/posters/night.png 는 어떤 경로에서도 사용하지 않는다.
 * ──────────────────────────────────────────────────────────────
 *
 * 클라이언트는 onError로 다음 후보로 자동 폴백한다 (HeroCard 참조).
 */

import type { TodaySlot } from "@/lib/useTodaySlot";

const READY_BASE = "/images/refs/ready";
const VICTORY_BASE = "/images/refs/victory";

/** ready/ 안의 공통 풀 — 팀 전용 파일이 없을 때 해시 분배용. 모두 실재 파일. */
const READY_POOL = [
  `${READY_BASE}/hitter.jpg`,
  `${READY_BASE}/hitting.jpg`,
  `${READY_BASE}/catch.jpg`,
  `${READY_BASE}/sunset.jpg`,
  `${READY_BASE}/sunset2.jpg`,
] as const;

/** 절대 안 깨지는 최종 안전망 (위 풀 첫 장과 동일하게 유지). night.png 안 씀. */
export const POSTER_FINAL_FALLBACK = READY_POOL[0];

/** Night + 승리 시 풀 (파일명 대/소문자 엄수) */
const VICTORY_POOL = [
  `${VICTORY_BASE}/Winning.jpg`,
  `${VICTORY_BASE}/winning2.jpg`,
  `${VICTORY_BASE}/Winning3.jpg`,
] as const;

/** ready/ 안에서 팀 전용 파일을 찾을 때 시도할 확장자 우선순위 */
const READY_EXTS = ["jpg", "jpeg", "png", "webp"] as const;

/** djb2 — 같은 시드는 항상 같은 인덱스 → 팀별/날짜별 결정론적 픽 */
function djb2(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** (teamId, dateKey) 시드로 Victory 풀에서 1장 선택 */
export function pickVictoryImage(teamId: string, dateKey: string): string {
  const idx = djb2(`${teamId.toLowerCase()}|${dateKey}`) % VICTORY_POOL.length;
  return VICTORY_POOL[idx];
}

/** teamId 해시로 ready 공통 풀에서 1장 선택 (팀마다 항상 같은 컷) */
function pickReadyFromPool(teamId: string): string {
  const seed = teamId ? teamId.toLowerCase() : "default";
  const idx = djb2(`ready|${seed}`) % READY_POOL.length;
  return READY_POOL[idx];
}

/**
 * /images/refs/ready/ 안에서 teamId 매칭 후보 경로 체인.
 *   - lowercase, Capitalize, UPPERCASE 세 가지 케이스 변형
 *   - 각 케이스마다 jpg → jpeg → png → webp 순으로 시도
 * 첫 매칭이 200을 반환하면 거기서 종료.
 *
 * 지금은 실 파일이 없어 모두 404로 떨어지지만,
 * 나중에 `/images/refs/ready/lg.jpg` 같은 식으로 떨궈 두면 자동으로 1순위가 된다.
 */
function readyCandidatesByTeamId(teamId: string): string[] {
  const lower = teamId.trim().toLowerCase();
  if (!lower) return [];
  const cap = lower.charAt(0).toUpperCase() + lower.slice(1);
  const upper = lower.toUpperCase();

  const bases: string[] = [];
  const seen = new Set<string>();
  for (const b of [lower, cap, upper]) {
    if (!seen.has(b)) {
      seen.add(b);
      bases.push(b);
    }
  }

  const out: string[] = [];
  for (const b of bases) {
    for (const ext of READY_EXTS) {
      out.push(`${READY_BASE}/${b}.${ext}`);
    }
  }
  return out;
}

export type PosterContext = {
  teamId: string;
  slot: TodaySlot;
  isWinner: boolean;
  /** YYYY-MM-DD — Victory 풀의 결정론적 픽 시드 */
  dateKey: string;
};

/**
 * 우선순위 순서대로 시도할 후보 경로 체인.
 * 클라이언트는 onError로 다음 후보로 넘어가면 된다.
 *
 * 마지막 후보는 항상 ready 풀 폴백 — 팀별로 이미 다른 컷이 매칭되어 있어
 * "모든 팀이 같은 배경" 사고가 구조적으로 발생하지 않는다.
 */
export function posterCandidates(ctx: PosterContext): string[] {
  const id = ctx.teamId.trim().toLowerCase();
  const poolPick = pickReadyFromPool(id);

  // 밤 10시 이후 + 이긴 팀 → Victory 우선, 그래도 안 되면 ready 풀 폴백
  if (ctx.slot === "night" && ctx.isWinner) {
    const victory = pickVictoryImage(id, ctx.dateKey);
    return [victory, poolPick];
  }

  // 그 외 모든 케이스 (아침/낮 + 밤 10시 이후 패배·무·미경기 포함)
  // → 팀 전용 ready 파일을 먼저 시도하고, 없으면 ready 풀 폴백
  return [...readyCandidatesByTeamId(id), poolPick];
}
