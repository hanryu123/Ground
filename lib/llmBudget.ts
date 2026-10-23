import { prisma } from "@/lib/prisma";

/**
 * Claude API 예산 — 월 9.5달러, 하루 1달러를 넘지 않게 막는다.
 *
 *  - 호출 전 canSpendLlm(feature) 로 확인하고, 응답의 usage 를 recordLlmUsage 로 DB(LlmUsage)에 쌓는다.
 *  - 상한을 넘으면 false → 호출하는 쪽은 미리 써 둔 문구·키워드 분류로 대신한다.
 *  - 2026-10-21~22 뉴스 분류가 배포마다 일주일 치를 다시 분류해 하루 만에 크레딧을 다 쓴 사고 뒤 추가.
 *  - 테이블은 Prisma 스키마 밖에서 처음 쓸 때 스스로 만든다 (Vercel 민감 환경변수라 로컬에서 마이그레이션 불가).
 *  - DB 를 못 읽으면 쓰지 않는 쪽으로 판단한다 (알림은 대체 문구로 계속 나간다).
 */

const MONTHLY_BUDGET_USD = Number(process.env.LLM_MONTHLY_BUDGET_USD ?? 9.5);
const DAILY_BUDGET_USD = Number(process.env.LLM_DAILY_BUDGET_USD ?? 1);
/** 같은 인스턴스에서 예산 합계를 다시 읽는 간격 */
const BUDGET_CACHE_MS = 60_000;

/** 1M 토큰당 달러 = 토큰 1개당 마이크로달러 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};
/** 표에 없는 모델은 비싼 쪽으로 계산한다 */
const FALLBACK_PRICE = { input: 5, output: 25 };

export type LlmFeature = "news" | "push" | "preview" | "postgame" | "status" | "admin";

function kstDay(offsetMs = 0): string {
  return new Date(Date.now() + 9 * 3600_000 + offsetMs).toISOString().slice(0, 10);
}

let tablesReady: Promise<void> | null = null;

/** LlmUsage·NewsClassification 테이블이 없으면 만든다 (인스턴스당 한 번) */
export function ensureLlmTables(): Promise<void> {
  tablesReady ??= (async () => {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "LlmUsage" (
        "day" TEXT NOT NULL,
        "feature" TEXT NOT NULL,
        "model" TEXT NOT NULL,
        "calls" INTEGER NOT NULL DEFAULT 0,
        "inputTokens" BIGINT NOT NULL DEFAULT 0,
        "outputTokens" BIGINT NOT NULL DEFAULT 0,
        "costMicros" BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY ("day", "feature", "model")
      )`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "NewsClassification" (
        "id" TEXT PRIMARY KEY,
        "day" TEXT NOT NULL,
        "teams" TEXT[] NOT NULL,
        "tag" TEXT,
        "story" TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await prisma.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS "NewsClassification_day_idx" ON "NewsClassification" ("day")`
    );
  })().catch((err) => {
    tablesReady = null; // 다음 호출에서 다시 시도
    throw err;
  });
  return tablesReady;
}

let spentCache: { at: number; month: number; day: number } | null = null;

async function readSpentMicros(): Promise<{ month: number; day: number }> {
  if (spentCache && Date.now() - spentCache.at < BUDGET_CACHE_MS) return spentCache;
  await ensureLlmTables();
  const today = kstDay();
  const monthStart = `${today.slice(0, 7)}-01`;
  const rows = await prisma.$queryRawUnsafe<Array<{ month: bigint | null; day: bigint | null }>>(
    `SELECT
       COALESCE(SUM("costMicros"), 0) AS month,
       COALESCE(SUM("costMicros") FILTER (WHERE "day" = $1), 0) AS day
     FROM "LlmUsage" WHERE "day" >= $2`,
    today,
    monthStart
  );
  const row = rows[0];
  spentCache = { at: Date.now(), month: Number(row?.month ?? 0), day: Number(row?.day ?? 0) };
  return spentCache;
}

/** 이번 달·오늘 예산이 남았는지. DB 를 못 읽으면 false */
export async function canSpendLlm(feature: LlmFeature): Promise<boolean> {
  if (!process.env.ANTHROPIC_API_KEY) return false;
  try {
    const spent = await readSpentMicros();
    const ok = spent.month < MONTHLY_BUDGET_USD * 1e6 && spent.day < DAILY_BUDGET_USD * 1e6;
    if (!ok) console.warn(`[llmBudget] ${feature} skipped — month $${(spent.month / 1e6).toFixed(2)}, today $${(spent.day / 1e6).toFixed(2)}`);
    return ok;
  } catch (err) {
    console.warn(`[llmBudget] budget check failed, skipping ${feature}:`, (err as Error).message);
    return false;
  }
}

/** Claude 응답의 usage 를 기록한다. 실패해도 호출 흐름은 막지 않는다 */
export async function recordLlmUsage(
  feature: LlmFeature,
  model: string,
  usage: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } | null | undefined
): Promise<void> {
  if (!usage) return;
  const price = PRICE_PER_MTOK[model] ?? FALLBACK_PRICE;
  const input =
    (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  const output = usage.output_tokens ?? 0;
  const cost = Math.ceil(input * price.input + output * price.output);
  if (spentCache) {
    spentCache.month += cost;
    spentCache.day += cost;
  }
  try {
    await ensureLlmTables();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "LlmUsage" ("day", "feature", "model", "calls", "inputTokens", "outputTokens", "costMicros")
       VALUES ($1, $2, $3, 1, $4, $5, $6)
       ON CONFLICT ("day", "feature", "model") DO UPDATE SET
         "calls" = "LlmUsage"."calls" + 1,
         "inputTokens" = "LlmUsage"."inputTokens" + EXCLUDED."inputTokens",
         "outputTokens" = "LlmUsage"."outputTokens" + EXCLUDED."outputTokens",
         "costMicros" = "LlmUsage"."costMicros" + EXCLUDED."costMicros"`,
      kstDay(),
      feature,
      model,
      input,
      output,
      cost
    );
  } catch (err) {
    console.warn("[llmBudget] usage record failed:", (err as Error).message);
  }
}

/** 관리자·진단용 — 이번 달 기능별 사용량 */
export async function llmUsageThisMonth() {
  await ensureLlmTables();
  const monthStart = `${kstDay().slice(0, 7)}-01`;
  const rows = await prisma.$queryRawUnsafe<
    Array<{ feature: string; model: string; calls: number; costMicros: bigint }>
  >(
    `SELECT "feature", "model", SUM("calls")::int AS calls, SUM("costMicros") AS "costMicros"
     FROM "LlmUsage" WHERE "day" >= $1 GROUP BY 1, 2 ORDER BY 4 DESC`,
    monthStart
  );
  return {
    budgetUsd: MONTHLY_BUDGET_USD,
    spentUsd: rows.reduce((s, r) => s + Number(r.costMicros), 0) / 1e6,
    byFeature: rows.map((r) => ({ feature: r.feature, model: r.model, calls: r.calls, usd: Number(r.costMicros) / 1e6 })),
  };
}

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

/**
 * 예산을 지키는 Claude 호출. 예산이 없으면 실제로 부르지 않고 429 응답을 돌려줘서,
 * 호출하는 쪽의 기존 실패 처리(대체 문구)를 그대로 타게 한다. 성공하면 사용량을 기록한다.
 */
export async function claudeFetch(feature: LlmFeature, model: string, init: RequestInit): Promise<Response> {
  if (!(await canSpendLlm(feature))) {
    return new Response(JSON.stringify({ type: "error", error: { type: "budget_exceeded" } }), { status: 429 });
  }
  const res = await fetch(ANTHROPIC_URL, init);
  if (res.ok) {
    try {
      const json = (await res.clone().json()) as { usage?: Parameters<typeof recordLlmUsage>[2] };
      await recordLlmUsage(feature, model, json.usage);
    } catch {
      // 기록 실패는 호출 결과에 영향 주지 않는다
    }
  }
  return res;
}
