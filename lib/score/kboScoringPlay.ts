import { findTeam } from "@/lib/teams";
import { naverToKboGameId } from "@/lib/kboOfficial";
import type { LiveScoreGame } from "@/lib/score/types";
import type { ScoringHitKind, ScoringPlayContext, ScoringResultType, ScoringSide } from "@/lib/score/playByPlay";

/**
 * 득점 장면(누가·무엇을 쳐서·몇 타점) — KBO 공식 박스스코어(GetBoxScoreScroll)에서 찾는다.
 *
 * 네이버 문자중계가 Vercel 서버 요청을 막은 뒤(2026-10-26) 선수 이름을 붙이려고 만들었다.
 * 박스스코어에는 타자별 이닝 결과("우안", "중2", "우홈")와 누적 타점이 있다.
 *
 *  - 정확도가 우선이다: 직전 득점 때 본 타점과 지금 타점을 비교해 타점이 늘어난 타자를 고른다.
 *    (그 팀 점수가 0이었으면 직전 타점은 모두 0으로 본다)
 *  - 직전 기록이 없으면(서버가 새로 뜬 경우) 그 이닝에 타점성 결과를 낸 타자가 한 명뿐일 때만 쓴다.
 *  - 확신이 없으면 null — 호출하는 쪽은 선수 이름 없이 점수만으로 보낸다. 틀린 이름보다 낫다.
 */

const KBO_BOXSCORE_URL = "https://www.koreabaseball.com/ws/Schedule.asmx/GetBoxScoreScroll";
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "x-requested-with": "XMLHttpRequest",
  referer: "https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
};

type Cell = { Text?: string | null };
type Table = { headers?: Array<{ row?: Cell[] }>; rows?: Array<{ row?: Cell[] }> };

type Batter = { key: string; name: string; inningResults: Map<number, string[]>; rbi: number };

function text(html: string | null | undefined): string {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function parseTable(raw: unknown): Table {
  if (typeof raw === "string") return JSON.parse(raw) as Table;
  return (raw ?? {}) as Table;
}

/** arrHitter 한 팀 → 타자 목록 (table1: 타순·포지션·이름, table2: 이닝별 결과, table3: 타수·안타·타점·득점·타율) */
function parseBatters(block: Record<string, unknown>, side: ScoringSide): Batter[] {
  const t1 = parseTable(block.table1);
  const t2 = parseTable(block.table2);
  const t3 = parseTable(block.table3);
  const innings = (t2.headers?.[0]?.row ?? []).map((c) => Number.parseInt(text(c.Text), 10));
  const rows1 = t1.rows ?? [];
  const rows2 = t2.rows ?? [];
  const rows3 = t3.rows ?? [];
  const out: Batter[] = [];
  rows1.forEach((r, i) => {
    const name = text(r.row?.[2]?.Text);
    if (!name) return;
    const inningResults = new Map<number, string[]>();
    (rows2[i]?.row ?? []).forEach((c, col) => {
      const inning = innings[col];
      const v = text(c.Text);
      if (inning && v) inningResults.set(inning, v.split("/").map((s) => s.trim()).filter(Boolean));
    });
    const rbi = Number.parseInt(text(rows3[i]?.row?.[2]?.Text), 10);
    out.push({ key: `${side}:${i}:${name}`, name, inningResults, rbi: Number.isFinite(rbi) ? rbi : 0 });
  });
  return out;
}

type Outcome = {
  resultType: ScoringResultType;
  hitKind: ScoringHitKind;
  label: string;
  direction: string | null;
  /** 타점이 붙을 수 있는 결과인지 */
  canDriveIn: boolean;
  /** 같은 이닝 후보끼리 고를 때 우선순위 (높을수록) */
  rank: number;
};

const DIRECTION_NAME: Record<string, string> = { 좌: "좌익수", 중: "중견수", 우: "우익수", 좌중: "좌중간", 우중: "우중간" };

/** KBO 박스스코어 약어("우안", "중2", "좌홈", "희비", "4구" …) → 결과 */
function parseOutcome(code: string): Outcome | null {
  const dir = /^(좌중|우중|좌|중|우)/.exec(code)?.[1] ?? null;
  if (/홈$/.test(code)) {
    return { resultType: "HOME_RUN", hitKind: "HR", label: dir === "좌" ? "좌월 홈런" : dir === "우" ? "우월 홈런" : dir ? "중월 홈런" : "홈런", direction: dir, canDriveIn: true, rank: 6 };
  }
  if (/3$/.test(code)) return { resultType: "HIT", hitKind: "3B", label: dir ? `${DIRECTION_NAME[dir]} 쪽 3루타` : "3루타", direction: dir, canDriveIn: true, rank: 5 };
  if (/2$/.test(code)) return { resultType: "HIT", hitKind: "2B", label: dir ? `${DIRECTION_NAME[dir]} 쪽 2루타` : "2루타", direction: dir, canDriveIn: true, rank: 4 };
  if (/안$/.test(code)) {
    const field = dir === "좌" ? "좌전" : dir === "우" ? "우전" : dir === "중" ? "중전" : null;
    return { resultType: "HIT", hitKind: "1B", label: field ? `${field} 안타` : "내야 안타", direction: dir, canDriveIn: true, rank: 3 };
  }
  if (/희비/.test(code)) return { resultType: "SACRIFICE", hitKind: null, label: "희생플라이", direction: dir, canDriveIn: true, rank: 2 };
  if (/희/.test(code)) return { resultType: "SACRIFICE", hitKind: null, label: "희생번트", direction: dir, canDriveIn: true, rank: 1 };
  if (/^4구$|볼넷/.test(code)) return { resultType: "WALK", hitKind: null, label: "밀어내기 볼넷", direction: null, canDriveIn: true, rank: 1 };
  if (/사구/.test(code)) return { resultType: "HBP", hitKind: null, label: "밀어내기 몸에 맞는 공", direction: null, canDriveIn: true, rank: 1 };
  if (/야선/.test(code)) return { resultType: "FIELDERS_CHOICE", hitKind: null, label: "야수선택", direction: null, canDriveIn: true, rank: 1 };
  if (/실/.test(code)) return { resultType: "ERROR", hitKind: null, label: "상대 실책", direction: null, canDriveIn: true, rank: 1 };
  if (/땅/.test(code)) return { resultType: "FIELDERS_CHOICE", hitKind: null, label: "땅볼 타점", direction: null, canDriveIn: true, rank: 1 };
  return null;
}

/** 경기별 직전에 본 타점 — 같은 서버 인스턴스 안에서만 (없으면 보수적으로 고른다) */
const lastRbi = new Map<string, Map<string, number>>();

async function fetchBoxScore(naverGameId: string, timeoutMs: number): Promise<{ away: Batter[]; home: Batter[] } | null> {
  const ids = naverToKboGameId(naverGameId);
  if (!ids) return null;
  const res = await fetch(KBO_BOXSCORE_URL, {
    method: "POST",
    headers: HEADERS,
    body: `leId=1&srId=${ids.seriesId}&seasonId=${ids.season}&gameId=${ids.kboGameId}`,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { arrHitter?: Array<Record<string, unknown>> };
  const blocks = json.arrHitter ?? [];
  if (blocks.length < 2) return null;
  // KBO 응답 순서: [0] 원정, [1] 홈
  return { away: parseBatters(blocks[0]!, "away"), home: parseBatters(blocks[1]!, "home") };
}

/**
 * 점수가 안 바뀐 회차에도 타점 기록을 미리 받아 둔다 — 다음 득점 때 "직전 타점"과 정확히 비교하려고.
 * check-score 가 응답 뒤(after)에 부른다.
 */
export async function rememberKboBoxScore(naverGameId: string): Promise<void> {
  const box = await fetchBoxScore(naverGameId, 4000).catch(() => null);
  if (box) lastRbi.set(naverGameId, new Map([...box.away, ...box.home].map((b) => [b.key, b.rbi])));
}

export async function fetchKboScoringContext(input: {
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
  const teamPrevScore = side === "home" ? input.previousHomeScore : input.previousAwayScore;

  // 득점한 팀의 공격 이닝: 원정은 지금 이닝(초/말 어느 쪽이든 같은 회), 홈은 '초'면 직전 회 말
  const n = game.currentInning;
  if (!n) return null;
  const inning = side === "away" ? n : game.currentInningHalf === "초" ? n - 1 : n;
  if (inning < 1) return null;
  const half = side === "away" ? "초" : "말";

  let box: { away: Batter[]; home: Batter[] } | null;
  try {
    box = await fetchBoxScore(game.externalId, input.timeoutMs ?? 2500);
  } catch {
    return null;
  }
  if (!box) return null;
  const batters = box[side];

  const before = lastRbi.get(game.externalId);
  lastRbi.set(game.externalId, new Map([...box.away, ...box.home].map((b) => [b.key, b.rbi])));

  const inInning = batters
    .map((b) => {
      const codes = b.inningResults.get(inning) ?? [];
      const outcomes = codes.map(parseOutcome).filter((o): o is Outcome => Boolean(o?.canDriveIn));
      return { b, outcome: outcomes.sort((x, y) => y.rank - x.rank)[0] ?? null };
    })
    .filter((x) => x.outcome);

  let pick: { b: Batter; outcome: Outcome; rbi: number } | null = null;
  const baseline = before ?? (teamPrevScore === 0 ? new Map<string, number>() : null);
  if (baseline) {
    const gained = inInning
      .map((x) => ({ ...x, rbi: x.b.rbi - (baseline.get(x.b.key) ?? 0) }))
      .filter((x) => x.rbi > 0);
    // 1분 사이에 두 타자가 연달아 타점을 올렸으면 더 큰 장면(홈런 > 장타 > 안타, 같으면 타점 많은 쪽)
    const best = gained.sort((x, y) => y.outcome!.rank - x.outcome!.rank || y.rbi - x.rbi)[0];
    if (best) pick = { b: best.b, outcome: best.outcome!, rbi: best.rbi };
  } else {
    const withRbi = inInning.filter((x) => x.b.rbi > 0);
    // 이닝에 타점성 결과가 한 명뿐이고 그 타자에게 타점이 있을 때만
    if (inInning.length === 1 && withRbi.length === 1) {
      pick = { b: withRbi[0]!.b, outcome: withRbi[0]!.outcome!, rbi: Math.min(withRbi[0]!.b.rbi, runs) };
    }
  }
  if (!pick) return null;

  const home = findTeam(game.homeTeam);
  const away = findTeam(game.awayTeam);
  const scoring = side === "home" ? home : away;
  const label = `${inning}회${half}`;
  const rbiText = pick.rbi > 0 ? ` ${pick.rbi}타점` : "";
  return {
    source: "kbo-boxscore",
    confidence: "high",
    gameId: game.externalId,
    inning: { number: inning, half, label, battingSide: side },
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
    batter: { name: pick.b.name, teamId: scoring.id, teamName: scoring.short, side },
    play: {
      rawTexts: [`${pick.b.name} ${pick.outcome.label}${rbiText}`],
      primaryText: `${pick.b.name} : ${pick.outcome.label}${rbiText}`,
      resultType: pick.outcome.resultType,
      resultLabel: pick.outcome.label,
      hitKind: pick.outcome.hitKind,
      rbi: pick.rbi > 0 ? pick.rbi : null,
      runsScored: runs,
      direction: pick.outcome.direction,
    },
  };
}
