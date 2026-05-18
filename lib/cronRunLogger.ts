import { prisma } from "@/lib/prisma";

let tableEnsured = false;

async function ensureCronRunsTable(): Promise<void> {
  if (tableEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS cron_runs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at TIMESTAMPTZ,
      duration_ms INTEGER,
      meta JSONB,
      summary JSONB,
      error TEXT
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS cron_runs_name_started_at_idx
    ON cron_runs (name, started_at DESC)
  `);
  tableEnsured = true;
}

export async function startCronRun(name: string, meta: Record<string, unknown>) {
  const id = crypto.randomUUID();
  try {
    await ensureCronRunsTable();
    await prisma.$executeRawUnsafe(
      `INSERT INTO cron_runs (id, name, status, started_at, meta)
       VALUES ($1, $2, 'running', NOW(), $3::jsonb)`,
      id,
      name,
      JSON.stringify(meta)
    );
  } catch (error) {
    console.warn("[cron-runs] failed to start run log", { name, error });
  }
  return id;
}

export async function finishCronRun(input: {
  id: string;
  status: "success" | "partial" | "error";
  summary: Record<string, unknown>;
  error?: string | null;
}) {
  try {
    await ensureCronRunsTable();
    await prisma.$executeRawUnsafe(
      `UPDATE cron_runs
       SET status = $2,
           finished_at = NOW(),
           duration_ms = FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000)::INTEGER,
           summary = $3::jsonb,
           error = $4
       WHERE id = $1`,
      input.id,
      input.status,
      JSON.stringify(input.summary),
      input.error ?? null
    );
  } catch (error) {
    console.warn("[cron-runs] failed to finish run log", { id: input.id, error });
  }
}
