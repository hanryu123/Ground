import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { todayKstDate } from "@/lib/kbo";
import { fetchLiveScoreSnapshot } from "@/lib/score/snapshot";
import type { LiveScoreGame } from "@/lib/score/types";
import { findTeam, TEAMS } from "@/lib/teams";
import PushSenderForm from "./PushSenderForm";
import MarketingPushStats from "./MarketingPushStats";
import CronTrigger from "./CronTrigger";
import UserCleanup from "./UserCleanup";
import PendingNotificationsSection from "./PendingNotificationsSection";
import { fetchRecentAdminAuditLogs, type AdminAuditLogRow } from "@/lib/adminAudit";
import { TOPIC_KEYS, isTopicEnabled, type TopicKey } from "@/lib/notifications/topics";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "GROUND · Admin Dashboard",
  description: "MVP traction dashboard for push subscription funnel.",
};

type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>;

type Props = {
  searchParams?: SearchParamsInput;
};

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function startOfTodayKst(now = new Date()): Date {
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const kst = new Date(utcMs + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth();
  const d = kst.getUTCDate();
  return new Date(Date.UTC(y, m, d, -9, 0, 0, 0));
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("ko-KR").format(n);
}

function formatPercent(n: number): string {
  if (!Number.isFinite(n)) return "0.0%";
  return `${n.toFixed(1)}%`;
}

function formatDateTimeKst(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function resolveTeamLabel(teamId: string | null): string {
  if (!teamId) return "팀 미지정";
  const team = TEAMS.find((item) => item.id === teamId);
  return team ? team.name : teamId.toUpperCase();
}

type RankingRow = {
  rank: number;
  teamId: string;
  label: string;
  short: string;
  accent: string;
  count: number;
  ratio: number;
};

type CronRunRow = {
  id: string;
  name: string;
  status: string;
  started_at: Date;
  finished_at: Date | null;
  duration_ms: number | null;
  summary: unknown;
  error: string | null;
};

type TodayGameRow = {
  id: string;
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
  gameDate: Date | null;
  lastSyncedAt: Date | null;
  updatedAt: Date | null;
  highlightVideoUrl: string | null;
  syncSource: "NAVER+DB" | "NAVER" | "DB";
};

type DbTodayGameRow = Omit<TodayGameRow, "syncSource" | "lastSyncedAt" | "updatedAt"> & {
  lastSyncedAt: Date;
  updatedAt: Date;
};

type WebPushKpiRow = {
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date | null;
  topics: unknown;
  user: { favoriteTeam: string | null };
};

type NativePushKpiRow = {
  userId: string;
  platform: string;
  favoriteTeam: string | null;
  appEnv: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date | null;
  topics: unknown;
  user: { favoriteTeam: string | null };
};

type TopicKpiRow = {
  key: TopicKey;
  label: string;
  users: number;
  channels: number;
  ratio: number;
};

type PlatformKpiRow = {
  key: string;
  label: string;
  count: number;
  ratio: number;
};

async function fetchRecentCronRuns(db: any, limit = 12): Promise<CronRunRow[]> {
  try {
    return await db.$queryRawUnsafe(
      `SELECT id, name, status, started_at, finished_at, duration_ms, summary, error
       FROM cron_runs
       ORDER BY started_at DESC
       LIMIT $1`,
      limit
    );
  } catch {
    return [];
  }
}

function stringifySummary(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  const keys = ["checked", "changed", "pushSent", "clutchSent", "rainDelaySent", "errors", "sent", "skipped"];
  return keys
    .filter((key) => obj[key] !== undefined && obj[key] !== null)
    .map((key) => `${key} ${String(obj[key])}`)
    .join(" · ");
}

function statusTone(status: string): string {
  if (status === "success" || status === "READY" || status === "RESULT") return "text-emerald-300 bg-emerald-950/40 border-emerald-500/20";
  if (status === "partial" || status === "blocked" || status === "LIVE" || status === "PENDING" || status === "SUSPENDED") return "text-amber-300 bg-amber-950/40 border-amber-500/20";
  if (status === "error" || status === "FAILED" || status === "CANCEL") return "text-red-300 bg-red-950/40 border-red-500/20";
  return "text-slate-300 bg-slate-800/70 border-white/10";
}

function topicLabel(key: TopicKey): string {
  const labels: Record<TopicKey, string> = {
    pitcher: "투수/라인업",
    preGame: "프리뷰",
    postGame: "경기 종료",
    highlight: "하이라이트",
    score: "스코어",
    livePitcherChange: "투수 교체",
    liveStrikeout: "삼진",
    liveHomeRun: "홈런",
  };
  return labels[key];
}

async function fetchTodayScoreSnapshotSafe(date: string): Promise<LiveScoreGame[]> {
  try {
    return await fetchLiveScoreSnapshot(date);
  } catch (error) {
    console.warn(
      `[admin/dashboard] failed to fetch naver score snapshot: ${(error as Error).message}`
    );
    return [];
  }
}

function mergeTodayGameRows(
  dbGames: DbTodayGameRow[],
  naverGames: LiveScoreGame[]
): TodayGameRow[] {
  const dbByExternalId = new Map(dbGames.map((game) => [game.externalId, game]));
  const seen = new Set<string>();

  const naverRows: TodayGameRow[] = naverGames.map((game) => {
    const dbGame = dbByExternalId.get(game.externalId);
    seen.add(game.externalId);
    return {
      id: dbGame?.id ?? game.externalId,
      externalId: game.externalId,
      homeTeam: dbGame?.homeTeam ?? game.homeTeam,
      awayTeam: dbGame?.awayTeam ?? game.awayTeam,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      status: game.status,
      gameDate: dbGame?.gameDate ?? game.gameDate,
      lastSyncedAt: dbGame?.lastSyncedAt ?? null,
      updatedAt: dbGame?.updatedAt ?? null,
      highlightVideoUrl: dbGame?.highlightVideoUrl ?? null,
      syncSource: dbGame ? "NAVER+DB" : "NAVER",
    };
  });

  const dbOnlyRows: TodayGameRow[] = dbGames
    .filter((game) => !seen.has(game.externalId))
    .map((game) => ({
      ...game,
      syncSource: "DB",
    }));

  return [...naverRows, ...dbOnlyRows].sort((a, b) => {
    const aTime = a.gameDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.gameDate?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return `${a.awayTeam}-${a.homeTeam}`.localeCompare(`${b.awayTeam}-${b.homeTeam}`);
  });
}

export default async function AdminDashboardPage({ searchParams }: Props) {
  const params = await Promise.resolve(searchParams ?? {});
  const key = firstParam(params.key);
  const expected = process.env.ADMIN_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!expected || !key || key !== expected) notFound();
  const db = prisma as any;

  const todayDate = todayKstDate();
  const todayStart = startOfTodayKst();
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalRegisteredUsers,
    totalUsers,
    recentUsers,
    newUsersToday,
    webPushCount,
    nativePushCount,
    webPushRows,
    nativePushRows,
    newWebPushToday,
    newNativePushToday,
    todaysTriggers,
    todayReadNotifications,
    todayNotifications,
    recentMarketingPushes,
    todayGames,
    todayScoreSnapshot,
    pendingNotifications,
    recentCronRuns,
    recentDispatchCount,
    failedPostgameCount,
    pendingPreviewCount,
    readyPostgameCount,
    auditLogs,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({
      where: {
        OR: [
          { pushSubscriptions: { some: { enabled: true } } },
          { nativePushTokens: { some: { enabled: true } } },
        ],
      },
    }),
    db.user.count({
      where: {
        OR: [
          {
            pushSubscriptions: {
              some: {
                enabled: true,
                OR: [
                  { lastSeenAt: { gte: thirtyDaysAgo } },
                  { createdAt: { gte: thirtyDaysAgo } },
                ],
              },
            },
          },
          {
            nativePushTokens: {
              some: {
                enabled: true,
                OR: [
                  { lastSeenAt: { gte: thirtyDaysAgo } },
                  { createdAt: { gte: thirtyDaysAgo } },
                ],
              },
            },
          },
        ],
      },
    }),
    db.user.count({ where: { createdAt: { gte: todayStart } } }),
    db.pushSubscription.count({ where: { enabled: true } }),
    db.nativePushToken.count({ where: { enabled: true } }),
    db.pushSubscription.findMany({
      where: { enabled: true },
      select: {
        userId: true,
        createdAt: true,
        updatedAt: true,
        lastSeenAt: true,
        topics: true,
        user: { select: { favoriteTeam: true } },
      },
    }),
    db.nativePushToken.findMany({
      where: { enabled: true },
      select: {
        userId: true,
        platform: true,
        favoriteTeam: true,
        appEnv: true,
        createdAt: true,
        updatedAt: true,
        lastSeenAt: true,
        topics: true,
        user: { select: { favoriteTeam: true } },
      },
    }),
    db.pushSubscription.count({ where: { enabled: true, createdAt: { gte: todayStart } } }),
    db.nativePushToken.count({ where: { enabled: true, createdAt: { gte: todayStart } } }),
    db.notification.count({
      where: {
        sentAt: { gte: todayStart },
      },
    }),
    db.notification.count({
      where: {
        sentAt: { gte: todayStart },
        isRead: true,
      },
    }),
    db.notification.findMany({
      where: {
        sentAt: { gte: todayStart },
      },
      orderBy: {
        sentAt: "desc",
      },
      select: {
        id: true,
        userId: true,
        type: true,
        title: true,
        body: true,
        sentAt: true,
        createdAt: true,
        user: {
          select: {
            favoriteTeam: true,
          },
        },
      },
      take: 3000,
    }),
    db.marketingPush.findMany({
      orderBy: { sentAt: "desc" },
      take: 30,
      select: {
        id: true,
        title: true,
        body: true,
        targetTeamId: true,
        sentCount: true,
        clickCount: true,
        testOnly: true,
        sentAt: true,
      },
    }),
    db.game.findMany({
      where: {
        OR: [
          { gameDate: { gte: todayStart, lt: todayEnd } },
          { updatedAt: { gte: todayStart } },
        ],
      },
      orderBy: [{ gameDate: "asc" }, { updatedAt: "desc" }],
      take: 20,
      select: {
        id: true,
        externalId: true,
        homeTeam: true,
        awayTeam: true,
        homeScore: true,
        awayScore: true,
        status: true,
        gameDate: true,
        lastSyncedAt: true,
        updatedAt: true,
        highlightVideoUrl: true,
      },
    }),
    fetchTodayScoreSnapshotSafe(todayDate),
    db.pendingPushNotification.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        teamId: true,
        topicKey: true,
        title: true,
        body: true,
        url: true,
        type: true,
        status: true,
        createdAt: true,
      },
    }),
    fetchRecentCronRuns(db),
    db.notificationDispatchState.count({ where: { createdAt: { gte: todayStart } } }),
    db.postGameReport.count({ where: { status: "FAILED", updatedAt: { gte: todayStart } } }),
    db.pregamePreview.count({ where: { status: "PENDING", updatedAt: { gte: todayStart } } }),
    db.postGameReport.count({ where: { status: "READY", updatedAt: { gte: todayStart } } }),
    fetchRecentAdminAuditLogs(18),
  ]);

  const webRows = webPushRows as WebPushKpiRow[];
  const nativeRows = nativePushRows as NativePushKpiRow[];
  const activePushUserIds = new Set<string>();
  const nativePushUserIds = new Set<string>();
  const teamUserSets = new Map<string, Set<string>>();
  const topicUserSets = new Map<TopicKey, Set<string>>();
  const topicChannelCounts = new Map<TopicKey, number>();
  const platformCounts = new Map<string, number>();
  for (const key of TOPIC_KEYS) {
    topicUserSets.set(key, new Set<string>());
    topicChannelCounts.set(key, 0);
  }

  for (const row of webRows) {
    activePushUserIds.add(row.userId);
    platformCounts.set("web", (platformCounts.get("web") ?? 0) + 1);
    const teamId = row.user.favoriteTeam ?? "unknown";
    if (!teamUserSets.has(teamId)) teamUserSets.set(teamId, new Set<string>());
    teamUserSets.get(teamId)!.add(row.userId);
    for (const key of TOPIC_KEYS) {
      if (!isTopicEnabled(row.topics, key)) continue;
      topicUserSets.get(key)!.add(row.userId);
      topicChannelCounts.set(key, (topicChannelCounts.get(key) ?? 0) + 1);
    }
  }

  for (const row of nativeRows) {
    activePushUserIds.add(row.userId);
    nativePushUserIds.add(row.userId);
    const platform = row.platform?.toLowerCase() || "native";
    platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
    const teamId = row.favoriteTeam ?? row.user.favoriteTeam ?? "unknown";
    if (!teamUserSets.has(teamId)) teamUserSets.set(teamId, new Set<string>());
    teamUserSets.get(teamId)!.add(row.userId);
    for (const key of TOPIC_KEYS) {
      if (!isTopicEnabled(row.topics, key)) continue;
      topicUserSets.get(key)!.add(row.userId);
      topicChannelCounts.set(key, (topicChannelCounts.get(key) ?? 0) + 1);
    }
  }

  const teamRows = Array.from(teamUserSets.entries())
    .map(([teamId, users]) => ({ teamId, count: users.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  const maxCount = teamRows[0]?.count ?? 1;
  const ranking: RankingRow[] = teamRows.map((row, idx): RankingRow => {
    const teamId = row.teamId;
    const team = teamId === "unknown" ? null : findTeam(teamId);
    const count = row.count;
    const ratio = Math.max(6, Math.round((count / maxCount) * 100));
    return {
      rank: idx + 1,
      teamId,
      label: team ? team.name : teamId,
      short: team ? team.short : teamId.toUpperCase(),
      accent: team ? team.accent : "#888888",
      count,
      ratio,
    };
  });
  const activePushUsers = activePushUserIds.size;
  const nativePushUsers = nativePushUserIds.size;
  const pushOptInRate = totalRegisteredUsers > 0 ? (activePushUsers / totalRegisteredUsers) * 100 : 0;
  const nativeUserShare = activePushUsers > 0 ? (nativePushUsers / activePushUsers) * 100 : 0;
  const todayReadRate = todaysTriggers > 0 ? (todayReadNotifications / todaysTriggers) * 100 : 0;
  const topicRows: TopicKpiRow[] = TOPIC_KEYS.map((key) => ({
    key,
    label: topicLabel(key),
    users: topicUserSets.get(key)?.size ?? 0,
    channels: topicChannelCounts.get(key) ?? 0,
    ratio: activePushUsers > 0 ? ((topicUserSets.get(key)?.size ?? 0) / activePushUsers) * 100 : 0,
  })).sort((a, b) => b.users - a.users);
  const platformRows: PlatformKpiRow[] = Array.from(platformCounts.entries())
    .map(([key, count]) => ({
      key,
      label: key === "web" ? "Web PWA" : key.toUpperCase(),
      count,
      ratio: totalPushChannels > 0 ? (count / totalPushChannels) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const grouped = new Map<
    string,
    {
      key: string;
      sentAt: Date;
      type: string;
      title: string;
      body: string;
      userIds: Set<string>;
      teamCount: Map<string, number>;
    }
  >();
  for (const row of todayNotifications) {
    const sentAt = row.sentAt ?? row.createdAt;
    const key = [sentAt.toISOString(), row.type, row.title, row.body].join("::");
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        key,
        sentAt,
        type: row.type,
        title: row.title,
        body: row.body,
        userIds: new Set([row.userId]),
        teamCount: new Map(),
      });
    } else {
      existing.userIds.add(row.userId);
    }
    const group = grouped.get(key);
    if (!group) continue;
    const teamId = row.user.favoriteTeam ?? "unknown";
    group.teamCount.set(teamId, (group.teamCount.get(teamId) ?? 0) + 1);
  }

  const marketingPushRows = recentMarketingPushes.map((p: any) => {
    const ctr = p.sentCount > 0 ? ((p.clickCount / p.sentCount) * 100).toFixed(1) : "0.0";
    const targetLabel = p.targetTeamId
      ? (TEAMS.find((t) => t.id === p.targetTeamId)?.name ?? p.targetTeamId)
      : "전체 유저";
    return {
      ...p,
      targetLabel,
      ctr,
      sentAt: formatDateTimeKst(p.sentAt),
    };
  });

  const todayAlertRuns = Array.from(grouped.values())
    .map((group) => {
      const sortedTeams = Array.from(group.teamCount.entries()).sort((a, b) => b[1] - a[1]);
      const targetTeam =
        sortedTeams.length === 0
          ? "팀 미지정"
          : sortedTeams.length === 1
            ? resolveTeamLabel(sortedTeams[0][0] === "unknown" ? null : sortedTeams[0][0])
            : `혼합(${sortedTeams.length}팀)`;
      const teamBreakdown = sortedTeams
        .slice(0, 3)
        .map(([teamId, count]) => `${resolveTeamLabel(teamId === "unknown" ? null : teamId)} ${formatNumber(count)}명`)
        .join(" · ");
      return {
        ...group,
        receivers: group.userIds.size,
        targetTeam,
        teamBreakdown,
      };
    })
    .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());

  const gameRows = mergeTodayGameRows(todayGames as DbTodayGameRow[], todayScoreSnapshot);
  const gameStatusCounts = gameRows.reduce<Record<string, number>>((acc, game) => {
    acc[game.status] = (acc[game.status] ?? 0) + 1;
    return acc;
  }, {});
  const latestCron = recentCronRuns[0] as CronRunRow | undefined;
  const failedCronRuns = recentCronRuns.filter((run: CronRunRow) => run.status === "error").length;
  const pendingItems = pendingNotifications.map((item: any) => ({
    ...item,
    createdAt: item.createdAt.toISOString(),
  }));
  const totalPushChannels = webPushCount + nativePushCount;

  return (
    <main className="min-h-dvh bg-slate-950 text-slate-100">
      <section className="mx-auto max-w-[1680px] px-8 py-10 pb-28 2xl:px-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
          <div>
          <p className="text-[11px] uppercase tracking-[0.34em] text-slate-400">GROUND ADMIN</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">운영 관제 대시보드</h1>
          <p className="mt-2 text-sm text-slate-400">
            경기 데이터, 알림, AI 콘텐츠, 수동 발송을 한 화면에서 점검합니다.
          </p>
          </div>
          <div className="rounded-full border border-white/10 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-300">
            Desktop Ops Console
          </div>
        </div>

        <OperationalOverview
          gameStatusCounts={gameStatusCounts}
          todaysTriggers={todaysTriggers}
          recentDispatchCount={recentDispatchCount}
          totalPushChannels={totalPushChannels}
          webPushCount={webPushCount}
          nativePushCount={nativePushCount}
          latestCron={latestCron}
          failedCronRuns={failedCronRuns}
          failedPostgameCount={failedPostgameCount}
          pendingPreviewCount={pendingPreviewCount}
          readyPostgameCount={readyPostgameCount}
        />

        <AppLaunchKpiSection
          totalRegisteredUsers={totalRegisteredUsers}
          newUsersToday={newUsersToday}
          activePushUsers={activePushUsers}
          recentUsers={recentUsers}
          pushOptInRate={pushOptInRate}
          totalPushChannels={totalPushChannels}
          webPushCount={webPushCount}
          nativePushCount={nativePushCount}
          nativePushUsers={nativePushUsers}
          nativeUserShare={nativeUserShare}
          newWebPushToday={newWebPushToday}
          newNativePushToday={newNativePushToday}
          todaysTriggers={todaysTriggers}
          todayReadNotifications={todayReadNotifications}
          todayReadRate={todayReadRate}
          platformRows={platformRows}
          topicRows={topicRows}
        />

        <GameControlSection games={gameRows} />

        <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <h2 className="text-lg font-semibold tracking-tight text-white">트랙션 요약</h2>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <CompactStat label="Active" value={formatNumber(totalUsers)} hint={`30일 ${formatNumber(recentUsers)}`} />
              <CompactStat label="Triggers" value={formatNumber(todaysTriggers)} hint="KST 오늘" />
              <CompactStat label="Top Team" value={ranking[0]?.short ?? "-"} hint={ranking[0] ? `${formatNumber(ranking[0].count)}명` : "대기"} />
            </div>
          </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
          <h2 className="text-lg font-semibold tracking-tight text-white">구단별 화력 랭킹</h2>
          <p className="mt-1 text-xs text-slate-400">
            favoriteTeam + 활성 구독자 기준 Top 10
          </p>

          {ranking.length === 0 ? (
            <p className="mt-6 text-sm text-slate-400">아직 집계할 구독 데이터가 없습니다.</p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {ranking.map((row: RankingRow) => (
                <li
                  key={row.teamId}
                  className="rounded-xl border border-white/5 bg-slate-950/55 p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-white/10 px-1 text-[11px] font-bold">
                        {row.rank}
                      </span>
                      <span className="text-sm font-semibold">{row.label}</span>
                      <span className="text-[11px] text-slate-400">{row.short}</span>
                    </div>
                    <span className="text-sm font-bold text-white">{formatNumber(row.count)}명</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${row.ratio}%`,
                        backgroundColor: row.accent,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_1fr]">
          <CronStatusSection runs={recentCronRuns} />

          <CronTrigger />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 2xl:grid-cols-[0.95fr_1.05fr]">
          <PendingNotificationsSection initialItems={pendingItems} adminKey={key!} />

          <PushSenderForm
            adminKey={key!}
            teams={TEAMS.map((t) => ({ id: t.id, name: t.name, short: t.short }))}
          />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
          <MarketingPushStats rows={marketingPushRows} />

          <AdminAuditSection logs={auditLogs} />
        </div>

        <div className="mt-8">
          <div className="px-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-red-300/70">Danger Zone</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">위험 작업</h2>
            <p className="mt-1 text-xs text-slate-400">삭제/정리성 작업은 아래 구역에 격리합니다.</p>
          </div>
          <UserCleanup />
        </div>

        <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
          <h2 className="text-lg font-semibold tracking-tight text-white">오늘 발송 알럿 히스토리</h2>
          <p className="mt-1 text-xs text-slate-400">
            발송 시각 + 메시지 기준으로 묶어, 어떤 팀에 몇 명에게 어떤 내용을 보냈는지 보여줍니다.
          </p>

          {todayAlertRuns.length === 0 ? (
            <p className="mt-6 text-sm text-slate-400">오늘 발송된 알럿이 없습니다.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {todayAlertRuns.map((run) => (
                <li
                  key={run.key}
                  className="rounded-xl border border-white/5 bg-slate-950/55 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-white">{run.title}</p>
                    <span className="text-xs text-slate-400">{formatDateTimeKst(run.sentAt)} KST</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-200">{run.body}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                    <span>타입: {run.type}</span>
                    <span>대상팀: {run.targetTeam}</span>
                    <span>수신: {formatNumber(run.receivers)}명</span>
                  </div>
                  {run.teamBreakdown ? (
                    <p className="mt-2 text-xs text-slate-400">팀 분포: {run.teamBreakdown}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/20 bg-emerald-950/20"
      : tone === "warn"
        ? "border-amber-500/20 bg-amber-950/20"
        : tone === "bad"
          ? "border-red-500/20 bg-red-950/20"
          : "border-white/10 bg-slate-900/70";
  return (
    <div className={`rounded-2xl border px-5 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.2)] ${toneClass}`}>
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-white xl:text-3xl">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{hint}</p>
    </div>
  );
}

function CompactStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-slate-950/55 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      <p className="mt-0.5 truncate text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

function OperationalOverview({
  gameStatusCounts,
  todaysTriggers,
  recentDispatchCount,
  totalPushChannels,
  webPushCount,
  nativePushCount,
  latestCron,
  failedCronRuns,
  failedPostgameCount,
  pendingPreviewCount,
  readyPostgameCount,
}: {
  gameStatusCounts: Record<string, number>;
  todaysTriggers: number;
  recentDispatchCount: number;
  totalPushChannels: number;
  webPushCount: number;
  nativePushCount: number;
  latestCron?: CronRunRow;
  failedCronRuns: number;
  failedPostgameCount: number;
  pendingPreviewCount: number;
  readyPostgameCount: number;
}) {
  const liveCount = gameStatusCounts.LIVE ?? 0;
  const suspendedCount = gameStatusCounts.SUSPENDED ?? 0;
  const resultCount = gameStatusCounts.RESULT ?? 0;
  const cancelCount = gameStatusCounts.CANCEL ?? 0;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Game Control"
        value={`${liveCount} LIVE / ${resultCount} FT`}
        hint={`중단 ${suspendedCount} · 취소 ${cancelCount} · 총 ${Object.values(gameStatusCounts).reduce((a, b) => a + b, 0)}경기`}
        tone={suspendedCount > 0 ? "warn" : "neutral"}
      />
      <MetricCard
        label="Notification Ops"
        value={formatNumber(todaysTriggers)}
        hint={`오늘 인앱/푸시 생성 기준 · Dispatch lock ${formatNumber(recentDispatchCount)}건`}
        tone="good"
      />
      <MetricCard
        label="Push Channels"
        value={formatNumber(totalPushChannels)}
        hint={`Web ${formatNumber(webPushCount)} · Native ${formatNumber(nativePushCount)}`}
      />
      <MetricCard
        label="Cron / AI"
        value={failedCronRuns > 0 || failedPostgameCount > 0 ? "주의" : "정상"}
        hint={`최근 크론 실패 ${failedCronRuns} · 한줄평 실패 ${failedPostgameCount} · 프리뷰 대기 ${pendingPreviewCount} · 한줄평 완료 ${readyPostgameCount}${latestCron ? ` · 최근 ${latestCron.name}` : ""}`}
        tone={failedCronRuns > 0 || failedPostgameCount > 0 ? "bad" : pendingPreviewCount > 0 ? "warn" : "good"}
      />
    </div>
  );
}

function AppLaunchKpiSection({
  totalRegisteredUsers,
  newUsersToday,
  activePushUsers,
  recentUsers,
  pushOptInRate,
  totalPushChannels,
  webPushCount,
  nativePushCount,
  nativePushUsers,
  nativeUserShare,
  newWebPushToday,
  newNativePushToday,
  todaysTriggers,
  todayReadNotifications,
  todayReadRate,
  platformRows,
  topicRows,
}: {
  totalRegisteredUsers: number;
  newUsersToday: number;
  activePushUsers: number;
  recentUsers: number;
  pushOptInRate: number;
  totalPushChannels: number;
  webPushCount: number;
  nativePushCount: number;
  nativePushUsers: number;
  nativeUserShare: number;
  newWebPushToday: number;
  newNativePushToday: number;
  todaysTriggers: number;
  todayReadNotifications: number;
  todayReadRate: number;
  platformRows: PlatformKpiRow[];
  topicRows: TopicKpiRow[];
}) {
  const topTopics = topicRows.slice(0, 5);
  return (
    <div className="mt-8 rounded-2xl border border-sky-400/15 bg-slate-900/70 p-5 shadow-[0_18px_60px_rgba(2,6,23,0.35)]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-sky-300/80">Launch Analytics</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-white">앱 출시 KPI</h2>
          <p className="mt-1 text-xs text-slate-400">
            App Store 유입은 App Store Connect, 실제 앱 운영은 여기서 봅니다.
          </p>
        </div>
        <a
          href="https://appstoreconnect.apple.com/analytics"
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-sky-300/20 bg-sky-950/30 px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-900/40"
        >
          App Store Connect 열기
        </a>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Registered Users"
          value={formatNumber(totalRegisteredUsers)}
          hint={`오늘 신규 ${formatNumber(newUsersToday)} · 푸시 유저 ${formatNumber(activePushUsers)}`}
          tone="neutral"
        />
        <MetricCard
          label="Push Opt-in"
          value={formatPercent(pushOptInRate)}
          hint={`30일 활성 ${formatNumber(recentUsers)}명 · 채널 ${formatNumber(totalPushChannels)}개`}
          tone={pushOptInRate >= 60 ? "good" : pushOptInRate >= 30 ? "warn" : "bad"}
        />
        <MetricCard
          label="Native App"
          value={formatNumber(nativePushUsers)}
          hint={`Native 채널 ${formatNumber(nativePushCount)} · 유저 기준 ${formatPercent(nativeUserShare)}`}
          tone={nativePushUsers > 0 ? "good" : "warn"}
        />
        <MetricCard
          label="Today Alert Read"
          value={formatPercent(todayReadRate)}
          hint={`발송 ${formatNumber(todaysTriggers)} · 읽음 ${formatNumber(todayReadNotifications)}`}
          tone={todaysTriggers === 0 ? "neutral" : todayReadRate >= 20 ? "good" : "warn"}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-xl border border-white/5 bg-slate-950/55 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">채널 구성</h3>
            <span className="text-xs text-slate-400">
              오늘 신규 Web {formatNumber(newWebPushToday)} · Native {formatNumber(newNativePushToday)}
            </span>
          </div>
          {platformRows.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">아직 푸시 채널이 없습니다.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {platformRows.map((row) => (
                <li key={row.key}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-200">{row.label}</span>
                    <span className="text-slate-400">{formatNumber(row.count)} · {formatPercent(row.ratio)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.max(4, row.ratio)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-white/5 bg-slate-950/55 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-white">알림 토픽 허용</h3>
            <span className="text-xs text-slate-400">유저 기준 Top 5</span>
          </div>
          {topTopics.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">아직 토픽 데이터가 없습니다.</p>
          ) : (
            <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              {topTopics.map((row) => (
                <li key={row.key} className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white">{row.label}</span>
                    <span className="text-xs text-slate-400">{formatPercent(row.ratio)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatNumber(row.users)}명 · 채널 {formatNumber(row.channels)}개
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function GameControlSection({ games }: { games: TodayGameRow[] }) {
  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-white">경기 관제</h2>
          <p className="mt-1 text-xs text-slate-400">Naver 오늘 경기 전체와 DB 동기화 상태를 함께 봅니다.</p>
        </div>
        <span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs font-semibold text-slate-300">
          {games.length} games
        </span>
      </div>

      {games.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">오늘 경기 데이터가 없습니다. Naver 스냅샷 또는 스코어 체크 상태를 확인하세요.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.14em] text-slate-400">
                <th className="pb-2 pr-4 font-semibold">Match</th>
                <th className="pb-2 pr-4 text-center font-semibold">Score</th>
                <th className="pb-2 pr-4 font-semibold">Status</th>
                <th className="pb-2 pr-4 font-semibold">Source</th>
                <th className="pb-2 pr-4 font-semibold">Last Sync</th>
                <th className="pb-2 pr-4 font-semibold">Ops Hint</th>
                <th className="pb-2 text-right font-semibold">Game ID</th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => {
                const away = findTeam(game.awayTeam);
                const home = findTeam(game.homeTeam);
                const hint =
                  game.syncSource === "NAVER"
                    ? "DB 미동기화 · 스코어 체크 필요"
                    : game.status === "RESULT"
                    ? game.highlightVideoUrl
                      ? "한줄평/하이라이트 확인"
                      : "한줄평·하이라이트 체크"
                    : game.status === "LIVE"
                      ? "스코어·라이브 이벤트 감시"
                      : game.status === "SUSPENDED"
                        ? "우천 중단 알림/취소 전환 감시"
                        : game.status === "CANCEL"
                          ? "취소 알림 여부 확인"
                          : "라인업/프리뷰 대기";
                const sourceTone =
                  game.syncSource === "NAVER+DB"
                    ? "border-emerald-500/20 bg-emerald-950/40 text-emerald-300"
                    : game.syncSource === "NAVER"
                      ? "border-amber-500/20 bg-amber-950/40 text-amber-300"
                      : "border-slate-500/20 bg-slate-800/70 text-slate-300";
                return (
                  <tr key={game.externalId} className="border-b border-white/5 last:border-0">
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-white">{away.short} @ {home.short}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{away.name} vs {home.name}</p>
                    </td>
                    <td className="py-3 pr-4 text-center text-lg font-bold tabular-nums text-white">
                      {game.awayScore}<span className="mx-1 text-slate-500">:</span>{game.homeScore}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(game.status)}`}>
                        {game.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${sourceTone}`}>
                        {game.syncSource}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-400">
                      {game.lastSyncedAt ? `${formatDateTimeKst(game.lastSyncedAt)} KST` : "DB 미동기화"}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">{hint}</td>
                    <td className="py-3 text-right font-mono text-xs text-slate-500">{game.externalId}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CronStatusSection({ runs }: { runs: CronRunRow[] }) {
  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <h2 className="text-lg font-semibold tracking-tight text-white">크론 실행 상태</h2>
      <p className="mt-1 text-xs text-slate-400">최근 실행 결과를 운영자가 읽을 수 있는 형태로 요약합니다.</p>
      {runs.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">아직 cron_runs 로그가 없습니다.</p>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {runs.map((run) => (
            <li key={run.id} className="rounded-xl border border-white/5 bg-slate-950/55 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-white">{run.name}</p>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusTone(run.status)}`}>
                  {run.status}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {formatDateTimeKst(run.started_at)} KST
                {run.duration_ms != null ? ` · ${(run.duration_ms / 1000).toFixed(1)}s` : ""}
              </p>
              {stringifySummary(run.summary) && (
                <p className="mt-2 text-xs text-slate-300">{stringifySummary(run.summary)}</p>
              )}
              {run.error && <p className="mt-2 text-xs text-red-300">{run.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminAuditSection({ logs }: { logs: AdminAuditLogRow[] }) {
  return (
    <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <h2 className="text-lg font-semibold tracking-tight text-white">운영 로그</h2>
      <p className="mt-1 text-xs text-slate-400">어드민에서 누른 버튼과 결과를 추적합니다.</p>
      {logs.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">아직 운영 로그가 없습니다.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {logs.map((log) => (
            <li key={log.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/5 bg-slate-950/55 px-4 py-3 text-sm">
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusTone(log.result)}`}>
                {log.result}
              </span>
              <span className="font-semibold text-white">{log.action}</span>
              {log.target_type && <span className="text-slate-400">{log.target_type}{log.target_id ? `:${log.target_id}` : ""}</span>}
              <span className="ml-auto text-xs text-slate-500">{formatDateTimeKst(log.created_at)} KST</span>
              {log.error && <span className="basis-full text-xs text-red-300">{log.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
