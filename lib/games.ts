/**
 * KBO 경기 데이터 (목업)
 *
 * - TODAY_GAMES   : 아직 결과 없음 (선발 투수만 표기)
 * - TOMORROW_GAMES: 미경기
 * - PAST_GAMES    : 지난 7일 (D-7 ~ D-1) 결과 포함. djb2 시드 기반 결정론적 더미 데이터.
 *
 * 추후 KBO 결과 API 연결 시 PAST_GAMES 만 fetch 결과로 교체하면 된다 (인터페이스 동일).
 */

import { findTeam } from "@/lib/teams";

export type GameResult = {
  awayScore: number;
  homeScore: number;
  /** 승팀 id. null 이면 무승부. */
  winnerId: string | null;
  /** 승리 투수 (없으면 무승부) */
  winningPitcher?: string;
  /** 패전 투수 (없으면 무승부) */
  losingPitcher?: string;
  /** 세이브 투수 (옵션, 추후 연동 시 사용) */
  savePitcher?: string;
};

export type Game = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  homeId: string;
  awayId: string;
  stadium: string;
  homePitcher: string;
  awayPitcher: string;
  /** 경기가 종료된 경우에만 존재. 미경기/예정엔 undefined. */
  result?: GameResult;
  /** 종료 경기 하이라이트(유튜브 등). 없으면 UI에서 숨김. */
  highlightUrl?: string;
};

// ───────────────────────────────────────────────────────────────────────
// TODAY / TOMORROW (수동 큐레이션)
// ───────────────────────────────────────────────────────────────────────

export const TODAY_GAMES: Game[] = [
  {
    id: "g1",
    date: "2026-04-19",
    time: "14:00",
    awayId: "ssg",
    homeId: "kt",
    stadium: "수원 KT 위즈 파크",
    awayPitcher: "김광현",
    homePitcher: "고영표",
  },
  {
    id: "g2",
    date: "2026-04-19",
    time: "18:30",
    awayId: "samsung",
    homeId: "lg",
    stadium: "대구 라이온즈 파크",
    awayPitcher: "원태인",
    homePitcher: "임찬규",
  },
  {
    id: "g3",
    date: "2026-04-19",
    time: "14:00",
    awayId: "kia",
    homeId: "lotte",
    stadium: "사직 야구장",
    awayPitcher: "양현종",
    homePitcher: "박세웅",
  },
  {
    id: "g4",
    date: "2026-04-19",
    time: "17:00",
    awayId: "hanwha",
    homeId: "kiwoom",
    stadium: "고척 스카이돔",
    awayPitcher: "문동주",
    homePitcher: "안우진",
  },
  {
    id: "g5",
    date: "2026-04-19",
    time: "17:00",
    awayId: "doosan",
    homeId: "nc",
    stadium: "창원 NC 파크",
    awayPitcher: "곽빈",
    homePitcher: "페디",
  },
];

export const TOMORROW_GAMES: Game[] = [
  {
    id: "t1",
    date: "2026-04-20",
    time: "14:00",
    awayId: "nc",
    homeId: "hanwha",
    stadium: "대전 한화생명 이글스파크",
    awayPitcher: "신민혁",
    homePitcher: "류현진",
  },
  {
    id: "t2",
    date: "2026-04-20",
    time: "17:00",
    awayId: "kiwoom",
    homeId: "lotte",
    stadium: "사직 야구장",
    awayPitcher: "헤이수스",
    homePitcher: "윌커슨",
  },
];

// ───────────────────────────────────────────────────────────────────────
// PAST_GAMES — 지난 7일 (D-7 ~ D-1) 결과 포함 더미
// ───────────────────────────────────────────────────────────────────────

const TODAY_BASE_DATE = "2026-04-19";

const TEAM_ROTATION = [
  "lg",
  "doosan",
  "kia",
  "samsung",
  "ssg",
  "kt",
  "lotte",
  "hanwha",
  "nc",
  "kiwoom",
] as const;

const STADIUM_BY_HOME: Record<string, string> = {
  lg: "잠실 야구장",
  doosan: "잠실 야구장",
  kia: "광주 챔피언스 필드",
  samsung: "대구 라이온즈 파크",
  ssg: "인천 SSG 랜더스 필드",
  kt: "수원 KT 위즈 파크",
  lotte: "사직 야구장",
  hanwha: "대전 한화생명 이글스파크",
  nc: "창원 NC 파크",
  kiwoom: "고척 스카이돔",
};

/** 팀별 투수 풀 — 시드 해시로 인덱스해서 W/L 투수를 뽑는다. */
const ROSTER: Record<string, string[]> = {
  lg: ["임찬규", "켈리", "엔스", "최원태"],
  doosan: ["곽빈", "최원준", "발라조빅", "김유성"],
  kia: ["양현종", "이의리", "네일", "황동하"],
  samsung: ["원태인", "코너", "후라도", "이승현"],
  ssg: ["김광현", "엘리아스", "더거", "송영진"],
  kt: ["고영표", "벤자민", "쿠에바스", "엄상백"],
  lotte: ["박세웅", "윌커슨", "반즈", "김진욱"],
  hanwha: ["문동주", "류현진", "와이스", "김민우"],
  nc: ["페디", "신민혁", "하트", "이용찬"],
  kiwoom: ["안우진", "헤이수스", "조영건", "후라도"],
};

/** 같은 (date+pair) 조합엔 항상 같은 결과/스코어 → 새로고침해도 흔들리지 않음 */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * 공식 영상 ID가 없을 때 — 유튜브 **검색**으로 연결 (가짜 watch?v= 링크는 영상 없음).
 * 날짜·원정·홈 약칭으로 쿼리를 고정해 같은 경기면 항상 같은 검색 URL.
 */
export function youtubeKboHighlightSearchUrl(
  game: Pick<Game, "date" | "awayId" | "homeId">
): string {
  const away = findTeam(game.awayId).short;
  const home = findTeam(game.homeId).short;
  const q = `KBO ${game.date} ${away} ${home} 하이라이트`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

/**
 * 스케줄 등에서 쓰는 종료 경기 하이라이트 링크 — 현재는 유튜브 검색(위 함수와 동일).
 * 나중에 네이버/유튜브 고정 VOD URL 필드가 생기면 그 값을 우선 쓰고, 없을 때만 이걸 붙이면 된다.
 */
export function highlightUrlForFinishedGame(
  game: Pick<Game, "date" | "awayId" | "homeId">
): string {
  return youtubeKboHighlightSearchUrl(game);
}

/** UTC 기준 ISO 날짜를 일자 단위로 이동 (시간대 영향 없음) */
function shiftIsoDate(iso: string, deltaDays: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * 라운드로빈 풍 매칭. dayIdx 만큼 회전시켜 매일 다른 매치업이 만들어진다.
 * 결과는 5경기/일 (10팀 ÷ 2).
 */
function pairsForDay(dayIdx: number): Array<[string, string]> {
  const ids = [...TEAM_ROTATION] as string[];
  const shift = ((dayIdx % ids.length) + ids.length) % ids.length;
  for (let i = 0; i < shift; i++) ids.push(ids.shift()!);
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < ids.length; i += 2) pairs.push([ids[i], ids[i + 1]]);
  return pairs;
}

const PAST_TIME_SLOTS = ["14:00", "17:00", "18:30", "18:30", "18:30"];

function buildPastGames(): Game[] {
  const out: Game[] = [];
  // D-7 → D-1 (오래된 날짜가 위로 올라가도록 ascending)
  for (let delta = -7; delta <= -1; delta++) {
    const date = shiftIsoDate(TODAY_BASE_DATE, delta);
    const pairs = pairsForDay(-delta); // 1..7
    pairs.forEach(([away, home], i) => {
      const seed = djb2(`${date}|${away}|${home}`);
      const awayScore = (seed % 9) + 1; // 1..9
      const homeScore = ((seed >> 4) % 9) + 1; // 1..9
      const winnerId =
        awayScore === homeScore ? null : awayScore > homeScore ? away : home;

      const awayRot = ROSTER[away] ?? ["TBD"];
      const homeRot = ROSTER[home] ?? ["TBD"];
      const awayStarter = awayRot[seed % awayRot.length];
      const homeStarter = homeRot[(seed >> 2) % homeRot.length];

      const winningPitcher =
        winnerId === away
          ? awayStarter
          : winnerId === home
            ? homeStarter
            : undefined;
      const losingPitcher =
        winnerId === away
          ? homeStarter
          : winnerId === home
            ? awayStarter
            : undefined;

      out.push({
        id: `p-${date}-${i}`,
        date,
        time: PAST_TIME_SLOTS[i] ?? "18:30",
        awayId: away,
        homeId: home,
        stadium: STADIUM_BY_HOME[home] ?? "TBD",
        awayPitcher: awayStarter,
        homePitcher: homeStarter,
        result: {
          awayScore,
          homeScore,
          winnerId,
          winningPitcher,
          losingPitcher,
        },
        highlightUrl: youtubeKboHighlightSearchUrl({
          date,
          awayId: away,
          homeId: home,
        }),
      });
    });
  }
  return out;
}

/** 지난 7일 (D-7 ~ D-1) 결과 포함 경기들. 모듈 로드 시 1회 계산. */
export const PAST_GAMES: Game[] = buildPastGames();
