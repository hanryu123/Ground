import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";

/**
 * 알림 효과 측정 — 보낸 알림 묶음(PushBatch)과 그 알림을 눌러 앱을 연 기록(PushOpen).
 *
 *  발송 쪽: newPushBatchId() 로 ID 를 만들고 링크에 ?gb=<id> 를 붙여 보낸 뒤 recordPushBatch().
 *  앱 쪽: 링크로 열리면 /api/notifications/opened 가 recordPushOpen() (사람당 한 번).
 *  측정 실패가 발송을 막으면 안 되므로 기록 함수는 전부 예외를 삼킨다.
 */

export type PushBatchKind = "score" | "live" | "pitcher" | "preview" | "report" | "highlight" | "stove-league" | "other";

let ready: Promise<void> | null = null;

export function ensurePushMetricTables(): Promise<void> {
  ready ??= (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PushBatch" (
        "id" TEXT PRIMARY KEY,
        "kind" TEXT NOT NULL,
        "teamId" TEXT,
        "title" TEXT NOT NULL,
        "sentCount" INTEGER NOT NULL DEFAULT 0,
        "byStyle" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "PushBatch_createdAt_idx" ON "PushBatch" ("createdAt")`
    );
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PushOpen" (
        "batchId" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "casterStyle" TEXT,
        "openedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY ("batchId", "userId")
      )`);
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

export function newPushBatchId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 16);
}

/** 링크에 측정용 gb 파라미터를 붙인다 (이미 쿼리가 있어도 안전) */
export function withPushBatch(url: string, batchId: string): string {
  const [path, hash = ""] = url.split("#");
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}gb=${batchId}${hash ? `#${hash}` : ""}`;
}

/** topicKey → 측정 분류 */
export function pushKindFromTopic(topicKey: string): PushBatchKind {
  const map: Record<string, PushBatchKind> = {
    score: "score",
    livePitcherChange: "live",
    liveStrikeout: "live",
    liveHomeRun: "live",
    pitcher: "pitcher",
    preGame: "preview",
    postGame: "report",
    highlight: "highlight",
    stoveLeague: "stove-league",
  };
  return map[topicKey] ?? "other";
}

export async function recordPushBatch(input: {
  id: string;
  kind: PushBatchKind;
  teamId: string | null;
  title: string;
  sentCount: number;
  byStyle?: Record<string, number>;
}): Promise<void> {
  if (input.sentCount <= 0) return;
  try {
    await ensurePushMetricTables();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "PushBatch" ("id","kind","teamId","title","sentCount","byStyle")
       VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT ("id") DO NOTHING`,
      input.id,
      input.kind,
      input.teamId,
      input.title.slice(0, 200),
      input.sentCount,
      JSON.stringify(input.byStyle ?? {})
    );
  } catch (err) {
    console.warn("[pushMetrics] batch record failed:", (err as Error).message);
  }
}

export async function recordPushOpen(input: { batchId: string; userId: string; casterStyle: string | null }): Promise<boolean> {
  try {
    await ensurePushMetricTables();
    const n = await prisma.$executeRawUnsafe(
      `INSERT INTO "PushOpen" ("batchId","userId","casterStyle")
       SELECT $1,$2,$3 WHERE EXISTS (SELECT 1 FROM "PushBatch" WHERE "id" = $1)
       ON CONFLICT ("batchId","userId") DO NOTHING`,
      input.batchId,
      input.userId,
      input.casterStyle
    );
    return n > 0;
  } catch (err) {
    console.warn("[pushMetrics] open record failed:", (err as Error).message);
    return false;
  }
}

export type PushEffectRow = { key: string; batches: number; sent: number; opened: number };

/** 최근 N일 — 분류별·말투별 열람률 (어드민 '알림 효과') */
export async function getPushEffect(days = 30): Promise<{ byKind: PushEffectRow[]; byStyle: PushEffectRow[]; recent: Array<{ id: string; kind: string; teamId: string | null; title: string; sent: number; opened: number; createdAt: string }> }> {
  await ensurePushMetricTables();
  const since = new Date(Date.now() - days * 86400_000);
  const byKind = await prisma.$queryRawUnsafe<Array<{ key: string; batches: bigint; sent: bigint; opened: bigint }>>(
    `SELECT b."kind" AS key, COUNT(*) AS batches, COALESCE(SUM(b."sentCount"),0) AS sent,
            COALESCE(SUM((SELECT COUNT(*) FROM "PushOpen" o WHERE o."batchId" = b."id")),0) AS opened
       FROM "PushBatch" b WHERE b."createdAt" >= $1 GROUP BY b."kind" ORDER BY sent DESC`,
    since
  );
  const sentByStyle = await prisma.$queryRawUnsafe<Array<{ key: string; batches: bigint; sent: bigint }>>(
    `SELECT s.key AS key, COUNT(*) AS batches, COALESCE(SUM((s.value)::int),0) AS sent
       FROM "PushBatch" b, jsonb_each_text(b."byStyle") s
      WHERE b."createdAt" >= $1 GROUP BY s.key`,
    since
  );
  const openedByStyle = await prisma.$queryRawUnsafe<Array<{ key: string; opened: bigint }>>(
    `SELECT COALESCE(o."casterStyle",'analyst') AS key, COUNT(*) AS opened
       FROM "PushOpen" o JOIN "PushBatch" b ON b."id" = o."batchId"
      WHERE b."createdAt" >= $1 AND b."kind" = 'score' GROUP BY 1`,
    since
  );
  const recent = await prisma.$queryRawUnsafe<Array<{ id: string; kind: string; teamId: string | null; title: string; sent: number; opened: bigint; createdAt: Date }>>(
    `SELECT b."id", b."kind", b."teamId", b."title", b."sentCount" AS sent, b."createdAt",
            (SELECT COUNT(*) FROM "PushOpen" o WHERE o."batchId" = b."id") AS opened
       FROM "PushBatch" b WHERE b."createdAt" >= $1 ORDER BY b."createdAt" DESC LIMIT 30`,
    since
  );
  const openedMap = new Map(openedByStyle.map((r) => [r.key, Number(r.opened)]));
  return {
    byKind: byKind.map((r) => ({ key: r.key, batches: Number(r.batches), sent: Number(r.sent), opened: Number(r.opened) })),
    byStyle: sentByStyle
      .map((r) => ({ key: r.key, batches: Number(r.batches), sent: Number(r.sent), opened: openedMap.get(r.key) ?? 0 }))
      .sort((a, b) => b.sent - a.sent),
    recent: recent.map((r) => ({ id: r.id, kind: r.kind, teamId: r.teamId, title: r.title, sent: Number(r.sent), opened: Number(r.opened), createdAt: r.createdAt.toISOString() })),
  };
}
