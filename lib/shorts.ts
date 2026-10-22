import { unstable_cache } from "next/cache";
import { SHORTS_CHANNELS, type ShortsChannel } from "@/config/shortsChannels";
import { getChannelShorts, getChannelUploads, type FeedEntry } from "@/lib/youtubeSource";
import { TEAM_KEYWORDS } from "@/lib/news";
import { mapWithConcurrency } from "@/lib/concurrency";

/**
 * 피드 숏츠 블록 — 화이트리스트 채널의 숏츠를 RSS로 모아 팀별로 나눈다.
 *
 *  - 채널마다 숏츠 전용 재생목록 RSS(playlist_id=UUSH + 채널 id 에서 "UC" 뺀 나머지)만 읽는다.
 *    채널 업로드 RSS(channel_id=)는 최신 업로드 15개라 긴 영상이 많은 채널은 숏츠가 0개로 잡힌다 (KIA).
 *    숏츠 재생목록도 최신 15개뿐이다.
 *  - 노출 기간: 구단 채널은 최근 60일, 팬 채널은 120일까지 (비시즌·포스트시즌에 업로드가 뜸해도 블록이 비지 않게),
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
  fan: 120,
};
const CACHE_VERSION = "v7";

export type ShortsItem = {
  videoId: string;
  title: string;
  channelLabel: string;
  /** ISO 문자열 */
  publishedAt: string | null;
  thumbnailUrl: string | null;
  teams: string[];
};

// 리그·중계 채널은 농구·배구 숏츠도 올리고 "SK·삼성·KT·LG" 같은 이름이 겹친다
// 채널 페이지에서 읽은 영상은 설명(해시태그)이 없어 제목만으로 가린다 → 가을야구 제목에 자주 붙는 말도 인정
const BASEBALL_RE = /KBO|야구|준PO|플레이오프|한국시리즈|와일드카드|팬덤중계|가을야구/i;
const OTHER_SPORT_RE = /KBL|농구|배구|V-?리그/i;

function matchTeams(entry: FeedEntry, channel: ShortsChannel): string[] {
  if (channel.teams !== "match") return channel.teams;
  const text = `${entry.title}\n${entry.description ?? ""}`;
  // KBO 채널은 야구만 올리므로 야구 키워드 검사는 중계 채널(티빙)에만 한다
  if (OTHER_SPORT_RE.test(text)) return [];
  if (channel.kind !== "league" && !BASEBALL_RE.test(text)) return [];
  return Object.entries(TEAM_KEYWORDS)
    .filter(([, re]) => re.test(text))
    .map(([id]) => id);
}

function isShortsEntry(entry: FeedEntry): boolean {
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
    // RSS·채널 페이지 둘 다 실패하고 캐시도 없을 때만 빈 목록 (다음 요청에서 다시 시도)
    const feed = await getChannelShorts(channel.id, channel.label).catch((err) => {
      console.warn(`[shorts] ${channel.label} feed unavailable:`, (err as Error).message);
      return [] as FeedEntry[];
    });
    // 업로드 시각을 모르는 영상은 뺀다 — 기간 거르기를 그냥 통과해 몇 년 전 숏츠가 섞이는 걸 막는다
    const entries = feed.filter(
      (e) => isShortsEntry(e) && e.publishedAt !== null && Date.parse(e.publishedAt) >= cutoff
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
      publishedAt: entry.publishedAt,
      thumbnailUrl: entry.thumbnailUrl,
      teams,
    });
  });
  return items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

// 채널별 목록은 youtubeSource 에서 따로 캐시한다. 여기선 합친 결과를 짧게만 둔다
// (한 채널이 일시적으로 비어 있어도 5분 안에 다시 합친다).
const getAllShortsCached = unstable_cache(collectAllShorts, ["team-shorts-all", CACHE_VERSION], {
  revalidate: 300,
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

export type ClubVideo = {
  videoId: string;
  title: string;
  channelLabel: string;
  publishedAt: string | null;
  url: string;
};

/**
 * 구단 공식 채널 최근 일반 영상 (숏츠 제외) — 뉴스 목록 사이에 끼워 넣는 용도.
 * 채널 업로드 RSS(최신 15개)에서 /shorts/ 링크가 아닌 것만 최신순.
 */
export async function getClubLatestVideos(teamId: string, limit = 6): Promise<ClubVideo[]> {
  const club = SHORTS_CHANNELS.find(
    (c) => c.enabled && c.id && c.kind === "club" && Array.isArray(c.teams) && c.teams.includes(teamId)
  );
  if (!club) return [];
  const entries = await getChannelUploads(club.id, club.label).catch((err) => {
    console.warn(`[club-videos] ${club.label} feed unavailable:`, (err as Error).message);
    return [] as FeedEntry[];
  });
  return entries
    .filter((e) => !isShortsEntry(e))
    .sort((a, b) => Date.parse(b.publishedAt ?? "0") - Date.parse(a.publishedAt ?? "0"))
    .slice(0, limit)
    .map((e) => ({
      videoId: e.videoId,
      title: e.title,
      channelLabel: e.channelLabel,
      publishedAt: e.publishedAt,
      url: `https://www.youtube.com/watch?v=${e.videoId}`,
    }));
}
