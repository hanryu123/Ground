import { getTeamNews, type NewsTag, type TeamNewsItem } from "@/lib/news";
import { findTeam } from "@/lib/teams";

/**
 * 스토브리그 알림 — 비시즌에 우리 팀 FA·트레이드·계약 소식이 나오면 알린다.
 *
 *  자동 발송하지 않는다. 어드민이 후보를 보고 골라서 보낸다 (크론 없음).
 *  같은 기사는 notificationDispatchState(alertKind "stove-league", eventKey = 기사 id)로 한 번만 나간다.
 */

/** 비시즌에 의미 있는 분류 — 부상은 시즌 중 소식이라 뺀다 */
export const STOVE_LEAGUE_TAGS: readonly NewsTag[] = ["FA", "트레이드", "외국인", "계약", "코칭스태프", "은퇴·방출"];

/** 분류별 한 줄 — 기사 제목 앞에 붙는 우리 팀 편 말머리 */
const TAG_LEAD: Record<string, string> = {
  FA: "FA 소식",
  트레이드: "트레이드 소식",
  외국인: "외국인 선수 소식",
  계약: "계약 소식",
  코칭스태프: "코칭스태프 소식",
  "은퇴·방출": "선수단 정리 소식",
};

export type StoveLeagueCandidate = TeamNewsItem & { tag: NewsTag };

export async function getStoveLeagueCandidates(teamId: string, days = 2): Promise<StoveLeagueCandidate[]> {
  const items = await getTeamNews(teamId, days);
  return items
    .filter((item): item is StoveLeagueCandidate => item.tag != null && STOVE_LEAGUE_TAGS.includes(item.tag))
    .sort((a, b) => b.dateTime.localeCompare(a.dateTime));
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** 알림 문구 — 기사 제목은 사실이라 그대로, 앞에 우리 팀 말머리만 붙인다 (지어내는 내용 없음) */
export function buildStoveLeagueCopy(teamId: string, item: Pick<TeamNewsItem, "title" | "tag">): { title: string; body: string } {
  const team = findTeam(teamId);
  const lead = (item.tag && TAG_LEAD[item.tag]) || "스토브리그 소식";
  return {
    title: `[스토브리그] ${team.short} ${lead}`,
    body: clip(item.title, 90),
  };
}
