import { findTeam } from "@/lib/teams";

/** KBO 공식 채널 + TVING 스포츠 채널 (RSS channel_id 기반) */
export const OFFICIAL_HIGHLIGHT_CHANNELS = [
  {
    id: "UCoVz66yWHzVsXAFG8WhJK9g",
    label: "@KBO1982",
  },
  {
    id: "UC8JtQf77wqhVpOQ8Cze8JjA",
    label: "@tvingsports",
  },
] as const;

export type HighlightEntry = {
  channelId: string;
  channelLabel: string;
  videoId: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
};

/**
 * 제목 블랙리스트 — 순수 경기 하이라이트가 아닌 영상을 필터링.
 * 하나라도 매칭되면 즉시 제외.
 */
const TITLE_BLACKLIST = [
  "shorts",
  "쇼츠",
  "크보픽",
  "명장면",
  "인터뷰",
  "프리뷰",
  "풀영상",
  "퇴근길",
  "미공개",
  "비하인드",
  "크보모먼트",
  "모먼트",
  "순삭",
  "노컷",
];

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\[\]\(\)\-_:|/.,!?\s※]/g, "");
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function teamKeywordCandidates(teamId: string): string[] {
  const team = findTeam(teamId);
  const aliases: Record<string, string[]> = {
    lg: ["엘지", "트윈스", "lg트윈스"],
    kia: ["기아", "타이거즈", "kia타이거즈"],
    samsung: ["삼성", "라이온즈", "삼성라이온즈"],
    doosan: ["두산", "베어스", "ob", "두산베어스"],
    lotte: ["롯데", "자이언츠", "롯데자이언츠"],
    hanwha: ["한화", "이글스", "한화이글스"],
    ssg: ["ssg", "랜더스", "sk", "ssg랜더스"],
    nc: ["nc", "엔씨", "다이노스", "nc다이노스"],
    kt: ["kt", "위즈", "kt위즈"],
    kiwoom: ["키움", "히어로즈", "wo", "키움히어로즈"],
  };
  const raw = [
    team.short,
    team.shortEn,
    team.name,
    team.nameEn,
    team.name.split(" ")[0] ?? "",
    team.nameEn.split(" ")[0] ?? "",
    ...(aliases[teamId] ?? []),
  ];
  return [...new Set(raw.map((v) => normalizeText(v)).filter((v) => v.length > 0))];
}

function isBlacklisted(title: string): boolean {
  const lower = title.toLowerCase();
  return TITLE_BLACKLIST.some((kw) => lower.includes(kw));
}

function titleMatchesTeams(title: string, homeTeamId: string, awayTeamId: string): boolean {
  // 1) 블랙리스트 필터 — 하나라도 걸리면 즉시 제외
  if (isBlacklisted(title)) return false;
  // 2) '하이라이트' 필수 포함
  const normalized = normalizeText(title);
  if (!normalized.includes(normalizeText("하이라이트"))) return false;
  // 3) 홈/어웨이 팀 양쪽 모두 포함
  const homeTokens = teamKeywordCandidates(homeTeamId);
  const awayTokens = teamKeywordCandidates(awayTeamId);
  const hasHome = homeTokens.some((t) => normalized.includes(t));
  const hasAway = awayTokens.some((t) => normalized.includes(t));
  return hasHome && hasAway;
}

function parseRss(xml: string, channelId: string, channelLabel: string): HighlightEntry[] {
  const entries: HighlightEntry[] = [];
  const entryPattern = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;
  while ((match = entryPattern.exec(xml)) !== null) {
    const chunk = match[1];
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(chunk)?.[1]?.trim();
    const titleRaw = /<title>([\s\S]*?)<\/title>/.exec(chunk)?.[1];
    const link = /<link[^>]+href="([^"]+)"/.exec(chunk)?.[1]?.trim();
    const publishedRaw = /<published>([^<]+)<\/published>/.exec(chunk)?.[1]?.trim();
    // <media:thumbnail url="..."> 파싱
    const thumbnailUrl =
      /<media:thumbnail[^>]+url="([^"]+)"/.exec(chunk)?.[1]?.trim() ?? null;
    if (!id || !titleRaw) continue;
    const title = decodeXml(titleRaw.trim());
    const url = link?.startsWith("http") ? link : `https://www.youtube.com/watch?v=${id}`;
    const publishedAtMs = publishedRaw ? Date.parse(publishedRaw) : Number.NaN;
    entries.push({
      channelId,
      channelLabel,
      videoId: id,
      title,
      url,
      thumbnailUrl,
      publishedAt: Number.isFinite(publishedAtMs) ? new Date(publishedAtMs) : null,
    });
  }
  return entries;
}

export async function fetchOfficialHighlightEntries(limitPerChannel = 15): Promise<HighlightEntry[]> {
  const feeds = await Promise.all(
    OFFICIAL_HIGHLIGHT_CHANNELS.map(async (channel) => {
      const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.id}`;
      try {
        const res = await fetch(url, {
          headers: {
            "user-agent": "Mozilla/5.0 (compatible; GroundBot/2.0)",
            accept: "application/xml,text/xml;q=0.9,*/*;q=0.8",
          },
          cache: "no-store",
        });
        if (!res.ok) return [] as HighlightEntry[];
        const xml = await res.text();
        return parseRss(xml, channel.id, channel.label).slice(0, limitPerChannel);
      } catch {
        return [] as HighlightEntry[];
      }
    })
  );
  return feeds.flat();
}

/**
 * 조건:
 *  1) titleMatchesTeams (하이라이트 포함 + 두 팀 모두 + 블랙리스트 미포함)
 *  2) publishedAt 이 24시간 이내 (과거 경기 방지)
 */
export function pickMatchingHighlightForGame(
  entries: HighlightEntry[],
  game: { homeTeam: string; awayTeam: string },
  now: Date = new Date()
): HighlightEntry | null {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const matched = entries.filter((entry) => {
    // 제목 매칭
    if (!titleMatchesTeams(entry.title, game.homeTeam, game.awayTeam)) return false;
    // 24시간 이내 업로드 확인 (publishedAt 없으면 통과 허용)
    if (entry.publishedAt && entry.publishedAt < cutoff) return false;
    return true;
  });

  if (matched.length === 0) return null;

  // 가장 최근 업로드 우선
  matched.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  return matched[0] ?? null;
}
