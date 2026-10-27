import { findTeam } from "@/lib/teams";
import type { LiveScoreGame } from "@/lib/score/types";
import type { ScoringHitKind, ScoringPlayContext, ScoringResultType, ScoringSide } from "@/lib/score/playByPlay";

/**
 * 득점 장면(누가·무엇을 쳐서·몇 타점) — 다음 스포츠 문자중계에서 찾는다.
 *
 * KBO 공식 박스스코어는 경기가 끝나야 열려서(2026-10-27 확인) 경기 중 선수 이름은 여기서 받는다.
 * 문자중계 한 줄의 textstyle: 8 타석 시작, 13 타석 결과, 23 득점이 난 타석 결과, 24 주자 진루·홈인.
 *
 *  - 그 팀이 지금까지 낸 득점(홈인)을 세어 점수와 맞을 때만 쓴다 — 중계가 아직 안 따라왔으면 null.
 *  - 이번에 늘어난 점수만큼 끝에서부터 득점을 보고, 가장 많이 들어온 타석(같으면 나중 것)을 고른다.
 *  - 폭투·포일처럼 타자가 없는 득점이거나 확신이 없으면 null — 호출하는 쪽은 점수만으로 보낸다.
 */

const DAUM_API = "https://sports.daum.net/api/arms";
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  referer: "https://sports.daum.net/schedule/kbo",
};

type LiveLine = { period?: string; batter?: string; textstyle?: number; text?: string };

/** 네이버 경기 ID → 다음 경기 ID (다음 일정의 cpGameId 가 "55551027HTSS0|2026" 형태) */
const daumIdCache = new Map<string, number>();

async function resolveDaumGameId(naverGameId: string, timeoutMs: number): Promise<number | null> {
  const cached = daumIdCache.get(naverGameId);
  if (cached) return cached;
  const m = /^\d{4}(\d{4})[A-Z]{4}\d(\d{4})$/.exec(naverGameId);
  if (!m) return null;
  const date = `${m[2]}${m[1]}`;
  const res = await fetch(
    `${DAUM_API}/SPORTS_SCHEDULE?leagueCode=kbo&fromDate=${date}&toDate=${date}&seasonKey=${m[2]}`,
    { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as { document?: { schedule?: Record<string, Array<{ gameId?: number; cpGameId?: string }>> } };
  for (const games of Object.values(json.document?.schedule ?? {})) {
    for (const g of games) {
      if (g.gameId && g.cpGameId) daumIdCache.set(g.cpGameId.replace("|", ""), g.gameId);
    }
  }
  return daumIdCache.get(naverGameId) ?? null;
}

async function fetchLiveText(daumGameId: number, timeoutMs: number): Promise<LiveLine[] | null> {
  const res = await fetch(`${DAUM_API}/SPORTS_GAME?gameId=${daumGameId}&detail=liveData`, {
    headers: HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { document?: { game?: { liveData?: { liveText?: LiveLine[] } }; liveData?: { liveText?: LiveLine[] } } };
  const doc = json.document;
  const lines = doc?.game?.liveData?.liveText ?? doc?.liveData?.liveText;
  return Array.isArray(lines) ? lines : null;
}

type Outcome = { resultType: ScoringResultType; hitKind: ScoringHitKind; label: string };

/** "좌익수 왼쪽 2루타", "우중간 뒤 홈런 (홈런거리:120M)", "중견수 희생플라이 아웃" … → 결과 */
function parseOutcome(result: string): Outcome | null {
  if (/홈런/.test(result)) return { resultType: "HOME_RUN", hitKind: "HR", label: "홈런" };
  if (/3루타/.test(result)) return { resultType: "HIT", hitKind: "3B", label: "3루타" };
  if (/2루타/.test(result)) return { resultType: "HIT", hitKind: "2B", label: "2루타" };
  if (/내야안타/.test(result)) return { resultType: "HIT", hitKind: "1B", label: "내야 안타" };
  if (/1루타|안타/.test(result)) return { resultType: "HIT", hitKind: "1B", label: "적시타" };
  if (/희생플라이/.test(result)) return { resultType: "SACRIFICE", hitKind: null, label: "희생플라이" };
  if (/희생번트/.test(result)) return { resultType: "SACRIFICE", hitKind: null, label: "희생번트" };
  if (/볼넷|고의4구/.test(result)) return { resultType: "WALK", hitKind: null, label: "밀어내기 볼넷" };
  if (/몸에 맞는|사구/.test(result)) return { resultType: "HBP", hitKind: null, label: "밀어내기 몸에 맞는 공" };
  if (/실책/.test(result)) return { resultType: "ERROR", hitKind: null, label: "상대 실책" };
  if (/야수선택/.test(result)) return { resultType: "FIELDERS_CHOICE", hitKind: null, label: "야수선택" };
  if (/땅볼/.test(result)) return { resultType: "FIELDERS_CHOICE", hitKind: null, label: "땅볼 타점" };
  return null;
}

/** 한 팀의 득점 — 어느 타석(23번 줄)에서 들어왔는지와 함께. 타석 없이 들어온 득점(폭투 등)은 play 가 null */
type Run = { play: { index: number; batterName: string; resultText: string } | null };

function collectRuns(lines: LiveLine[], side: ScoringSide): Run[] {
  const prefix = side === "away" ? "T" : "B";
  const runs: Run[] = [];
  let currentPlay: Run["play"] = null;
  lines.forEach((line, index) => {
    if (!line.period?.startsWith(prefix)) return;
    const text = (line.text ?? "").trim();
    if (line.textstyle === 8 || line.textstyle === 0) {
      currentPlay = null;
      return;
    }
    if (line.textstyle === 23) {
      const m = /^(.+?)\s*:\s*(.+)$/.exec(text);
      currentPlay = m ? { index, batterName: m[1]!.trim(), resultText: m[2]!.trim() } : null;
      if (/홈런/.test(text)) runs.push({ play: currentPlay });
      return;
    }
    if (line.textstyle === 24 && /홈인/.test(text)) {
      // 같은 타석의 결과 바로 뒤에 붙은 홈인만 그 타자 몫 — 폭투·도루 등은 타자 없이
      const byBatterPlay = currentPlay && !/폭투|포일|보크|도루|견제/.test(text);
      runs.push({ play: byBatterPlay ? currentPlay : null });
    }
  });
  return runs;
}

export async function fetchDaumScoringContext(input: {
  game: LiveScoreGame;
  previousHomeScore: number;
  previousAwayScore: number;
  timeoutMs?: number;
}): Promise<ScoringPlayContext | null> {
  const { game } = input;
  const homeDelta = game.homeScore - input.previousHomeScore;
  const awayDelta = game.awayScore - input.previousAwayScore;
  // 두 팀이 한꺼번에 바뀌었으면(놓친 회차) 장면을 특정하지 않는다
  if ((homeDelta > 0) === (awayDelta > 0)) return null;
  const side: ScoringSide = homeDelta > 0 ? "home" : "away";
  const runs = side === "home" ? homeDelta : awayDelta;
  const teamScore = side === "home" ? game.homeScore : game.awayScore;
  const timeoutMs = input.timeoutMs ?? 2500;

  let lines: LiveLine[] | null;
  try {
    const daumGameId = await resolveDaumGameId(game.externalId, timeoutMs);
    if (!daumGameId) return null;
    lines = await fetchLiveText(daumGameId, timeoutMs);
  } catch {
    return null;
  }
  if (!lines) return null;

  const allRuns = collectRuns(lines, side);
  // 중계가 점수를 아직 못 따라왔거나 더 앞서 있으면(정정 등) 장면을 믿지 않는다
  if (allRuns.length !== teamScore) return null;

  const recent = allRuns.slice(-runs);
  const byPlay = new Map<number, { play: NonNullable<Run["play"]>; runs: number }>();
  for (const run of recent) {
    if (!run.play) continue;
    const entry = byPlay.get(run.play.index) ?? { play: run.play, runs: 0 };
    entry.runs += 1;
    byPlay.set(run.play.index, entry);
  }
  const best = [...byPlay.values()].sort((a, b) => b.runs - a.runs || b.play.index - a.play.index)[0];
  if (!best) return null;
  const outcome = parseOutcome(best.play.resultText);
  if (!outcome) return null;

  const playLine = lines[best.play.index];
  const period = playLine?.period ?? "";
  const inning = Number.parseInt(period.slice(1), 10);
  const half = side === "away" ? "초" : "말";
  const label = Number.isFinite(inning) ? `${inning}회${half}` : null;
  const rbi = outcome.resultType === "ERROR" ? null : best.runs;
  // "중견수 희생플라이 아웃" → "중견수 희생플라이", 홈런 비거리 괄호는 뺀다 (타점은 문구에서 따로 붙는다)
  const resultText = best.play.resultText.replace(/\s*\(홈런거리:[^)]*\)/, "").replace(/\s*아웃$/, "");

  const home = findTeam(game.homeTeam);
  const away = findTeam(game.awayTeam);
  const scoring = side === "home" ? home : away;
  return {
    source: "daum-relay",
    confidence: "high",
    gameId: game.externalId,
    inning: { number: Number.isFinite(inning) ? inning : null, half, label, battingSide: side },
    scoreChange: {
      previous: { home: input.previousHomeScore, away: input.previousAwayScore },
      current: { home: game.homeScore, away: game.awayScore },
      scoringSide: side,
      runs,
    },
    teams: {
      home: { id: home.id, name: home.name, shortName: home.short },
      away: { id: away.id, name: away.name, shortName: away.short },
      scoringTeam: { id: scoring.id, name: scoring.name, shortName: scoring.short, side },
    },
    batter: { name: best.play.batterName, teamId: scoring.id, teamName: scoring.short, side },
    play: {
      rawTexts: [`${best.play.batterName} : ${best.play.resultText}`],
      primaryText: `${best.play.batterName} : ${resultText}`,
      resultType: outcome.resultType,
      resultLabel: outcome.label,
      hitKind: outcome.hitKind,
      rbi,
      runsScored: runs,
      direction: null,
    },
  };
}
