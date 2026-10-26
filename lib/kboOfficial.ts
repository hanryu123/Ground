/**
 * KBO 공식 사이트(koreabaseball.com) 경기 목록 — 실시간 점수·경기 상태의 1순위 출처.
 *
 * 2026-10-26 부터 네이버 스포츠 API(api-gw.sports.naver.com)가 Vercel 서버(미국·서울 모두)의 요청을 막아
 * 점수 알림이 하나도 나가지 않았다. KBO 공식 API 는 같은 서버에서 정상이라 이쪽을 먼저 쓰고 네이버는 예비로 둔다.
 *
 * 경기 ID 는 기존 코드·DB 가 쓰는 네이버 형식으로 바꿔서 돌려준다.
 *   KBO  "20261026HTSS0" (SR_ID 5 = 플레이오프)
 *   네이버 "55551026HTSS02026" — 정규시즌은 연도, 포스트시즌은 SR_ID 를 네 번 반복한 앞자리 + 월일·팀·더블헤더 + 시즌
 */

const KBO_GAME_LIST_URL = "https://www.koreabaseball.com/ws/Main.asmx/GetKboGameList";
const KBO_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "x-requested-with": "XMLHttpRequest",
  referer: "https://www.koreabaseball.com/Schedule/Schedule.aspx",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
};
/** 정규시즌(0), 시범(1), 포스트시즌(3 준PO, 4 WC, 5 PO, 7 KS) 등 모두 */
const SERIES_IDS = "0,1,3,4,5,6,7,8,9";

export type KboOfficialGame = {
  /** 네이버 형식 경기 ID */
  gameId: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
  /** 네이버와 같은 팀 코드 (HT, SS, LG, OB …) */
  homeTeamCode: string;
  awayTeamCode: string;
  stadium: string;
  /** BEFORE | STARTED | RESULT | CANCEL | SUSPENDED */
  statusCode: string;
  cancel: boolean;
  /** "9회말", "우천취소" 처럼 네이버 statusInfo 와 같은 결 */
  statusInfo: string;
  inning: number | null;
  inningHalf: "초" | "말" | null;
  homeScore: number;
  awayScore: number;
  homeStarterName: string | null;
  awayStarterName: string | null;
  winningPitcherName: string | null;
  losingPitcherName: string | null;
  savePitcherName: string | null;
};

type KboRaw = {
  G_ID?: string;
  G_DT?: string;
  G_TM?: string;
  SR_ID?: number;
  SEASON_ID?: number;
  S_NM?: string;
  HOME_ID?: string;
  AWAY_ID?: string;
  GAME_STATE_SC?: string;
  CANCEL_SC_ID?: string;
  CANCEL_SC_NM?: string;
  GAME_INN_NO?: number | null;
  GAME_TB_SC?: string | null;
  T_SCORE_CN?: string | number;
  B_SCORE_CN?: string | number;
  T_PIT_P_NM?: string | null;
  B_PIT_P_NM?: string | null;
  W_PIT_P_NM?: string | null;
  L_PIT_P_NM?: string | null;
  SV_PIT_P_NM?: string | null;
};

function clean(name: string | null | undefined): string | null {
  const t = (name ?? "").trim();
  return t ? t : null;
}

function toNumber(v: string | number | undefined): number {
  const n = typeof v === "number" ? v : Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : 0;
}

export function kboToNaverGameId(kboGameId: string, seriesId: number, season: number): string {
  const prefix = seriesId === 0 || seriesId === 1 ? kboGameId.slice(0, 4) : String(seriesId).repeat(4);
  return `${prefix}${kboGameId.slice(4)}${season}`;
}

function adapt(raw: KboRaw): KboOfficialGame | null {
  if (!raw.G_ID || !raw.G_DT || !raw.HOME_ID || !raw.AWAY_ID) return null;
  const season = raw.SEASON_ID ?? Number(raw.G_DT.slice(0, 4));
  const cancelName = clean(raw.CANCEL_SC_NM) ?? "";
  const cancelled = raw.GAME_STATE_SC === "4" || (raw.CANCEL_SC_ID != null && raw.CANCEL_SC_ID !== "0" && /취소/.test(cancelName));
  const suspended = !cancelled && /중단|서스펜디드/.test(cancelName);
  const statusCode = cancelled
    ? "CANCEL"
    : suspended
      ? "SUSPENDED"
      : raw.GAME_STATE_SC === "2"
        ? "STARTED"
        : raw.GAME_STATE_SC === "3"
          ? "RESULT"
          : "BEFORE";
  const inning = statusCode === "STARTED" || statusCode === "RESULT" || statusCode === "SUSPENDED"
    ? raw.GAME_INN_NO ?? null
    : null;
  const inningHalf = inning ? (raw.GAME_TB_SC === "B" ? "말" : raw.GAME_TB_SC === "T" ? "초" : null) : null;
  const statusInfo = cancelled
    ? cancelName || "경기취소"
    : suspended
      ? cancelName
      : inning
        ? `${inning}회${inningHalf ?? ""}`
        : statusCode === "RESULT"
          ? "경기종료"
          : "경기전";
  return {
    gameId: kboToNaverGameId(raw.G_ID, raw.SR_ID ?? 0, season),
    date: `${raw.G_DT.slice(0, 4)}-${raw.G_DT.slice(4, 6)}-${raw.G_DT.slice(6, 8)}`,
    time: raw.G_TM ?? "00:00",
    homeTeamCode: raw.HOME_ID,
    awayTeamCode: raw.AWAY_ID,
    stadium: clean(raw.S_NM) ?? "",
    statusCode,
    cancel: cancelled,
    statusInfo,
    inning,
    inningHalf,
    // KBO 는 원정(T, 초)·홈(B, 말)
    homeScore: toNumber(raw.B_SCORE_CN),
    awayScore: toNumber(raw.T_SCORE_CN),
    homeStarterName: clean(raw.B_PIT_P_NM),
    awayStarterName: clean(raw.T_PIT_P_NM),
    winningPitcherName: clean(raw.W_PIT_P_NM),
    losingPitcherName: clean(raw.L_PIT_P_NM),
    savePitcherName: clean(raw.SV_PIT_P_NM),
  };
}

const memo = new Map<string, { at: number; value: Promise<KboOfficialGame[]> }>();

/**
 * 하루치 경기 (YYYY-MM-DD). live 면 매번 새로 받고, 아니면 같은 인스턴스에서 maxAgeMs 동안 재사용한다.
 * 실패하면 예외 — 호출하는 쪽이 네이버 등 예비 출처로 넘어간다.
 */
export function fetchKboOfficialDay(
  date: string,
  options: { live?: boolean; timeoutMs?: number; maxAgeMs?: number } = {}
): Promise<KboOfficialGame[]> {
  const maxAgeMs = options.live ? 0 : options.maxAgeMs ?? 60_000;
  const hit = memo.get(date);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.value;
  const value = (async () => {
    const res = await fetch(KBO_GAME_LIST_URL, {
      method: "POST",
      headers: KBO_HEADERS,
      body: `leId=1&srId=${SERIES_IDS}&date=${date.replaceAll("-", "")}`,
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 4000),
    });
    if (!res.ok) throw new Error(`kbo official HTTP ${res.status}`);
    const json = (await res.json()) as { code?: string; game?: KboRaw[] };
    if (json.code !== "100" || !Array.isArray(json.game)) throw new Error(`kbo official code ${json.code ?? "?"}`);
    return json.game.map(adapt).filter((g): g is KboOfficialGame => Boolean(g));
  })();
  memo.set(date, { at: Date.now(), value });
  value.catch(() => memo.delete(date));
  return value;
}

/** 날짜 범위(포함) — 하루씩 나눠 동시에 받는다. 하루라도 실패하면 예외 */
export async function fetchKboOfficialRange(
  fromDate: string,
  toDate: string,
  options: { live?: boolean; timeoutMs?: number } = {}
): Promise<KboOfficialGame[]> {
  const dates: string[] = [];
  for (let d = new Date(`${fromDate}T00:00:00Z`); d <= new Date(`${toDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
    if (dates.length > 62) break;
  }
  const days = await Promise.all(dates.map((date) => fetchKboOfficialDay(date, options)));
  return days.flat();
}

// ────────────────────────────────────────────────────────────────────
// 시즌 일정 — 월별 일정표(GetScheduleList). 결과·취소·포스트시즌 차전까지 나온다.
// ────────────────────────────────────────────────────────────────────

const KBO_SCHEDULE_URL = "https://www.koreabaseball.com/ws/Schedule.asmx/GetScheduleList";
/** 정규시즌 계열 / 포스트시즌 계열 */
const SCHEDULE_SERIES = ["0,9,6", "3,4,5,7"] as const;

type ScheduleCell = { Text?: string | null; Class?: string | null };

function stripTags(html: string | null | undefined): string {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** "PO 1차전" → 5 같은 포스트시즌 SR_ID (네이버 경기 ID 앞자리) */
function postseasonSeriesId(remark: string): number {
  if (/준\s*PO|준플레이오프/.test(remark)) return 3;
  if (/WC|와일드카드/.test(remark)) return 4;
  if (/KS|한국시리즈/.test(remark)) return 7;
  if (/PO|플레이오프/.test(remark)) return 5;
  return 0;
}

function parseScheduleRows(
  rows: Array<{ row?: ScheduleCell[] }>,
  year: number,
  postseason: boolean
): KboOfficialGame[] {
  const out: KboOfficialGame[] = [];
  let currentDate: string | null = null;
  for (const { row } of rows) {
    if (!row) continue;
    const dayCell = row.find((c) => c.Class === "day");
    const dayMatch = dayCell ? /(\d{2})\.(\d{2})/.exec(stripTags(dayCell.Text)) : null;
    if (dayMatch) currentDate = `${year}-${dayMatch[1]}-${dayMatch[2]}`;
    const playIdx = row.findIndex((c) => c.Class === "play");
    if (playIdx < 0 || !currentDate) continue;
    const kboGameId = /gameId=(\w{13})/.exec(JSON.stringify(row))?.[1];
    if (!kboGameId) continue;
    const time = /(\d{2}:\d{2})/.exec(stripTags(row.find((c) => c.Class === "time")?.Text))?.[1] ?? "00:00";
    const stadium = stripTags(row[playIdx + 5]?.Text);
    const remark = stripTags(row[playIdx + 6]?.Text);
    const scores = [...(row[playIdx]?.Text ?? "").matchAll(/<span class="(?:win|lose|same)">(\d+)<\/span>/g)].map((m) =>
      Number(m[1])
    );
    const cancelled = /취소/.test(remark);
    const finished = !cancelled && scores.length === 2;
    const seriesId = postseason ? postseasonSeriesId(remark) || 5 : 0;
    out.push({
      gameId: kboToNaverGameId(kboGameId, seriesId, year),
      date: currentDate,
      time,
      awayTeamCode: kboGameId.slice(8, 10),
      homeTeamCode: kboGameId.slice(10, 12),
      stadium,
      statusCode: cancelled ? "CANCEL" : finished ? "RESULT" : "BEFORE",
      cancel: cancelled,
      statusInfo: cancelled ? remark : finished ? "경기종료" : "경기전",
      inning: null,
      inningHalf: null,
      awayScore: finished ? scores[0]! : 0,
      homeScore: finished ? scores[1]! : 0,
      homeStarterName: null,
      awayStarterName: null,
      winningPitcherName: null,
      losingPitcherName: null,
      savePitcherName: null,
    });
  }
  return out;
}

async function fetchScheduleMonth(year: number, month: number, series: string): Promise<KboOfficialGame[]> {
  const res = await fetch(KBO_SCHEDULE_URL, {
    method: "POST",
    headers: KBO_HEADERS,
    body: `leId=1&srIdList=${series}&seasonId=${year}&gameMonth=${String(month).padStart(2, "0")}&teamId=`,
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`kbo schedule HTTP ${res.status}`);
  const json = (await res.json()) as { rows?: Array<{ row?: ScheduleCell[] }> };
  return parseScheduleRows(json.rows ?? [], year, series !== SCHEDULE_SERIES[0]);
}

const seasonMemo = new Map<number, { at: number; value: Promise<KboOfficialGame[]> }>();

/**
 * 한 시즌 전체 일정 (3~11월, 정규시즌 + 포스트시즌). 같은 인스턴스에서 5분 재사용.
 * 오늘 경기는 일정표에 진행 중 점수가 끝난 경기처럼 보일 수 있어 하루치 실시간 목록으로 덮어쓴다.
 */
export function fetchKboOfficialSeason(year: number): Promise<KboOfficialGame[]> {
  const hit = seasonMemo.get(year);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.value;
  const value = (async () => {
    const jobs: Array<Promise<KboOfficialGame[]>> = [];
    for (let month = 3; month <= 11; month++) {
      for (const series of SCHEDULE_SERIES) jobs.push(fetchScheduleMonth(year, month, series));
    }
    const games = (await Promise.all(jobs)).flat();
    if (games.length === 0) throw new Error(`kbo schedule empty: ${year}`);
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    if (games.some((g) => g.date === today)) {
      const live = await fetchKboOfficialDay(today).catch(() => null);
      if (live) {
        const byId = new Map(live.map((g) => [g.gameId, g]));
        return games.map((g) => byId.get(g.gameId) ?? g);
      }
    }
    return games;
  })();
  seasonMemo.set(year, { at: Date.now(), value });
  value.catch(() => seasonMemo.delete(year));
  return value;
}
