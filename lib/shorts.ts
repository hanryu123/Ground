import { unstable_cache } from "next/cache";
import { SHORTS_CHANNELS, type ShortsChannel } from "@/config/shortsChannels";
import { parseRss, type HighlightEntry } from "@/lib/highlightFeed";
import { TEAM_KEYWORDS } from "@/lib/news";
import { mapWithConcurrency } from "@/lib/concurrency";

/**
 * 피드 숏츠 블록 — 화이트리스트 채널의 숏츠를 RSS로 모아 팀별로 나눈다.
 *
 *  - 채널마다 숏츠 전용 재생목록 RSS(playlist_id=UUSH + 채널 id 에서 "UC" 뺀 나머지)만 읽는다.
 *    채널 업로드 RSS(channel_id=)는 최신 업로드 15개라 긴 영상이 많은 채널은 숏츠가 0개로 잡힌다 (KIA).
 *    숏츠 재생목록도 최신 15개뿐이다.
 *  - 노출 기간: 구단·팬 채널은 그 팀 영상만 올리니 최근 60일까지 (비시즌·포스트시즌에 업로드가 뜸해도 블록이 비지 않게),
 *    KBO·티빙은 업로드가 많고 제목 매칭이라 최근 14일만.
 *  - 숏츠 판별: RSS 항목의 <link href> 가 /shorts/{id} 인지로 본다. 별도 요청이 필요 없다.
 *    (Phase 0 스파이크: /shorts/{id} 리다이렉트 방식과 75/75 일치 — docs/phase0-spike.md 2.3)
 *  - 임베드 가능 여부: oEmbed가 실패하는 영상(비공개·임베드 차단 등)은 뺀다. 스파이크 표본 70개는 전부 통과했다.
 *  - oEmbed 결과는 거의 안 바뀌므로 30일 캐시하고, 채널 목록은 15분마다 새로 읽는다.
 *
 *  기존 경기 하이라이트 버튼(fetchOfficialHighlightEntries)은 숏츠를 빼는 동작을 그대로 둔다.
 */

const UA = "Mozilla/5.0 (compatible; GroundBot/2.0)";
const MAX_AGE_DAYS: Record<ShortsChannel["kind"], number> = {
  league: 14,
  broadcaster: 14,
  club: 60,
  fan: 60,
};
const CACHE_VERSION = "v4";

export type ShortsItem = {
  videoId: string;
  title: string;
  channelLabel: string;
  /** ISO 문자열 */
  publishedAt: string | null;
  thumbnailUrl: string | null;
  teams: string[];
};

async function fetchFeed(query: string, channel: ShortsChannel): Promise<HighlightEntry[]> {
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?${query}`, {
      headers: { "user-agent": UA, accept: "application/xml,text/xml;q=0.9,*/*;q=0.8" },
      next: { revalidate: 900 },
    });
    if (!res.ok) return [];
    return parseRss(await res.text(), channel.id, channel.label);
  } catch {
    return [];
  }
}

function fetchChannelShortsFeed(channel: ShortsChannel): Promise<HighlightEntry[]> {
  return fetchFeed(`playlist_id=UUSH${channel.id.slice(2)}`, channel);
}

// 리그·중계 채널은 농구·배구 숏츠도 올리고 "SK·삼성·KT·LG" 같은 이름이 겹친다
const BASEBALL_RE = /KBO|야구/i;
const OTHER_SPORT_RE = /KBL|농구|배구|V-?리그/i;

function matchTeams(entry: HighlightEntry, channel: ShortsChannel): string[] {
  if (channel.teams !== "match") return channel.teams;
  const text = `${entry.title}\n${entry.description ?? ""}`;
  if (!BASEBALL_RE.test(text) || OTHER_SPORT_RE.test(text)) return [];
  return Object.entries(TEAM_KEYWORDS)
    .filter(([, re]) => re.test(text))
    .map(([id]) => id);
}

function isShortsEntry(entry: HighlightEntry): boolean {
  return /youtube\.com\/shorts\//.test(entry.url);
}

/** 네트워크 실패면 예외 — 캐시되지 않게 한다. */
async function checkEmbeddable(videoId: string): Promise<boolean> {
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`,
    { headers: { "user-agent": UA }, cache: "no-store" }
  );
  if (res.status >= 500 || res.status === 429) throw new Error(`oembed ${res.status}`);
  return res.ok;
}

function checkEmbeddableCached(videoId: string): Promise<boolean> {
  return unstable_cache(() => checkEmbeddable(videoId), ["yt-oembed", CACHE_VERSION, videoId], {
    revalidate: 30 * 86_400,
  })().catch(() => {
    // 확인 요청 실패 — 이번 수집에선 빼고, 다음 수집 때 다시 본다
    return false;
  });
}

async function collectAllShorts(): Promise<ShortsItem[]> {
  const channels = SHORTS_CHANNELS.filter((c) => c.enabled && c.id);

  const perChannel = await mapWithConcurrency(channels, 4, async (channel) => {
    const cutoff = Date.now() - MAX_AGE_DAYS[channel.kind] * 86_400_000;
    const entries = (await fetchChannelShortsFeed(channel)).filter(
      (e) => isShortsEntry(e) && (!e.publishedAt || e.publishedAt.getTime() >= cutoff)
    );
    return entries
      .map((entry) => ({ entry, teams: matchTeams(entry, channel) }))
      .filter((x) => x.teams.length > 0);
  });

  const seen = new Set<string>();
  const candidates = perChannel.flat().filter(({ entry }) => {
    if (seen.has(entry.videoId)) return false;
    seen.add(entry.videoId);
    return true;
  });

  const embeddable = await mapWithConcurrency(candidates, 8, ({ entry }) =>
    checkEmbeddableCached(entry.videoId)
  );
  const items: ShortsItem[] = [];
  candidates.forEach(({ entry, teams }, i) => {
    if (!embeddable[i]) return;
    items.push({
      videoId: entry.videoId,
      title: entry.title,
      channelLabel: entry.channelLabel,
      publishedAt: entry.publishedAt?.toISOString() ?? null,
      thumbnailUrl: entry.thumbnailUrl,
      teams,
    });
  });
  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

const getAllShortsCached = unstable_cache(collectAllShorts, ["team-shorts-all", CACHE_VERSION], {
  revalidate: 900,
});

/**
 * 우리 팀 숏츠 (기간은 MAX_AGE_DAYS).
 * 채널별로 최신순 줄을 세운 뒤 한 개씩 번갈아 담는다 — 순수 최신순이면 매일 올라오는 KBO·티빙 영상이
 * 자리를 다 채워서 구단·팬 채널 숏츠가 묻힌다. 채널 순서는 각 채널의 가장 최근 영상 순.
 */
export async function getTeamShorts(teamId: string, limit = 20): Promise<ShortsItem[]> {
  const all = await getAllShortsCached();
  const byChannel = new Map<string, ShortsItem[]>();
  for (const item of all) {
    if (!item.teams.includes(teamId)) continue;
    const list = byChannel.get(item.channelLabel);
    if (list) list.push(item);
    else byChannel.set(item.channelLabel, [item]);
  }
  const queues = [...byChannel.values()];
  const out: ShortsItem[] = [];
  for (let round = 0; out.length < limit && queues.some((q) => q.length > round); round++) {
    for (const q of queues) {
      if (q[round] && out.length < limit) out.push(q[round]!);
    }
  }
  return out;
}

/** 숏츠 블록 끝 "YouTube에서 더 보기" — 구단 채널이 있으면 그 채널, 없으면 KBO 채널 숏츠 탭. */
export function teamShortsMoreUrl(teamId: string): string {
  const club = SHORTS_CHANNELS.find(
    (c) => c.enabled && c.id && c.kind === "club" && Array.isArray(c.teams) && c.teams.includes(teamId)
  );
  const league = SHORTS_CHANNELS.find((c) => c.kind === "league" && c.id);
  return `https://www.youtube.com/channel/${(club ?? league)!.id}/shorts`;
}
