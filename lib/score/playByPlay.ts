import { findTeam } from "@/lib/teams";
import type { LiveScoreGame } from "@/lib/score/types";

export type ScoringSide = "home" | "away";

export type ScoringResultType =
  | "HIT"
  | "HOME_RUN"
  | "WALK"
  | "HBP"
  | "ERROR"
  | "SACRIFICE"
  | "FIELDERS_CHOICE"
  | "WILD_PITCH"
  | "PASSED_BALL"
  | "UNKNOWN";

export type ScoringHitKind = "1B" | "2B" | "3B" | "HR" | null;

export type ScoringPlayContext = {
  source: "naver-relay" | "score-delta-fallback";
  confidence: "high" | "medium" | "low";
  gameId: string;
  inning: {
    number: number | null;
    half: "초" | "말" | null;
    label: string | null;
    battingSide: ScoringSide | null;
  };
  scoreChange: {
    previous: { home: number; away: number };
    current: { home: number; away: number };
    scoringSide: ScoringSide | null;
    runs: number;
  };
  teams: {
    home: { id: string; name: string; shortName: string };
    away: { id: string; name: string; shortName: string };
    scoringTeam: { id: string; name: string; shortName: string; side: ScoringSide | null } | null;
  };
  batter: {
    name: string | null;
    teamId: string | null;
    teamName: string | null;
    side: ScoringSide | null;
  };
  play: {
    rawTexts: string[];
    primaryText: string | null;
    resultType: ScoringResultType;
    resultLabel: string | null;
    hitKind: ScoringHitKind;
    rbi: number | null;
    runsScored: number;
    direction: string | null;
  };
};

type ScorePoint = {
  home: number | null;
  away: number | null;
};

type RelayOption = {
  text: string;
  type: number | null;
  score: ScorePoint;
};

type RelayEntry = {
  title: string;
  inn: number | null;
  options: RelayOption[];
};

type ScorePair = { home: number; away: number };

const SCORE_NAVER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function scoreMatches(score: ScorePoint, target: ScorePair): boolean {
  return score.home === target.home && score.away === target.away;
}

function scoreFromOption(option: Record<string, unknown>): ScorePoint {
  const state = toRecord(option["currentGameState"]);
  return {
    home: toNumber(state?.["homeScore"]),
    away: toNumber(state?.["awayScore"]),
  };
}

function normalizeOption(option: Record<string, unknown>): RelayOption {
  const rawText = option["text"] ?? option["playText"] ?? option["relayText"] ?? "";
  return {
    text: typeof rawText === "string" ? compact(rawText) : "",
    type: toNumber(option["type"]),
    score: scoreFromOption(option),
  };
}

function normalizeRelayEntry(entry: Record<string, unknown>): RelayEntry {
  const rawTitle = entry["title"];
  const textOptions = entry["textOptions"];
  return {
    title: typeof rawTitle === "string" ? compact(rawTitle) : "",
    inn: toNumber(entry["inn"] ?? entry["inning"]),
    options: Array.isArray(textOptions)
      ? textOptions
          .map(toRecord)
          .filter((option): option is Record<string, unknown> => option != null)
          .map(normalizeOption)
      : [],
  };
}

function extractRelayEntries(json: Record<string, unknown>): RelayEntry[] {
  const result = toRecord(json["result"]);
  const textRelayData = toRecord(result?.["textRelayData"]);
  const textRelays = textRelayData?.["textRelays"];
  if (!Array.isArray(textRelays)) return [];
  return textRelays
    .map(toRecord)
    .filter((entry): entry is Record<string, unknown> => entry != null)
    .map(normalizeRelayEntry)
    .filter((entry) => entry.options.some((option) => option.text));
}

function resolveScoringSide(previous: ScorePair, current: ScorePair): ScoringSide | null {
  const homeDelta = current.home - previous.home;
  const awayDelta = current.away - previous.away;
  if (homeDelta > 0 && awayDelta <= 0) return "home";
  if (awayDelta > 0 && homeDelta <= 0) return "away";
  if (homeDelta > awayDelta && homeDelta > 0) return "home";
  if (awayDelta > homeDelta && awayDelta > 0) return "away";
  return null;
}

function runsForSide(previous: ScorePair, current: ScorePair, side: ScoringSide | null): number {
  if (side === "home") return Math.max(0, current.home - previous.home);
  if (side === "away") return Math.max(0, current.away - previous.away);
  return Math.max(0, current.home - previous.home, current.away - previous.away);
}

function entryHasScoreTransition(
  entry: RelayEntry,
  previous: ScorePair,
  current: ScorePair,
  scoringSide: ScoringSide | null
): boolean {
  const scoredIdx = entry.options.findIndex((option) => scoreMatches(option.score, current));
  if (scoredIdx < 0) return false;

  for (let i = 0; i < scoredIdx; i += 1) {
    if (scoreMatches(entry.options[i].score, previous)) return true;
  }

  if (!scoringSide) return false;
  for (let i = 0; i < scoredIdx; i += 1) {
    const prevScore = entry.options[i].score;
    const currScore = entry.options[scoredIdx].score;
    if (prevScore.home == null || prevScore.away == null || currScore.home == null || currScore.away == null) continue;
    if (scoringSide === "home" && currScore.home > prevScore.home && currScore.away === prevScore.away) return true;
    if (scoringSide === "away" && currScore.away > prevScore.away && currScore.home === prevScore.home) return true;
  }

  return false;
}

function findScoringEntry(
  entries: RelayEntry[],
  previous: ScorePair,
  current: ScorePair,
  scoringSide: ScoringSide | null
): { entry: RelayEntry; confidence: "high" | "medium" } | null {
  for (const entry of entries) {
    if (entryHasScoreTransition(entry, previous, current, scoringSide)) {
      const exact = entry.options.some((option) => scoreMatches(option.score, previous));
      return { entry, confidence: exact ? "high" : "medium" };
    }
  }
  return null;
}

function cleanPlayerName(text: string): string | null {
  const cleaned = compact(text)
    .replace(/^\d+번타자\s+/, "")
    .replace(/^대타\s+/, "")
    .replace(/^타자\s+/, "")
    .replace(/\s*\([^)]*\)\s*/g, "")
    .trim();
  if (!cleaned || cleaned.length > 16) return null;
  if (/주자|투수|교체|공격|수비|종료|시작|홈인|진루/.test(cleaned)) return null;
  return cleaned;
}

function extractBatter(entry: RelayEntry): string | null {
  const fromTitle = cleanPlayerName(entry.title);
  if (fromTitle) return fromTitle;

  for (const option of entry.options) {
    const m = option.text.match(/^([가-힣A-Za-z.]{2,16})\s*[:：]/);
    if (!m?.[1]) continue;
    if (/주자|투수|포수|코치/.test(option.text.slice(0, m.index))) continue;
    const candidate = cleanPlayerName(m[1]);
    if (candidate) return candidate;
  }
  return null;
}

function stripResultSubject(text: string): string {
  return compact(text.replace(/^[가-힣A-Za-z.]{2,16}\s*[:：]\s*/, ""));
}

function looksLikePrimaryPlay(text: string, batter: string | null): boolean {
  if (!text) return false;
  if (/^\d+구\s/.test(text)) return false;
  if (/^[1-3]루주자|^타자주자|^대주자/.test(text)) return false;
  if (batter && text.startsWith(`${batter} :`)) return true;
  if (batter && text.startsWith(`${batter}:`)) return true;
  return /(홈런|안타|루타|볼넷|4구|사구|몸에 맞는|실책|희생|야수\s*선택|폭투|포일|패스트볼)/.test(text);
}

function findPrimaryText(entry: RelayEntry, batter: string | null): string | null {
  const candidates = entry.options.map((option) => option.text).filter((text) => looksLikePrimaryPlay(text, batter));
  if (batter) {
    const ownLine = candidates.find((text) => text.startsWith(`${batter} :`) || text.startsWith(`${batter}:`));
    if (ownLine) return ownLine;
  }
  return candidates[0] ?? null;
}

function hitKindFromText(text: string): ScoringHitKind {
  if (/홈런|홈인런|만루포|쓰리런|스리런|투런|솔로포/.test(text)) return "HR";
  if (/3루타/.test(text)) return "3B";
  if (/2루타/.test(text)) return "2B";
  if (/1루타|안타/.test(text)) return "1B";
  return null;
}

function classifyResult(primaryText: string | null): { resultType: ScoringResultType; hitKind: ScoringHitKind; label: string | null } {
  const text = primaryText ? stripResultSubject(primaryText) : "";
  if (!text) return { resultType: "UNKNOWN", hitKind: null, label: null };
  const hitKind = hitKindFromText(text);
  if (hitKind === "HR") return { resultType: "HOME_RUN", hitKind, label: "홈런" };
  if (hitKind === "3B") return { resultType: "HIT", hitKind, label: "3루타" };
  if (hitKind === "2B") return { resultType: "HIT", hitKind, label: "2루타" };
  if (hitKind === "1B") return { resultType: "HIT", hitKind, label: "안타" };
  if (/몸에 맞는|몸 맞는|사구|데드볼/.test(text)) return { resultType: "HBP", hitKind: null, label: "사구" };
  if (/볼넷|4구/.test(text)) return { resultType: "WALK", hitKind: null, label: "볼넷" };
  if (/실책|포구 실책|송구 실책/.test(text)) return { resultType: "ERROR", hitKind: null, label: "상대 실책" };
  if (/희생플라이|희생 번트|희생번트|희생타/.test(text)) return { resultType: "SACRIFICE", hitKind: null, label: "희생타" };
  if (/야수\s*선택/.test(text)) return { resultType: "FIELDERS_CHOICE", hitKind: null, label: "야수 선택" };
  if (/폭투/.test(text)) return { resultType: "WILD_PITCH", hitKind: null, label: "폭투" };
  if (/포일|패스트볼/.test(text)) return { resultType: "PASSED_BALL", hitKind: null, label: "포일" };
  return { resultType: "UNKNOWN", hitKind: null, label: text.slice(0, 18) };
}

function directionFromText(primaryText: string | null): string | null {
  if (!primaryText) return null;
  const text = stripResultSubject(primaryText);
  const m = text.match(/(좌익수|중견수|우익수|유격수|3루수|2루수|1루수|투수|포수)(?:\s*(?:오른쪽|왼쪽|앞|뒤|방면|쪽|라인|플라이|땅볼))?/);
  return m?.[0] ? compact(m[0]) : null;
}

function rbiFromResult(resultType: ScoringResultType, runs: number): number | null {
  if (runs <= 0) return null;
  if (resultType === "ERROR" || resultType === "WILD_PITCH" || resultType === "PASSED_BALL") return null;
  return runs;
}

function teamPayload(teamId: string) {
  const team = findTeam(teamId);
  return { id: team.id, name: team.name, shortName: team.short };
}

function buildContextFromEntry(input: {
  game: LiveScoreGame;
  previous: ScorePair;
  current: ScorePair;
  entry: RelayEntry;
  confidence: "high" | "medium";
}): ScoringPlayContext {
  const scoringSide = resolveScoringSide(input.previous, input.current);
  const runs = runsForSide(input.previous, input.current, scoringSide);
  const inningHalf = scoringSide === "home" ? "말" : scoringSide === "away" ? "초" : null;
  const inningLabel = input.entry.inn != null && inningHalf ? `${input.entry.inn}회${inningHalf}` : null;
  const scoringTeamId = scoringSide === "home"
    ? input.game.homeTeam
    : scoringSide === "away"
      ? input.game.awayTeam
      : null;
  const batter = extractBatter(input.entry);
  const primaryText = findPrimaryText(input.entry, batter);
  const result = classifyResult(primaryText);

  return {
    source: "naver-relay",
    confidence: result.resultType === "UNKNOWN" || !batter ? "medium" : input.confidence,
    gameId: input.game.externalId,
    inning: {
      number: input.entry.inn,
      half: inningHalf,
      label: inningLabel,
      battingSide: scoringSide,
    },
    scoreChange: {
      previous: input.previous,
      current: input.current,
      scoringSide,
      runs,
    },
    teams: {
      home: teamPayload(input.game.homeTeam),
      away: teamPayload(input.game.awayTeam),
      scoringTeam: scoringTeamId
        ? { ...teamPayload(scoringTeamId), side: scoringSide }
        : null,
    },
    batter: {
      name: batter,
      teamId: scoringTeamId,
      teamName: scoringTeamId ? findTeam(scoringTeamId).name : null,
      side: scoringSide,
    },
    play: {
      rawTexts: input.entry.options.map((option) => option.text).filter(Boolean),
      primaryText,
      resultType: result.resultType,
      resultLabel: result.label,
      hitKind: result.hitKind,
      rbi: rbiFromResult(result.resultType, runs),
      runsScored: runs,
      direction: directionFromText(primaryText),
    },
  };
}

export function buildFallbackScoringContext(input: {
  game: LiveScoreGame;
  previousHomeScore: number;
  previousAwayScore: number;
}): ScoringPlayContext {
  const previous = { home: input.previousHomeScore, away: input.previousAwayScore };
  const current = { home: input.game.homeScore, away: input.game.awayScore };
  const scoringSide = resolveScoringSide(previous, current);
  const runs = runsForSide(previous, current, scoringSide);
  const inningHalf = scoringSide === "home" ? "말" : scoringSide === "away" ? "초" : input.game.currentInningHalf ?? null;
  const inningNumber = input.game.currentInning ?? null;
  const inningLabel = inningNumber != null && inningHalf ? `${inningNumber}회${inningHalf}` : input.game.currentInningLabel ?? null;
  const scoringTeamId = scoringSide === "home"
    ? input.game.homeTeam
    : scoringSide === "away"
      ? input.game.awayTeam
      : null;

  return {
    source: "score-delta-fallback",
    confidence: "low",
    gameId: input.game.externalId,
    inning: {
      number: inningNumber,
      half: inningHalf,
      label: inningLabel,
      battingSide: scoringSide,
    },
    scoreChange: {
      previous,
      current,
      scoringSide,
      runs,
    },
    teams: {
      home: teamPayload(input.game.homeTeam),
      away: teamPayload(input.game.awayTeam),
      scoringTeam: scoringTeamId
        ? { ...teamPayload(scoringTeamId), side: scoringSide }
        : null,
    },
    batter: {
      name: null,
      teamId: scoringTeamId,
      teamName: scoringTeamId ? findTeam(scoringTeamId).name : null,
      side: scoringSide,
    },
    play: {
      rawTexts: [],
      primaryText: null,
      resultType: "UNKNOWN",
      resultLabel: null,
      hitKind: null,
      rbi: null,
      runsScored: runs,
      direction: null,
    },
  };
}

export function formatScoringPlayText(context: ScoringPlayContext): string {
  const inning = context.inning.label ? `${context.inning.label} ` : "";
  const team = context.teams.scoringTeam?.name ?? "득점팀";
  const batter = context.batter.name;
  const result = context.play.resultLabel;
  const rbi = context.play.rbi != null ? `${context.play.rbi}타점` : `${context.play.runsScored}득점`;
  const primary = context.play.primaryText ? stripResultSubject(context.play.primaryText) : null;

  if (batter && result) return compact(`${inning}${team} ${batter} ${result} ${rbi}${primary ? ` — ${primary}` : ""}`);
  if (batter) return compact(`${inning}${team} ${batter} 타석에서 ${context.play.runsScored}득점`);
  return compact(`${inning}스코어 변동: ${team} ${context.play.runsScored}득점`);
}

export function parseScoringPlayContextFromRelay(input: {
  json: Record<string, unknown>;
  game: LiveScoreGame;
  previousHomeScore: number;
  previousAwayScore: number;
}): ScoringPlayContext | null {
  const entries = extractRelayEntries(input.json);
  const previous = { home: input.previousHomeScore, away: input.previousAwayScore };
  const current = { home: input.game.homeScore, away: input.game.awayScore };
  const scoringSide = resolveScoringSide(previous, current);
  const match = findScoringEntry(entries, previous, current, scoringSide);
  if (!match) return null;
  return buildContextFromEntry({
    game: input.game,
    previous,
    current,
    entry: match.entry,
    confidence: match.confidence,
  });
}

export async function fetchScoringPlayContext(input: {
  game: LiveScoreGame;
  previousHomeScore: number;
  previousAwayScore: number;
  timeoutMs?: number;
}): Promise<ScoringPlayContext | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 3000);
    const res = await fetch(
      `https://api-gw.sports.naver.com/schedule/games/${input.game.externalId}/relay`,
      {
        headers: {
          "user-agent": SCORE_NAVER_UA,
          accept: "application/json",
          referer: "https://m.sports.naver.com/",
          "accept-language": "ko-KR,ko;q=0.9",
        },
        cache: "no-store",
        signal: controller.signal,
      }
    ).finally(() => clearTimeout(timeout));
    if (!res.ok) return null;
    const json = await res.json() as Record<string, unknown>;
    return parseScoringPlayContextFromRelay({
      json,
      game: input.game,
      previousHomeScore: input.previousHomeScore,
      previousAwayScore: input.previousAwayScore,
    });
  } catch {
    return null;
  }
}
