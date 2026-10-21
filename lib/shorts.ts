import { unstable_cache } from "next/cache";
import { SHORTS_CHANNELS, type ShortsChannel } from "@/config/shortsChannels";
import { parseRss, type HighlightEntry } from "@/lib/highlightFeed";
import { TEAM_KEYWORDS } from "@/lib/news";
import { mapWithConcurrency } from "@/lib/concurrency";

/**
 * 피드 숏츠 블록 — 화이트리스트 채널의 숏츠를 RSS로 모아 팀별로 나눈다.
 *
 *  - 채널마다 숏츠 전용 재생목록(UUSH + 채널 id 뒤 22자) RSS를 먼저 읽고, 없으면 채널 RSS를 읽는다.
 *    RSS는 최근 15개만 주므로 업로드가 잦은 채널은 14일을 다 못 채울 수 있다.
 *  - 숏츠 판별: youtube.com/shorts/{id} 가 리다이렉트 없이 200이면 숏츠 (일반 영상은 303 → /watch).
 *    (2026-10 확인: RSS 링크가 /shorts/ 인 영상과 결과가 같다.) 요청이 실패한 영상은 이번 수집에서 뺀다.
 *  - 임베드 가능 여부: oEmbed가 실패하는 영상(비공개·임베드 차단 등)은 뺀다.
 *  - 영상별 판별 결과는 바뀌지 않으므로 길게 캐시하고, 채널 목록은 15분마다 새로 읽는다.
 *
 *  기존 경기 하이라이트 버튼(fetchOfficialHighlightEntries)은 숏츠를 빼는 동작을 그대로 둔다.
 */

const UA = "Mozilla/5.0 (compatible; GroundBot/2.0)";
const MAX_AGE_DAYS = 14;
const CACHE_VERSION = "v2";

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

async function fetchChannelShortsFeed(channel: ShortsChannel): Promise<HighlightEntry[]> {
  const shortsOnly = await fetchFeed(`playlist_id=UUSH${channel.id.slice(2)}`, channel);
  if (shortsOnly.length > 0) return shortsOnly;
  return fetchFeed(`channel_id=${channel.id}`, channel);
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

type VideoCheck = { shorts: boolean; embeddable: boolean };

/** 네트워크 실패면 예외 — 캐시되지 않게 한다. */
async function checkVideo(videoId: string): Promise<VideoCheck> {
  const [shortsRes, oembedRes] = await Promise.all([
    fetch(`https://www.youtube.com/shorts/${videoId}`, {
      method: "HEAD",
      redirect: "manual",
      headers: { "user-agent": UA },
      cache: "no-store",
    }),
    fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`,
      { headers: { "user-agent": UA }, cache: "no-store" }
    ),
  ]);
  if (shortsRes.status >= 500 || oembedRes.status >= 500 || shortsRes.status === 429) {
    throw new Error(`youtube check ${shortsRes.status}/${oembedRes.status}`);
  }
  return { shorts: shortsRes.status === 200, embeddable: oembedRes.ok };
}

function checkVideoCached(entry: HighlightEntry): Promise<VideoCheck | null> {
  return unstable_cache(() => checkVideo(entry.videoId), ["yt-video-check", CACHE_VERSION, entry.videoId], {
    revalidate: 7 * 86_400,
  })().catch(() => {
    // 판별 요청 실패 — 임베드 가능한지 모르니 이번 수집에선 빼고, 다음 수집 때 다시 본다
    return null;
  });
}

async function collectAllShorts(): Promise<ShortsItem[]> {
  const channels = SHORTS_CHANNELS.filter((c) => c.enabled && c.id);
  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;

  const perChannel = await mapWithConcurrency(channels, 4, async (channel) => {
    const entries = (await fetchChannelShortsFeed(channel)).filter(
      (e) => !e.publishedAt || e.publishedAt.getTime() >= cutoff
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

  const checks = await mapWithConcurrency(candidates, 8, ({ entry }) => checkVideoCached(entry));
  const items: ShortsItem[] = [];
  candidates.forEach(({ entry, teams }, i) => {
    const check = checks[i];
    if (!check?.shorts || !check.embeddable) return;
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

/** 최근 14일 우리 팀 숏츠, 최신순. */
export async function getTeamShorts(teamId: string, limit = 20): Promise<ShortsItem[]> {
  const all = await getAllShortsCached();
  return all.filter((s) => s.teams.includes(teamId)).slice(0, limit);
}

/** 숏츠 블록 끝 "YouTube에서 더 보기" — 구단 채널이 있으면 그 채널, 없으면 KBO 채널 숏츠 탭. */
export function teamShortsMoreUrl(teamId: string): string {
  const club = SHORTS_CHANNELS.find(
    (c) => c.enabled && c.id && c.kind === "club" && Array.isArray(c.teams) && c.teams.includes(teamId)
  );
  const league = SHORTS_CHANNELS.find((c) => c.kind === "league" && c.id);
  return `https://www.youtube.com/channel/${(club ?? league)!.id}/shorts`;
}
