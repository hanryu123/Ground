import { findTeam, TEAMS } from "@/lib/teams";
import { fetchTeamMomentum, type TeamMomentum } from "@/lib/teamMomentum";

const NAVER_BASE = "https://api-gw.sports.naver.com";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = process.env.POSTGAME_LLM_MODEL ?? "claude-sonnet-4-6";

/** 팀 ID로 홈구장(도시) 반환. 정보 없으면 null. */
function homeCity(teamId: string): string | null {
  return TEAMS.find((t) => t.id === teamId.toLowerCase())?.city ?? null;
}

/** 경기가 열린 구장 도시 이름 */
function stadiumCity(mySide: "home" | "away", myTeamId: string, oppTeamId: string): string | null {
  return mySide === "home" ? homeCity(myTeamId) : homeCity(oppTeamId);
}

type Tone = "win" | "loss" | "draw";

export type PostGameFacts = {
  externalId: string;
  myTeam: string;
  oppTeam: string;
  myScore: number;
  oppScore: number;
  myHits: number | null;
  oppHits: number | null;
  myErrors: number | null;
  oppErrors: number | null;
  myHomeRuns: number | null;
  oppHomeRuns: number | null;
  winningPitcher?: string | null;
  losingPitcher?: string | null;
  savePitcher?: string | null;
  clutchHit?: string | null;
  homeRun?: string | null;
  error?: string | null;
  notable?: string[];
  myPlayers?: string[];
  oppPlayers?: string[];
  recentMomentum?: TeamMomentum | null;
  gameTime?: string | null;
  /** 경기 도중 우천 중단이 있었던 경우 true */
  wasRainSuspended?: boolean;
};

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clip(text: string, limit = 86): string {
  const normalized = compact(text);
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 2)}..`;
}

function readString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = compact(v);
  return t.length > 0 ? t : null;
}

function readNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function sanitizeTextValue(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = compact(v);
  if (!t) return null;
  if (/^(확인\s*중|tbd|미정|unknown|null|n\/a|-|없음|home|away|draw)$/i.test(t)) return null;
  return t;
}

function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickBySeed<T>(seed: string, list: readonly T[]): T {
  return list[hashSeed(seed) % list.length];
}

function collectTexts(root: unknown): string[] {
  const out: string[] = [];
  const queue: unknown[] = [root];
  const seen = new Set<unknown>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }
    if (typeof current !== "object") continue;
    const obj = current as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        const lower = key.toLowerCase();
        if (
          lower.includes("text") ||
          lower.includes("relay") ||
          lower.includes("comment") ||
          lower.includes("summary") ||
          lower.includes("record") ||
          lower.includes("play")
        ) {
          const text = readString(value);
          if (text) out.push(text);
        }
      } else if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }
  return out;
}

function firstByKeyword(texts: string[], regex: RegExp): string | null {
  const found = texts.find((line) => regex.test(line));
  return found ? clip(found) : null;
}

function extractPitcherName(detail: unknown, keys: string[]): string | null {
  const queue: unknown[] = [detail];
  const seen = new Set<unknown>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }
    if (typeof current !== "object") continue;
    const obj = current as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string" && keys.some((candidate) => key.toLowerCase().includes(candidate))) {
        const text = sanitizeTextValue(readString(value));
        if (text) return text;
      } else if (value && typeof value === "object") {
        queue.push(value);
      }
    }
  }
  return null;
}

type Side = "home" | "away";

type ParsedBoxStats = {
  homeHits: number | null;
  awayHits: number | null;
  homeErrors: number | null;
  awayErrors: number | null;
  homeHomeRuns: number | null;
  awayHomeRuns: number | null;
};

type ParsedPitchingResult = {
  winningPitcher: string | null;
  losingPitcher: string | null;
  savePitcher: string | null;
};

type ParsedEtcRecords = {
  clutchHit: string | null;
  homeRun: string | null;
  notable: string[];
};

type ParsedPlayerLists = {
  homePlayers: string[];
  awayPlayers: string[];
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function sumTeamHr(list: unknown): number | null {
  if (!Array.isArray(list)) return null;
  let total = 0;
  let found = false;
  for (const row of list) {
    const obj = asRecord(row);
    if (!obj) continue;
    const hr = readNumber(obj.hr);
    if (hr == null || hr < 0) continue;
    found = true;
    total += Math.round(hr);
  }
  return found ? total : null;
}

function parseBoxStats(recordResponse: unknown): ParsedBoxStats {
  const result = asRecord(recordResponse)?.result;
  const recordData = asRecord(result)?.recordData;
  const scoreBoard = asRecord(recordData && asRecord(recordData)?.scoreBoard);
  const rheb = asRecord(scoreBoard && asRecord(scoreBoard)?.rheb);
  const rhebHome = asRecord(rheb && asRecord(rheb)?.home);
  const rhebAway = asRecord(rheb && asRecord(rheb)?.away);
  const battersBoxscore = asRecord(recordData && asRecord(recordData)?.battersBoxscore);

  const homeHits = readNumber(rhebHome?.h) ?? readNumber(asRecord(battersBoxscore?.homeTotal)?.hit);
  const awayHits = readNumber(rhebAway?.h) ?? readNumber(asRecord(battersBoxscore?.awayTotal)?.hit);
  const homeErrors = readNumber(rhebHome?.e);
  const awayErrors = readNumber(rhebAway?.e);
  const homeHomeRuns = sumTeamHr(battersBoxscore?.home);
  const awayHomeRuns = sumTeamHr(battersBoxscore?.away);

  return {
    homeHits,
    awayHits,
    homeErrors,
    awayErrors,
    homeHomeRuns,
    awayHomeRuns,
  };
}

function parsePlayerLists(recordResponse: unknown): ParsedPlayerLists {
  const result = asRecord(recordResponse)?.result;
  const recordData = asRecord(result)?.recordData;
  const battersBoxscore = asRecord(recordData && asRecord(recordData)?.battersBoxscore);
  const pitchersBoxscore = asRecord(recordData && asRecord(recordData)?.pitchersBoxscore);

  const collectNames = (...lists: unknown[]): string[] => {
    const names = new Set<string>();
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        const row = asRecord(item);
        const name = sanitizeTextValue(readString(row?.name));
        if (name) names.add(name);
      }
    }
    return [...names];
  };

  return {
    homePlayers: collectNames(battersBoxscore?.home, pitchersBoxscore?.home),
    awayPlayers: collectNames(battersBoxscore?.away, pitchersBoxscore?.away),
  };
}

function resolveGameTimeInstruction(gameTime?: string | null): string | null {
  if (!gameTime) return null;
  const hour = Number.parseInt(gameTime.slice(0, 2), 10);
  if (!Number.isFinite(hour)) return `경기 시작 시간: ${gameTime}`;
  if (hour < 17) {
    return `경기 시작 시간: ${gameTime} 낮 경기. "밤", "오늘 밤", "야간" 표현 금지. 필요하면 "오늘", "이날", "잠실의 오후"처럼 써라.`;
  }
  if (hour < 18) {
    return `경기 시작 시간: ${gameTime} 오후 경기. "오늘 밤"으로 단정하지 말고 "오늘", "이날", "경기 후반"처럼 써라.`;
  }
  return `경기 시작 시간: ${gameTime} 야간 경기. "밤" 표현 사용 가능.`;
}

function isNonNightGame(gameTime?: string | null): boolean {
  if (!gameTime) return false;
  const hour = Number.parseInt(gameTime.slice(0, 2), 10);
  return Number.isFinite(hour) && hour < 18;
}

function hasNightExpression(text: string): boolean {
  return /(오늘\s*밤|밤이었|밤입니다|밤이네요|야간|나이트게임)/.test(text);
}

function dateFromExternalId(externalId: string): string | null {
  const raw = externalId.slice(0, 8);
  if (!/^\d{8}$/.test(raw)) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasUnlabeledOpponentPlayerMention(text: string, oppTeam: string, oppPlayers: string[] | undefined): boolean {
  const names = (oppPlayers ?? []).filter((name) => name.length >= 2);
  for (const name of names) {
    const regex = new RegExp(escapeRegExp(name), "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) != null) {
      const start = Math.max(0, match.index - 14);
      const end = Math.min(text.length, match.index + name.length + 14);
      const context = text.slice(start, end);
      if (!context.includes(oppTeam) && !/(상대|타자|타선|중심타선)/.test(context)) {
        return true;
      }
    }
  }
  return false;
}

function parsePitchingResult(recordResponse: unknown): ParsedPitchingResult {
  const result = asRecord(recordResponse)?.result;
  const recordData = asRecord(result)?.recordData;
  let winningPitcher: string | null = null;
  let losingPitcher: string | null = null;
  let savePitcher: string | null = null;

  const applyRows = (rows: unknown) => {
    if (!Array.isArray(rows)) return;
    for (const item of rows) {
      const row = asRecord(item);
      if (!row) continue;
      const wls = readString(row.wls)?.toUpperCase() ?? "";
      const name = sanitizeTextValue(readString(row.name));
      if (!name) continue;
      if (wls === "W" || wls === "승") winningPitcher = winningPitcher ?? name;
      else if (wls === "L" || wls === "패") losingPitcher = losingPitcher ?? name;
      else if (wls === "S" || wls === "세") savePitcher = savePitcher ?? name;
    }
  };

  applyRows(asRecord(recordData)?.pitchingResult);
  const pitchersBoxscore = asRecord(recordData && asRecord(recordData)?.pitchersBoxscore);
  applyRows(pitchersBoxscore?.home);
  applyRows(pitchersBoxscore?.away);

  return { winningPitcher, losingPitcher, savePitcher };
}

function formatEtcRecord(how: string | null, result: string | null): string | null {
  if (!result) return null;
  if (!how) return result;
  return `${how}: ${result}`;
}

function parseEtcRecords(recordResponse: unknown): ParsedEtcRecords {
  const result = asRecord(recordResponse)?.result;
  const recordData = asRecord(result)?.recordData;
  const rows = asRecord(recordData)?.etcRecords;
  if (!Array.isArray(rows)) {
    return { clutchHit: null, homeRun: null, notable: [] };
  }

  let clutchHit: string | null = null;
  let homeRun: string | null = null;
  const notable: string[] = [];
  for (const item of rows) {
    const row = asRecord(item);
    if (!row) continue;
    const how = sanitizeTextValue(readString(row.how));
    const resultText = sanitizeTextValue(readString(row.result));
    const line = formatEtcRecord(how, resultText);
    if (!line) continue;
    notable.push(clip(line, 100));
    if (!clutchHit && /(결승타|결승)/.test(`${how ?? ""} ${resultText ?? ""}`)) {
      clutchHit = clip(line, 100);
    }
    const isHomeRunRecord =
      /(홈런|솔로포|투런|스리런|만루포)/.test(how ?? "") ||
      (!/(결승타|결승)/.test(how ?? "") &&
        /(홈런|솔로포|투런|스리런|만루포)/.test(resultText ?? ""));
    if (!homeRun && isHomeRunRecord) {
      homeRun = clip(line, 100);
    }
  }
  return { clutchHit, homeRun, notable };
}

function countTeamKeyword(texts: string[], teamShort: string, regex: RegExp): number | null {
  const safe = teamShort.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = new RegExp(`${safe}[\\s\\S]{0,18}${regex.source}`, "i");
  const around = texts.filter((line) => exact.test(line)).length;
  return around > 0 ? around : null;
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 GroundBot/1.0",
        accept: "application/json",
        referer: "https://m.sports.naver.com/",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function hasOfficialNarrative(recordResponse: unknown): boolean {
  const pitching = parsePitchingResult(recordResponse);
  const etc = parseEtcRecords(recordResponse);
  return Boolean(
    pitching.winningPitcher ||
      pitching.losingPitcher ||
      pitching.savePitcher ||
      etc.clutchHit
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPostGameRecord(gameId: string): Promise<unknown | null> {
  const url = `${NAVER_BASE}/schedule/games/${gameId}/record`;
  const first = await fetchJsonWithTimeout(url, 2500);
  if (hasOfficialNarrative(first)) return first;
  await delay(1200);
  return await fetchJsonWithTimeout(url, 2500);
}

async function fetchPostGameRelay(gameId: string): Promise<unknown | null> {
  const endpoints = [
    `${NAVER_BASE}/schedule/games/${gameId}/relay?fields=relayTexts`,
    `${NAVER_BASE}/schedule/games/${gameId}/relay`,
    `${NAVER_BASE}/schedule/games/${gameId}/relayTexts`,
  ];
  for (const endpoint of endpoints) {
    const json = await fetchJsonWithTimeout(endpoint, 1600);
    if (json) return json;
  }
  return null;
}

function buildFallbackReport(input: { facts: PostGameFacts; tone: Tone }): { headline: string; content: string } {
  const { facts, tone } = input;
  const seedBase = `${facts.externalId}:${facts.myTeam}:${facts.myScore}:${facts.oppScore}`;
  const gap = facts.myScore - facts.oppScore;
  const scoreLine = `${facts.myScore}:${facts.oppScore}`;
  const momentumLine =
    facts.recentMomentum?.streak && facts.recentMomentum.streak.count >= 3
      ? `최근 흐름까지 보면 ${facts.recentMomentum.streak.label}, 이 숫자는 절대 가볍게 넘길 수 없습니다.`
      : facts.recentMomentum?.summary
        ? `최근 흐름은 ${facts.recentMomentum.summary}`
        : "";

  const winHeads = [
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 오늘은 거의 흠잡을 데가 없었습니다.`,
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 승부처에서 전혀 흔들리지 않았습니다.`,
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 오늘 완성도가 한 수 위였습니다.`,
  ] as const;
  const lossHeads = [
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 이건 솔직히 변명이 없는 경기였습니다.`,
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 오늘은 패배해야 마땅한 흐름이었습니다.`,
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 이 결과 누구도 억울하다 할 수 없습니다.`,
  ] as const;
  const drawHeads = [
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 이길 경기를 결국 가져오지 못했습니다.`,
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 비겼지만 속은 편하지 않은 1점입니다.`,
    `🎙️ [캐스터 한줄평] ${facts.myTeam}, 결정적 순간 결정력이 끝내 터지지 않았습니다.`,
  ] as const;

  if (tone === "win") {
    const headline = pickBySeed(`${seedBase}:win:head`, winHeads);
    const opener = gap >= 5
      ? `${facts.myTeam}가 ${facts.oppTeam}를 ${scoreLine}으로 완파했습니다.`
      : `${facts.myTeam}가 ${facts.oppTeam}를 ${scoreLine}으로 잡아냈습니다.`;
    const heroPart = facts.clutchHit && facts.winningPitcher
      ? `결승타 장면 — "${clip(facts.clutchHit, 40)}" — 여기에 ${facts.winningPitcher}의 승리 투구까지 붙으니 설명이 끝납니다.`
      : facts.clutchHit
        ? `결승타 장면 — "${clip(facts.clutchHit, 40)}" — 이 한 방이 경기를 결정지었습니다.`
        : facts.winningPitcher
          ? `오늘의 핵심은 ${facts.winningPitcher}, 마운드에서 흐름을 완전히 주도했습니다.`
          : `승부처마다 ${facts.myTeam}가 먼저 치고 나갔고, 상대는 끝내 따라오지 못했습니다.`;
    const closerPart = facts.savePitcher
      ? `${facts.savePitcher}가 뒷문을 철저히 잠갔습니다.`
      : facts.clutchHit && facts.winningPitcher
        ? `결승타 장면, "${clip(facts.clutchHit, 36)}" — 이것만으로 오늘 경기가 설명됩니다.`
        : `다음 경기도 이 흐름 그대로 가져가야 합니다.`;
    return {
      headline,
      content: `${opener} ${momentumLine ? `${momentumLine} ` : ""}${heroPart} ${closerPart} 다음 경기도 기대가 됩니다.`,
    };
  }

  if (tone === "draw") {
    const headline = pickBySeed(`${seedBase}:draw:head`, drawHeads);
    const bodyPart = facts.losingPitcher
      ? `${facts.losingPitcher}에게 패전이 붙지 않은 게 그나마 다행이지만, 내용은 좋지 않았습니다.`
      : facts.clutchHit
        ? `"${clip(facts.clutchHit, 36)}" — 이 장면 하나를 막지 못한 게 오늘의 핵심입니다.`
        : `결정적인 순간마다 ${facts.myTeam} 쪽이 한 발씩 느렸습니다.`;
    return {
      headline,
      content: `${facts.myTeam}와 ${facts.oppTeam}가 ${scoreLine}으로 나눴지만, 이 결과가 딱히 반갑지만은 않습니다. ${momentumLine ? `${momentumLine} ` : ""}${bodyPart} 승리를 손에 쥘 수 있었던 경기였는데, 결국 1점으로 마무리됐습니다.`,
    };
  }

  // loss
  const headline = pickBySeed(`${seedBase}:loss:head`, lossHeads);
  const opener = gap <= -8
    ? `${facts.myTeam}가 ${facts.oppTeam}에 ${scoreLine}으로 완패했습니다.`
    : `${facts.myTeam}가 ${facts.oppTeam}에 ${scoreLine}으로 졌습니다.`;
  const corePart = facts.clutchHit
    ? `"${clip(facts.clutchHit, 36)}" — 이 장면이 오늘 경기를 결정지었습니다.`
    : facts.losingPitcher
      ? `${facts.losingPitcher}가 패전 투수로 이름을 남겼지만, 한 명의 문제가 아니었습니다.`
      : `승부처에서 번번이 무너지는 패턴이 오늘도 반복됐습니다.`;
  const tailPart = facts.losingPitcher && facts.clutchHit
    ? `${facts.losingPitcher}를 포함해 팀 전체가 복기해야 할 경기입니다.`
    : `다음 경기, 반드시 되갚아야 합니다.`;
  return {
    headline,
    content: `${opener} ${momentumLine ? `${momentumLine} ` : ""}${corePart} ${tailPart} 팬들도 오늘만큼은 할 말이 없습니다.`,
  };
}

function parseJsonBlock(text: string): { headline?: string; content?: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as { headline?: string; content?: string };
  } catch {
    return null;
  }
}

function hasVerifiedComebackFact(facts: PostGameFacts): boolean {
  return [
    facts.clutchHit,
    facts.homeRun,
    facts.error,
    ...(facts.notable ?? []),
  ].some((line) => typeof line === "string" && /역전/.test(line));
}

function isSafePostGameCopy(input: { headline: string; content: string; facts: PostGameFacts }): boolean {
  const text = `${input.headline} ${input.content}`;
  if (/직전\s*경기|어제|어젯밤|전날|최근\s*\d*\s*경기|연승|연패|설욕|복수|즉각\s*반격|반등/.test(text)) {
    return false;
  }
  if (!hasVerifiedComebackFact(input.facts) && /역전패|역전승|역전극|대역전/.test(text)) {
    return false;
  }
  return true;
}

export async function fetchPostGameFacts(input: {
  externalId: string;
  teamId: string;
  opponentTeamId: string;
  myScore: number;
  oppScore: number;
  mySide: Side;
  gameTime?: string | null;
}): Promise<PostGameFacts> {
  const gameDate = dateFromExternalId(input.externalId);
  const [detail, box, relay, recentMomentum] = await Promise.all([
    fetchJsonWithTimeout(`${NAVER_BASE}/schedule/games/${input.externalId}`, 1200),
    fetchPostGameRecord(input.externalId),
    fetchPostGameRelay(input.externalId),
    gameDate
      ? fetchTeamMomentum({
          teamId: input.teamId,
          asOfDate: gameDate,
          includeAsOfDate: true,
        })
      : Promise.resolve(null),
  ]);
  const texts = [...collectTexts(detail), ...collectTexts(relay)].map((line) => clip(line, 100));
  const side: Side = input.mySide;
  const stats = parseBoxStats(box);
  const pitching = parsePitchingResult(box);
  const etc = parseEtcRecords(box);
  const playerLists = parsePlayerLists(box);

  const myHits = side === "home" ? stats.homeHits : stats.awayHits;
  const oppHits = side === "home" ? stats.awayHits : stats.homeHits;
  const myErrors = side === "home" ? stats.homeErrors : stats.awayErrors;
  const oppErrors = side === "home" ? stats.awayErrors : stats.homeErrors;
  const myHomeRuns =
    (side === "home" ? stats.homeHomeRuns : stats.awayHomeRuns) ??
    countTeamKeyword(texts, findTeam(input.teamId).short, /(홈런|솔로포|투런|스리런)/);
  const oppHomeRuns =
    (side === "home" ? stats.awayHomeRuns : stats.homeHomeRuns) ??
    countTeamKeyword(texts, findTeam(input.opponentTeamId).short, /(홈런|솔로포|투런|스리런)/);
  const myPlayers = side === "home" ? playerLists.homePlayers : playerLists.awayPlayers;
  const oppPlayers = side === "home" ? playerLists.awayPlayers : playerLists.homePlayers;

  return {
    externalId: input.externalId,
    myTeam: findTeam(input.teamId).short,
    oppTeam: findTeam(input.opponentTeamId).short,
    myScore: input.myScore,
    oppScore: input.oppScore,
    myHits,
    oppHits,
    myErrors,
    oppErrors,
    myHomeRuns,
    oppHomeRuns,
    winningPitcher:
      pitching.winningPitcher ??
      sanitizeTextValue(extractPitcherName(detail, ["winningpitcher", "winning_pitcher", "winpitcher", "win_pitcher"])),
    losingPitcher:
      pitching.losingPitcher ??
      sanitizeTextValue(extractPitcherName(detail, ["losingpitcher", "losing_pitcher", "losepitcher", "lose_pitcher"])),
    savePitcher:
      pitching.savePitcher ??
      sanitizeTextValue(extractPitcherName(detail, ["savepitcher", "save_pitcher"])),
    clutchHit: etc.clutchHit ?? firstByKeyword(texts, /(결승타|역전타|적시타|결정타)/),
    homeRun: etc.homeRun ?? firstByKeyword(texts, /(홈런|솔로포|투런|스리런)/),
    error: firstByKeyword(texts, /(실책|에러|E\d)/i),
    notable: [...etc.notable, ...texts].slice(0, 5),
    myPlayers,
    oppPlayers,
    recentMomentum,
    gameTime: input.gameTime ?? null,
  };
}

export async function generatePostGameReport(input: {
  teamId: string;
  opponentTeamId: string;
  mySide: "home" | "away";
  tone: Tone;
  facts: PostGameFacts;
  strictLlm?: boolean;
}): Promise<{ headline: string; content: string }> {
  const fallback = buildFallbackReport({ facts: input.facts, tone: input.tone });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    if (input.strictLlm) throw new Error("ANTHROPIC_API_KEY is missing (strictLlm mode)");
    return fallback;
  }

  const team = findTeam(input.teamId).short;
  const stadium = stadiumCity(input.mySide, input.teamId, input.opponentTeamId);
  const locationLine = stadium
    ? `경기장: ${stadium} (${input.mySide === "home" ? "홈" : "원정"} 경기)`
    : `경기: ${input.mySide === "home" ? "홈" : "원정"} 경기`;
  const gameTimeLine = resolveGameTimeInstruction(input.facts.gameTime);

  const system = `너는 ${team} 전담 편파 캐스터야. 직업적 품격(존댓말, 방송 어체)은 지키지만, 감정은 완전히 ${team} 편이야.
경기 직후 단 하나의 한줄평을 날리는 순간이야 — 통계 브리핑이 아니라, 이 경기를 하나의 문장으로 정의하는 거야.
중립 절대 금지. 오직 ${team} 팬의 눈으로 이 경기의 본질을 꿰뚫어라.

작성 원칙:
- 결승타·승리/패전투수·세이브처럼 명확한 주인공이 있으면 그 이름을 반드시 써라
- 핵심 내러티브에 실명이 있으면 본문 첫 두 문장 안에 최소 한 명은 반드시 박아라
- 안타/실책/홈런 수를 나열하는 브리핑 절대 금지 — 숫자는 문장 흐름에 녹이거나 생략
- 이 경기를 단 하나의 각도(영웅/패인/장면)로 날카롭게 잘라라
- 칭찬할 때는 아낌없이, 비판할 때는 직설적으로 — "아쉽다" 한마디로 때우는 결론 금지
- 최근 흐름은 반드시 최근 5경기, 직전 경기, 연승/연패 스트릭을 구분해서 해석
- 3연승/3연패 이상이면 문맥상 자연스럽게 언급. 8연패 이상이면 반드시 한줄평의 핵심 서사로 삼아라
- 최근 5경기 성적이 좋아도 직전 경기 패배면 "좋은 흐름"으로 단정 금지

반드시 JSON만 출력:
{"headline":"🎙️ [캐스터 한줄평] ...","content":"3~4문장 단락"}

규칙:
- headline: 18~56자, 존댓말
- content: 3~4문장 한 단락(줄바꿈 없이, 문장마다 어휘를 다르게), 존댓말
- 우리 팀 관점 고정, 상대팀과 똑같은 내용 재사용 금지
- "먹히다/먹힌다" 절대 금지
- 제공된 오늘 경기 데이터 안에 없는 맥락 금지: 직전 경기, 어제/전날, 최근 N경기, 연승/연패, 설욕, 복수, 반등, 즉각 반격 언급 금지
- 주요 장면에 "역전"이 명시되지 않았으면 역전승/역전패/역전극 언급 금지
- 아래 금칙어 금지: "확인 중", "정보 없음", "탓할 수 없는"
- 데이터가 비어도 추측 금지하고 자연스러운 축약 표현 사용
- 경기장/구장 언급 시 반드시 아래 제공된 실제 경기장 위치를 사용할 것
- 선수 소속 절대 오인 금지. 상대 선수 명단에 있는 이름을 ${team} 선수, ${team} 중심타자, ${team} 주인공처럼 쓰면 실패다
- 상대 선수 기록은 "${input.facts.oppTeam} 타자/상대 타자/상대 중심타선"으로만 다뤄라
- 상대 선수 이름을 단독 주어로 세우지 마라. 반드시 "${input.facts.oppTeam}의 OOO" 또는 "상대 타자 OOO"처럼 소속을 붙여라

⚾ 야구 용어 절대 해석 규칙:
- 탈삼진: 투수가 타자를 삼진 아웃시킨 것 (투수의 성공)
- 볼넷: 볼 4개로 출루 (투수 실책)
- 병살타: 타구 하나로 2명 아웃 (공격팀 최악)
- 희생플라이: 타자 아웃 대신 주자 득점, 실제 희생 아님`;
  const rainLine = input.facts.wasRainSuspended ? "경기 특이사항: 우천 중단 후 속개된 경기. 빗속에서 끝낸 긴장감을 한 문장에 녹여줘." : "";
  const narrativeLines = [
    input.facts.winningPitcher ? `승리투수: ${input.facts.winningPitcher}` : null,
    input.facts.losingPitcher ? `패전투수: ${input.facts.losingPitcher}` : null,
    input.facts.savePitcher ? `세이브: ${input.facts.savePitcher}` : null,
    input.facts.clutchHit ? `결승타 장면: ${input.facts.clutchHit}` : null,
    input.facts.homeRun && !input.facts.clutchHit ? `홈런 장면: ${input.facts.homeRun}` : null,
  ].filter(Boolean).join("\n");
  const prompt = `팀:${input.facts.myTeam}
상대:${input.facts.oppTeam}
${locationLine}
${gameTimeLine ? `${gameTimeLine}\n` : ""}결과:${input.tone} | 스코어:${input.facts.myScore}:${input.facts.oppScore}
${rainLine ? `${rainLine}\n` : ""}
▶ 선수 소속 경계 (절대 위반 금지):
우리 팀(${input.facts.myTeam}) 선수: ${(input.facts.myPlayers ?? []).slice(0, 18).join(", ") || "명단 없음"}
상대 팀(${input.facts.oppTeam}) 선수: ${(input.facts.oppPlayers ?? []).slice(0, 18).join(", ") || "명단 없음"}

▶ 핵심 내러티브 (한줄평의 중심으로 활용할 것):
${narrativeLines || "투수/결승타 정보 없음"}

▶ 최근 팀 흐름 (오늘 경기 결과까지 반영):
${input.facts.recentMomentum?.summary ?? "최근 흐름 데이터 없음"}
최근 5경기: ${input.facts.recentMomentum?.recentRecord ?? "기록 없음"} / ${input.facts.recentMomentum?.recentForm ?? "기록 없음"}
현재 연속 흐름: ${input.facts.recentMomentum?.streak?.label ?? "없음"}
직전 경기: ${input.facts.recentMomentum?.lastGameLine ?? "없음"}

▶ 참고 수치 (숫자 나열 금지, 필요시 맥락으로만 활용):
안타:${input.facts.myHits ?? "?"}:${input.facts.oppHits ?? "?"}
실책:${input.facts.myErrors ?? "?"}:${input.facts.oppErrors ?? "?"}
홈런:${input.facts.myHomeRuns ?? "?"}:${input.facts.oppHomeRuns ?? "?"}
주요 장면:${(input.facts.notable ?? []).join(" | ") || "없음"}`;

  const callLlm = async (timeoutMs: number) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 360,
          temperature: 0.98,
          system,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[postgame-llm] bad_response", res.status, body.slice(0, 280));
        return null;
      }
      const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
      const text =
        json.content
          ?.filter((item) => item.type === "text" && typeof item.text === "string")
          .map((item) => item.text ?? "")
          .join("\n") ?? "";
      const parsed = parseJsonBlock(text);
      const headline = clip(parsed?.headline ?? "", 62);
      const content = clip(parsed?.content ?? "", 320);
      if (!headline || !content) return null;
      if (/확인\s*중|정보\s*없음|탓할 수 없는/i.test(`${headline} ${content}`)) return null;
      if (isNonNightGame(input.facts.gameTime) && hasNightExpression(`${headline} ${content}`)) return null;
      if (hasUnlabeledOpponentPlayerMention(content, input.facts.oppTeam, input.facts.oppPlayers)) return null;
      if (!isSafePostGameCopy({ headline, content, facts: input.facts })) {
        console.warn("[postgame-llm] rejected unsafe copy", { headline, content });
        return null;
      }
      return { headline, content };
    } catch (error) {
      console.error("[postgame-llm] request_failed", (error as Error).message);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  const first = await callLlm(12000);
  if (first) return first;

  const second = await callLlm(18000);
  if (second) return second;

  if (input.strictLlm) {
    throw new Error("Claude generation failed after retries (strictLlm mode)");
  }

  return fallback;
}
