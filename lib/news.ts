import { unstable_cache } from "next/cache";
import { TEAMS } from "@/lib/teams";
import { mapWithConcurrency } from "@/lib/concurrency";

/**
 * 우리 팀 소식 — 네이버 스포츠 야구 뉴스를 날짜별로 받아 Claude로 팀·태그를 분류한다.
 *
 *  - 네이버 뉴스 목록 API는 팀 필터가 동작하지 않아(팀 코드를 넣어도 같은 목록) 직접 분류한다.
 *    제목에 선수 이름만 나오는 기사가 많아 키워드 대신 LLM 분류를 쓴다.
 *  - 지난 날짜 분류 결과는 바뀌지 않으므로 하루 단위로 길게 캐시하고, 오늘만 30분마다 갱신한다.
 */

const NAVER_NEWS = "https://api-gw.sports.naver.com/news/articles/kbaseball";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 GroundBot/1.0";
const ANTHROPIC_MODEL = process.env.NEWS_LLM_MODEL ?? "claude-haiku-4-5";
const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const BATCH_SIZE = 40;
const CACHE_VERSION = "v1";

export const NEWS_TAGS = ["FA", "트레이드", "외국인", "코칭스태프", "계약", "부상", "은퇴·방출"] as const;
export type NewsTag = (typeof NEWS_TAGS)[number];

type RawArticle = {
  oid: string;
  aid: string;
  title: string;
  subContent?: string;
  sourceName: string;
  thumbnail?: string;
  dateTime: string;
};

type ClassifiedArticle = {
  id: string;
  title: string;
  source: string;
  thumbnail: string | null;
  url: string;
  dateTime: string;
  teams: string[];
  tag: NewsTag | null;
  story: string;
};

export type TeamNewsItem = {
  id: string;
  title: string;
  source: string;
  thumbnail: string | null;
  url: string;
  dateTime: string;
  tag: NewsTag | null;
  /** 같은 소식을 다룬 다른 기사 수 */
  relatedCount: number;
};

function kstDate(offsetDays = 0): string {
  return new Date(Date.now() + 9 * 3600_000 - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

async function fetchDayArticles(date: string, isToday: boolean): Promise<RawArticle[]> {
  const ymd = date.replaceAll("-", "");
  const all: RawArticle[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(
      `${NAVER_NEWS}?sort=latest&date=${ymd}&page=${page}&pageSize=${PAGE_SIZE}`,
      {
        headers: { "User-Agent": UA, Referer: "https://m.sports.naver.com/" },
        next: { revalidate: isToday ? 1800 : 86_400 },
      }
    );
    if (!res.ok) break;
    const json = (await res.json()) as { result?: { newsList?: RawArticle[] } };
    const list = json.result?.newsList ?? [];
    all.push(...list);
    if (list.length < PAGE_SIZE) break;
  }
  return all;
}

const TEAM_GUIDE = TEAMS.map((t) => `${t.id}=${t.name}`).join(", ");

type LlmRow = { i: number; teams?: string[]; tag?: string | null; story?: string };

/** 실패하면 null — 호출 측이 예외로 바꿔 실패 결과가 캐시되지 않게 한다. */
async function classifyBatch(batch: RawArticle[]): Promise<LlmRow[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const lines = batch
    .map((a, i) => `${i}\t${a.title}\t${(a.subContent ?? "").replace(/\s+/g, " ").slice(0, 140)}`)
    .join("\n");

  const prompt = `KBO 야구 기사 목록이다. 각 줄은 "번호\\t제목\\t본문 앞부분"이다.
기사마다 아래를 판단해 JSON 배열로만 답해라. 설명은 쓰지 마라.

- teams: 기사의 주인공 구단 id 배열. 구단: ${TEAM_GUIDE}
  선수·감독 이름만 나와도 소속 구단을 넣는다. 트레이드처럼 두 구단이 걸리면 둘 다.
  리그 전체 이야기(국가대표, 규정, 시상식 일반)거나 확실하지 않으면 [].
- tag: ${NEWS_TAGS.join(", ")} 중 하나, 해당 없으면 null.
  (외국인=외국인 선수 영입·재계약, 코칭스태프=감독·코치 선임/교체, 계약=FA 외 연봉·다년 계약)
- story: 같은 사건을 다룬 기사끼리 같아지도록 쓴 짧은 키. "선수명 사건" 형태 (예: "강백호 FA 계약").

형식: [{"i":0,"teams":["kia"],"tag":null,"story":"김도영 만루홈런"}, ...]

${lines}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.warn("[news] classify failed:", res.status);
      return null;
    }
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = json.content?.find((c) => c.type === "text")?.text ?? "";
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start < 0 || end <= start) return null;
    return JSON.parse(text.slice(start, end + 1)) as LlmRow[];
  } catch (err) {
    console.warn("[news] classify error:", (err as Error).message);
    return null;
  }
}

const TEAM_IDS = new Set(TEAMS.map((t) => t.id));

function toClassified(a: RawArticle, row?: LlmRow): ClassifiedArticle {
  const tag = NEWS_TAGS.includes(row?.tag as NewsTag) ? (row!.tag as NewsTag) : null;
  return {
    id: `${a.oid}-${a.aid}`,
    title: a.title,
    source: a.sourceName,
    thumbnail: a.thumbnail ?? null,
    url: `https://m.sports.naver.com/kbaseball/article/${a.oid}/${a.aid}`,
    dateTime: a.dateTime,
    teams: (row?.teams ?? []).filter((t) => TEAM_IDS.has(t)),
    tag,
    story: (row?.story ?? a.title).replace(/\s+/g, " ").trim(),
  };
}

/** LLM 분류가 실패했을 때의 대체 — 제목의 구단명·애칭만 본다 (선수 이름만 나온 기사는 놓친다). */
const TEAM_KEYWORDS: Record<string, RegExp> = {
  lg: /LG|트윈스/,
  kt: /KT|위즈/,
  kia: /KIA|타이거즈/,
  samsung: /삼성|라이온즈/,
  doosan: /두산|베어스/,
  ssg: /SSG|랜더스/,
  lotte: /롯데|자이언츠/,
  nc: /NC|다이노스/,
  hanwha: /한화|이글스/,
  kiwoom: /키움|히어로즈/,
};
const TAG_KEYWORDS: Array<[NewsTag, RegExp]> = [
  ["FA", /FA/],
  ["트레이드", /트레이드/],
  ["외국인", /외국인|외인/],
  ["코칭스태프", /감독|코치/],
  ["은퇴·방출", /은퇴|방출/],
  ["부상", /부상|수술/],
  ["계약", /계약|연봉/],
];

function classifyByKeyword(a: RawArticle): ClassifiedArticle {
  return toClassified(a, {
    i: 0,
    teams: Object.entries(TEAM_KEYWORDS)
      .filter(([, re]) => re.test(a.title))
      .map(([id]) => id),
    tag: TAG_KEYWORDS.find(([, re]) => re.test(a.title))?.[0] ?? null,
  });
}

/**
 * 기사 묶음 하나를 분류. 묶음에 든 기사 id 조합으로 캐시하므로 같은 기사를 두 번 분류하지 않는다.
 * 실패하면 예외 → 캐시되지 않고, 이번 요청만 키워드 분류로 대체한다.
 */
function classifyBatchCached(batch: RawArticle[]): Promise<ClassifiedArticle[]> {
  const ids = batch.map((a) => `${a.oid}-${a.aid}`).join(",");
  return unstable_cache(
    async () => {
      const rows = await classifyBatch(batch);
      if (!rows) throw new Error("news classification failed");
      const byIndex = new Map(rows.map((r) => [r.i, r]));
      return batch.map((a, i) => toClassified(a, byIndex.get(i)));
    },
    ["team-news-batch", CACHE_VERSION, ids],
    { revalidate: 14 * 86_400 }
  )().catch((err) => {
    console.warn("[news] LLM 분류 실패, 키워드로 대체:", (err as Error).message);
    return batch.map(classifyByKeyword);
  });
}

/**
 * 하루치 기사를 오래된 순으로 BATCH_SIZE씩 묶어 분류한다.
 * 오래된 순으로 묶어야 새 기사가 들어와도 앞쪽 묶음이 그대로라 캐시가 유지되고, 마지막 묶음만 다시 분류된다.
 */
async function classifyDay(date: string): Promise<ClassifiedArticle[]> {
  const raw = await fetchDayArticles(date, date === kstDate());
  const sorted = [...raw].sort((x, y) =>
    x.dateTime === y.dateTime ? x.aid.localeCompare(y.aid) : x.dateTime.localeCompare(y.dateTime)
  );
  const batches: RawArticle[][] = [];
  for (let i = 0; i < sorted.length; i += BATCH_SIZE) batches.push(sorted.slice(i, i + BATCH_SIZE));
  const results = await mapWithConcurrency(batches, 4, classifyBatchCached);
  return results.flat();
}

function storyKey(story: string): string {
  return story.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

/**
 * 최근 days일 우리 팀 소식. 같은 소식은 가장 최근 기사 하나로 묶고,
 * 태그가 붙은 굵직한 소식을 먼저, 나머지는 최신순으로 정렬한다.
 */
export async function getTeamNews(teamId: string, days = 7): Promise<TeamNewsItem[]> {
  const dates = Array.from({ length: days }, (_, i) => kstDate(i));
  const perDay = await mapWithConcurrency(dates, 3, (d) =>
    classifyDay(d).catch(() => [] as ClassifiedArticle[])
  );

  const groups = new Map<string, ClassifiedArticle[]>();
  for (const a of perDay.flat()) {
    if (!a.teams.includes(teamId)) continue;
    const key = storyKey(a.story);
    const list = groups.get(key);
    if (list) list.push(a);
    else groups.set(key, [a]);
  }

  const items: TeamNewsItem[] = [...groups.values()].map((list) => {
    list.sort((x, y) => y.dateTime.localeCompare(x.dateTime));
    const lead = list.find((a) => a.thumbnail) ?? list[0]!;
    return {
      id: lead.id,
      title: lead.title,
      source: lead.source,
      thumbnail: lead.thumbnail,
      url: lead.url,
      dateTime: list[0]!.dateTime,
      tag: list.find((a) => a.tag)?.tag ?? null,
      relatedCount: list.length - 1,
    };
  });

  return items.sort((x, y) => {
    if (Boolean(x.tag) !== Boolean(y.tag)) return x.tag ? -1 : 1;
    return y.dateTime.localeCompare(x.dateTime);
  });
}

export type TeamNewsPage = {
  items: TeamNewsItem[];
  /** 필터 전 전체 소식에 실제로 있는 태그 (NEWS_TAGS 순서) — 필터 칩용 */
  tags: NewsTag[];
  /** 필터 적용 후 전체 개수 */
  total: number;
  /** 다음 페이지 시작 위치, 끝이면 null */
  nextOffset: number | null;
};

/** getTeamNews 결과를 태그로 거르고 offset/limit으로 자른다. limit이 없으면 끝까지. */
export function pageTeamNews(
  all: TeamNewsItem[],
  { tag, offset = 0, limit }: { tag?: NewsTag | null; offset?: number; limit?: number }
): TeamNewsPage {
  const tags = NEWS_TAGS.filter((t) => all.some((i) => i.tag === t));
  const filtered = tag ? all.filter((i) => i.tag === tag) : all;
  const end = limit ? offset + limit : filtered.length;
  return {
    items: filtered.slice(offset, end),
    tags,
    total: filtered.length,
    nextOffset: end < filtered.length ? end : null,
  };
}
