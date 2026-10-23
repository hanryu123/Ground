import { prisma } from "@/lib/prisma";
import { canSpendLlm, ensureLlmTables, recordLlmUsage } from "@/lib/llmBudget";
import { TEAMS } from "@/lib/teams";
import { mapWithConcurrency } from "@/lib/concurrency";

/**
 * 우리 팀 소식 — 네이버 스포츠 야구 뉴스를 날짜별로 받아 Claude로 팀·태그를 분류한다.
 *
 *  - 네이버 뉴스 목록 API는 팀 필터가 동작하지 않아(팀 코드를 넣어도 같은 목록) 직접 분류한다.
 *    제목에 선수 이름만 나오는 기사가 많아 키워드 대신 LLM 분류를 쓴다.
 *  - 분류 결과는 기사별로 DB 에 저장해 한 번만 분류한다. Claude 호출은 lib/llmBudget 예산 안에서만.
 */

const NAVER_NEWS = "https://api-gw.sports.naver.com/news/articles/kbaseball";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 GroundBot/1.0";
const ANTHROPIC_MODEL = process.env.NEWS_LLM_MODEL ?? "claude-haiku-5-5";
const PAGE_SIZE = 100;
const MAX_PAGES = 5;
const BATCH_SIZE = 50;

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

type LlmRow = { i: number; teams: string[]; tag: string | null; story: string };

/**
 * 기사 묶음을 Claude 로 분류. 실패·예산 초과면 null.
 * 비용을 줄이려고 제목만 보내고, 답은 JSON 대신 한 줄 형식("번호|구단들|태그|사건")으로 받는다.
 */
async function classifyBatch(batch: RawArticle[]): Promise<LlmRow[] | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !(await canSpendLlm("news"))) return null;

  const lines = batch.map((a, i) => `${i}\t${a.title.replace(/\s+/g, " ")}`).join("\n");
  const prompt = `KBO 야구 기사 제목 목록이다. 각 줄은 "번호\\t제목"이다.
기사마다 한 줄씩 "번호|구단|태그|사건" 형식으로만 답해라. 다른 말은 쓰지 마라.

- 구단: 기사의 주인공 구단 id, 여럿이면 쉼표로. 구단: ${TEAM_GUIDE}
  선수·감독 이름만 나와도 소속 구단을 쓴다. 리그 전체 이야기거나 확실하지 않으면 비운다.
- 태그: ${NEWS_TAGS.join(", ")} 중 하나, 해당 없으면 비운다.
  (외국인=외국인 선수 영입·재계약, 코칭스태프=감독·코치 선임/교체, 계약=FA 외 연봉·다년 계약)
- 사건: 같은 사건을 다룬 기사끼리 같아지도록 쓴 짧은 키, "선수명 사건" 형태.

예: 0|kia|FA|김도영 FA 계약

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
        max_tokens: 3000,
        // Haiku 5.5 는 기본으로 생각(thinking)을 켠다 — 단순 분류라 끄고 출력 토큰을 아낀다
        thinking: { type: "disabled" },
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[news] classify failed:", res.status, body.slice(0, 300));
      return null;
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: Parameters<typeof recordLlmUsage>[2];
    };
    void recordLlmUsage("news", ANTHROPIC_MODEL, json.usage);
    const text = json.content?.find((c) => c.type === "text")?.text ?? "";
    const rows: LlmRow[] = [];
    for (const line of text.split("\n")) {
      const [idx, teams = "", tag = "", story = ""] = line.split("|").map((x) => x.trim());
      const i = Number(idx);
      if (!Number.isInteger(i) || i < 0 || i >= batch.length) continue;
      rows.push({ i, teams: teams ? teams.split(",").map((t) => t.trim()) : [], tag: tag || null, story });
    }
    return rows.length > 0 ? rows : null;
  } catch (err) {
    console.warn("[news] classify error:", (err as Error).message);
    return null;
  }
}

const TEAM_IDS = new Set(TEAMS.map((t) => t.id));

type StoredClass = { teams: string[]; tag: NewsTag | null; story: string };

function toClassified(a: RawArticle, c?: StoredClass): ClassifiedArticle {
  return {
    id: `${a.oid}-${a.aid}`,
    title: a.title,
    source: a.sourceName,
    thumbnail: a.thumbnail ?? null,
    url: `https://m.sports.naver.com/kbaseball/article/${a.oid}/${a.aid}`,
    dateTime: a.dateTime,
    teams: c?.teams ?? [],
    tag: c?.tag ?? null,
    story: (c?.story || a.title).replace(/\s+/g, " ").trim(),
  };
}

function normalizeRow(row: LlmRow): StoredClass {
  return {
    teams: row.teams.filter((t) => TEAM_IDS.has(t)),
    tag: NEWS_TAGS.includes(row.tag as NewsTag) ? (row.tag as NewsTag) : null,
    story: row.story,
  };
}

/**
 * LLM 분류가 실패했을 때의 대체 — 제목의 구단명·애칭만 본다 (선수 이름만 나온 기사는 놓친다).
 * 영문 약칭은 다른 영단어 안에 든 경우(NCT 등)를 피하려고 앞뒤가 영문자가 아닐 때만 본다.
 */
export const TEAM_KEYWORDS: Record<string, RegExp> = {
  lg: /(?<![A-Za-z])LG(?![A-Za-z])|트윈스/,
  kt: /(?<![A-Za-z])KT(?![A-Za-z])|위즈/,
  kia: /(?<![A-Za-z])KIA(?![A-Za-z])|타이거즈/,
  samsung: /삼성|라이온즈/,
  doosan: /두산|베어스/,
  ssg: /(?<![A-Za-z])SSG(?![A-Za-z])|랜더스/,
  lotte: /롯데|자이언츠/,
  nc: /(?<![A-Za-z])NC(?![A-Za-z])|다이노스/,
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

function classifyByKeyword(a: RawArticle): StoredClass {
  return {
    teams: Object.entries(TEAM_KEYWORDS)
      .filter(([, re]) => re.test(a.title))
      .map(([id]) => id),
    tag: TAG_KEYWORDS.find(([, re]) => re.test(a.title))?.[0] ?? null,
    story: a.title,
  };
}

async function loadStored(ids: string[]): Promise<Map<string, StoredClass>> {
  const out = new Map<string, StoredClass>();
  if (ids.length === 0) return out;
  await ensureLlmTables();
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; teams: string[]; tag: string | null; story: string }>>(
    `SELECT "id", "teams", "tag", "story" FROM "NewsClassification" WHERE "id" = ANY($1::text[])`,
    ids
  );
  for (const r of rows) out.set(r.id, { teams: r.teams, tag: (r.tag as NewsTag | null) ?? null, story: r.story });
  return out;
}

async function storeClassified(day: string, entries: Array<[string, StoredClass]>): Promise<void> {
  if (entries.length === 0) return;
  const params: unknown[] = [];
  const values = entries.map(([id, c], k) => {
    params.push(id, day, c.teams, c.tag, c.story);
    const b = k * 5;
    return `($${b + 1}, $${b + 2}, $${b + 3}::text[], $${b + 4}, $${b + 5})`;
  });
  await prisma.$executeRawUnsafe(
    `INSERT INTO "NewsClassification" ("id", "day", "teams", "tag", "story") VALUES ${values.join(", ")}
     ON CONFLICT ("id") DO NOTHING`,
    ...params
  );
}

// 같은 묶음을 동시에 여러 번 분류하지 않게 (여러 팀·요청이 같은 날짜를 동시에 볼 때)
const inFlight = new Map<string, Promise<Map<string, StoredClass> | null>>();

function classifyAndStore(day: string, batch: RawArticle[]): Promise<Map<string, StoredClass> | null> {
  const key = batch.map((a) => `${a.oid}-${a.aid}`).join(",");
  const running = inFlight.get(key);
  if (running) return running;
  const job = (async () => {
    const rows = await classifyBatch(batch);
    if (!rows) return null;
    const byIndex = new Map(rows.map((r) => [r.i, normalizeRow(r)]));
    const entries: Array<[string, StoredClass]> = batch.map((a, i) => [
      `${a.oid}-${a.aid}`,
      byIndex.get(i) ?? { teams: [], tag: null, story: a.title },
    ]);
    await storeClassified(day, entries).catch((err) =>
      console.warn("[news] store failed:", (err as Error).message)
    );
    return new Map(entries);
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

/**
 * 하루치 기사 분류. 한 번 분류한 기사는 DB(NewsClassification)에 남아 배포·리전과 상관없이 다시 분류하지 않는다.
 * 2026-10-21~22 에는 캐시 키에 함수 코드가 들어가는 탓에 배포마다 일주일 치를 다시 분류해 크레딧을 다 썼다.
 * 새 기사만 BATCH_SIZE 씩 Claude 로 분류하고, 예산이 없거나 실패하면 키워드 분류로 보여 준다 (저장하지 않아 나중에 다시 시도).
 */
async function classifyDayUncached(date: string): Promise<ClassifiedArticle[]> {
  const raw = await fetchDayArticles(date, date === kstDate());
  const ids = raw.map((a) => `${a.oid}-${a.aid}`);
  const stored = await loadStored(ids).catch((err) => {
    console.warn("[news] load failed:", (err as Error).message);
    return null;
  });
  if (!stored) return raw.map((a) => toClassified(a, classifyByKeyword(a)));

  const missing = raw.filter((a) => !stored.has(`${a.oid}-${a.aid}`));
  const batches: RawArticle[][] = [];
  for (let i = 0; i < missing.length; i += BATCH_SIZE) batches.push(missing.slice(i, i + BATCH_SIZE));
  const results = await mapWithConcurrency(batches, 2, (b) => classifyAndStore(date, b));
  for (const r of results) r?.forEach((c, id) => stored.set(id, c));

  return raw.map((a) => toClassified(a, stored.get(`${a.oid}-${a.aid}`) ?? classifyByKeyword(a)));
}

/** 같은 인스턴스에서 같은 날짜를 짧게 재사용 (DB 왕복 줄이기) */
const dayMemo = new Map<string, { at: number; value: Promise<ClassifiedArticle[]> }>();

function classifyDay(date: string): Promise<ClassifiedArticle[]> {
  const ttl = date === kstDate() ? 5 * 60_000 : 60 * 60_000;
  const hit = dayMemo.get(date);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = classifyDayUncached(date).catch((err) => {
    dayMemo.delete(date);
    throw err;
  });
  dayMemo.set(date, { at: Date.now(), value });
  return value;
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
