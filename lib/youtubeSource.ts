import { unstable_cache } from "next/cache";
import { parseRss } from "@/lib/highlightFeed";
import { mapWithConcurrency } from "@/lib/concurrency";

/**
 * YouTube 채널 영상 목록 — RSS 가 1순위, 실패하면 채널 페이지(ytInitialData)에서 읽는다.
 *
 *  - YouTube RSS(feeds/videos.xml)는 같은 주소도 200·404·500 이 섞여 나올 때가 있다
 *    (2026-10-22 측정: LG 숏츠 RSS 6번 중 1번만 200). 실패를 "영상 0개"로 캐시하면 피드가 통째로 빈다.
 *  - 그래서 채널마다 따로 캐시하고, RSS·페이지 둘 다 실패하면 예외를 던진다 → 캐시에 빈 결과가 남지 않고,
 *    이미 캐시된 값이 있으면 재검증 실패 시 Next 가 마지막 성공 값을 계속 내준다.
 *  - 캐시 키는 숏츠 노출 정책(lib/shorts.ts CACHE_VERSION)과 따로 둔다 — 정책을 바꿔도 이미 받은 채널 목록은 그대로 쓴다.
 */

const FEED_CACHE_KEY = "yt-channel-feed-v1";
const FEED_REVALIDATE_SEC = 900;
const RSS_TRIES = 3;
const PAGE_LIMIT = 15;

const BROWSER_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "accept-language": "ko-KR,ko;q=0.9",
  // 동의 화면(consent.youtube.com)으로 넘어가지 않게
  cookie: "CONSENT=YES+1; SOCS=CAI",
};

/** unstable_cache 는 JSON 으로 저장하므로 날짜는 ISO 문자열로 둔다 */
export type FeedEntry = {
  channelId: string;
  channelLabel: string;
  videoId: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  description?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchRss(query: string, channelId: string, channelLabel: string): Promise<FeedEntry[]> {
  for (let attempt = 0; attempt < RSS_TRIES; attempt++) {
    try {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?${query}`, {
        headers: { "user-agent": BROWSER_HEADERS["user-agent"], accept: "application/xml,text/xml;q=0.9,*/*;q=0.8" },
        cache: "no-store",
      });
      if (res.ok) {
        return parseRss(await res.text(), channelId, channelLabel).map((e) => ({
          ...e,
          publishedAt: e.publishedAt?.toISOString() ?? null,
        }));
      }
    } catch {
      // 네트워크 오류 — 다시 시도
    }
    if (attempt < RSS_TRIES - 1) await sleep(250 * (attempt + 1));
  }
  throw new Error(`rss failed: ${query}`);
}

async function fetchInitialData(path: string): Promise<unknown> {
  const res = await fetch(`https://www.youtube.com${path}`, { headers: BROWSER_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`page ${res.status}: ${path}`);
  const html = await res.text();
  const json = /var ytInitialData = (\{[\s\S]*?\});<\/script>/.exec(html)?.[1];
  if (!json) throw new Error(`no ytInitialData: ${path}`);
  return JSON.parse(json);
}

function collect(node: unknown, key: string, out: Array<Record<string, unknown>>) {
  if (Array.isArray(node)) {
    for (const v of node) collect(v, key, out);
  } else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj[key] && typeof obj[key] === "object") out.push(obj[key] as Record<string, unknown>);
    for (const v of Object.values(obj)) collect(v, key, out);
  }
}

function dig(obj: unknown, ...path: string[]): unknown {
  let cur = obj;
  for (const p of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** "3일 전", "2주 전", "5시간 전" → 대략적인 날짜 (채널 영상 탭엔 상대 시간만 있다) */
function parseRelativeKo(text: string | undefined): string | null {
  const m = text ? /(\d+)\s*(초|분|시간|일|주|개월|년)\s*전/.exec(text) : null;
  if (!m) return null;
  const n = Number(m[1]);
  const unitMs: Record<string, number> = {
    초: 1_000,
    분: 60_000,
    시간: 3_600_000,
    일: 86_400_000,
    주: 7 * 86_400_000,
    개월: 30 * 86_400_000,
    년: 365 * 86_400_000,
  };
  return new Date(Date.now() - n * unitMs[m[2]!]!).toISOString();
}

/**
 * 숏츠 업로드 시각 — 숏츠 페이지의 itemprop="datePublished"(약 780KB 지점)까지만 읽고 끊는다 (페이지 전체는 1.5MB).
 * 업로드 시각은 바뀌지 않으므로 오래 캐시한다.
 */
async function fetchShortPublishedAt(videoId: string): Promise<string> {
  const res = await fetch(`https://www.youtube.com/shorts/${videoId}`, { headers: BROWSER_HEADERS, cache: "no-store" });
  if (!res.ok || !res.body) throw new Error(`short page ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (text.length < 1_200_000) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      const m = /itemprop="datePublished" content="([^"]+)"/.exec(text) ?? /"publishDate":"([^"]+)"/.exec(text);
      if (m) return new Date(m[1]!).toISOString();
    }
  } finally {
    void reader.cancel().catch(() => {});
  }
  // 못 찾았으면 예외 — 빈 값이 1년 캐시되지 않게
  throw new Error(`no publish date: ${videoId}`);
}

const getShortPublishedAt = (videoId: string) =>
  unstable_cache(() => fetchShortPublishedAt(videoId), ["yt-short-published", videoId], {
    revalidate: 365 * 86_400,
  })().catch(() => null);

async function scrapeChannelShorts(channelId: string, channelLabel: string): Promise<FeedEntry[]> {
  const data = await fetchInitialData(`/channel/${channelId}/shorts`);
  const lockups: Array<Record<string, unknown>> = [];
  collect(data, "shortsLockupViewModel", lockups);
  const seen = new Set<string>();
  const items: Array<{ videoId: string; title: string }> = [];
  for (const l of lockups) {
    const videoId =
      (dig(l, "onTap", "innertubeCommand", "reelWatchEndpoint", "videoId") as string | undefined) ??
      (typeof l.entityId === "string" ? l.entityId.replace("shorts-shelf-item-", "") : undefined);
    const title = dig(l, "overlayMetadata", "primaryText", "content") as string | undefined;
    if (!videoId || !title || seen.has(videoId)) continue;
    seen.add(videoId);
    items.push({ videoId, title });
    if (items.length >= PAGE_LIMIT) break;
  }
  if (items.length === 0) throw new Error(`no shorts on page: ${channelId}`);
  const dates = await mapWithConcurrency(items, 4, (i) => getShortPublishedAt(i.videoId));
  return items.map((i, idx) => ({
    channelId,
    channelLabel,
    videoId: i.videoId,
    title: i.title,
    url: `https://www.youtube.com/shorts/${i.videoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${i.videoId}/hqdefault.jpg`,
    publishedAt: dates[idx] ?? null,
  }));
}

async function scrapeChannelVideos(channelId: string, channelLabel: string): Promise<FeedEntry[]> {
  const data = await fetchInitialData(`/channel/${channelId}/videos`);
  const lockups: Array<Record<string, unknown>> = [];
  collect(data, "lockupViewModel", lockups);
  const out: FeedEntry[] = [];
  for (const l of lockups) {
    const videoId = l.contentId as string | undefined;
    const meta = dig(l, "metadata", "lockupMetadataViewModel");
    const title = dig(meta, "title", "content") as string | undefined;
    if (!videoId || !title) continue;
    const rows = (dig(meta, "metadata", "contentMetadataViewModel", "metadataRows") ?? []) as Array<{
      metadataParts?: Array<{ text?: { content?: string } }>;
    }>;
    const timeText = rows
      .flatMap((r) => r.metadataParts ?? [])
      .map((p) => p.text?.content)
      .find((t) => t && /전$/.test(t));
    out.push({
      channelId,
      channelLabel,
      videoId,
      title,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      publishedAt: parseRelativeKo(timeText),
    });
    if (out.length >= PAGE_LIMIT) break;
  }
  if (out.length === 0) throw new Error(`no videos on page: ${channelId}`);
  return out;
}

/** 채널 숏츠 최신 15개 — 숏츠 전용 재생목록 RSS → 실패하면 채널 숏츠 탭. 둘 다 실패하면 예외. */
export function getChannelShorts(channelId: string, channelLabel: string): Promise<FeedEntry[]> {
  return unstable_cache(
    async () => {
      try {
        return await fetchRss(`playlist_id=UUSH${channelId.slice(2)}`, channelId, channelLabel);
      } catch {
        return await scrapeChannelShorts(channelId, channelLabel);
      }
    },
    [FEED_CACHE_KEY, "shorts", channelId],
    { revalidate: FEED_REVALIDATE_SEC }
  )();
}

/** 채널 업로드 최신 15개 (숏츠 포함 가능) — 업로드 RSS → 실패하면 채널 동영상 탭(일반 영상만). */
export function getChannelUploads(channelId: string, channelLabel: string): Promise<FeedEntry[]> {
  return unstable_cache(
    async () => {
      try {
        return await fetchRss(`channel_id=${channelId}`, channelId, channelLabel);
      } catch {
        return await scrapeChannelVideos(channelId, channelLabel);
      }
    },
    [FEED_CACHE_KEY, "uploads", channelId],
    { revalidate: FEED_REVALIDATE_SEC }
  )();
}
