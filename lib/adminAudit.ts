import { prisma } from "@/lib/prisma";

let tableEnsured = false;

async function ensureAdminAuditTable(): Promise<void> {
  if (tableEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
      id TEXT PRIMARY KEY,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      payload JSONB,
      result TEXT NOT NULL,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
    ON admin_audit_logs (created_at DESC)
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS admin_audit_logs_action_created_at_idx
    ON admin_audit_logs (action, created_at DESC)
  `);
  tableEnsured = true;
}

export async function writeAdminAuditLog(input: {
  actor?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  payload?: Record<string, unknown> | null;
  result: "success" | "error" | "blocked";
  error?: string | null;
}): Promise<void> {
  try {
    await ensureAdminAuditTable();
    await prisma.$executeRawUnsafe(
      `INSERT INTO admin_audit_logs
        (id, actor, action, target_type, target_id, payload, result, error, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, NOW())`,
      crypto.randomUUID(),
      input.actor || "admin",
      input.action,
      input.targetType ?? null,
      input.targetId ?? null,
      JSON.stringify(input.payload ?? {}),
      input.result,
      input.error ?? null
    );
  } catch (error) {
    console.warn("[admin-audit] failed to write log", error);
  }
}

export type AdminAuditLogRow = {
  id: string;
  actor: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload: unknown;
  result: string;
  error: string | null;
  created_at: Date;
};

export async function fetchRecentAdminAuditLogs(limit = 20): Promise<AdminAuditLogRow[]> {
  try {
    await ensureAdminAuditTable();
    return await prisma.$queryRawUnsafe<AdminAuditLogRow[]>(
      `SELECT id, actor, action, target_type, target_id, payload, result, error, created_at
       FROM admin_audit_logs
       ORDER BY created_at DESC
       LIMIT $1`,
      limit
    );
  } catch (error) {
    console.warn("[admin-audit] failed to fetch logs", error);
    return [];
  }
}
