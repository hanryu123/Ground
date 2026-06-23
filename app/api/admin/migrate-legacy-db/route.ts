import { Client } from "pg";
import { NextResponse } from "next/server";
import { resolveDatabaseUrl } from "@/lib/databaseUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TABLES = [
  "User",
  "Game",
  "PushSubscription",
  "NativePushToken",
  "NotificationDispatchState",
  "PostGameReport",
  "PendingPushNotification",
  "MarketingPush",
  "LiveEventWatermark",
  "PregamePreview",
  "Notification",
] as const;

type TableName = typeof TABLES[number];

type CopyResult = {
  table: TableName;
  sourceCount: number;
  targetBefore: number;
  inserted: number;
  targetAfter: number;
};

function authSecrets(): string[] {
  return [
    process.env.ADMIN_SECRET,
    process.env.ADMIN_PASSWORD,
    process.env.CRON_SECRET,
    process.env.MIGRATION_SECRET,
  ].filter((value): value is string => Boolean(value));
}

function isAuthorized(req: Request, url: URL): boolean {
  const auth = req.headers.get("authorization");
  const querySecret = url.searchParams.get("key") ?? url.searchParams.get("secret");
  return authSecrets().some((secret) => auth === `Bearer ${secret}` || querySecret === secret);
}

function parseHost(connectionString: string | undefined | null): string | null {
  if (!connectionString?.trim()) return null;
  try {
    return new URL(connectionString).hostname;
  } catch {
    return null;
  }
}

function buildConnectionFromPgVars(): string | null {
  const host = process.env.PGHOST_UNPOOLED ?? process.env.PGHOST ?? process.env.POSTGRES_HOST;
  const user = process.env.PGUSER ?? process.env.POSTGRES_USER;
  const password = process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD;
  const database = process.env.PGDATABASE ?? process.env.POSTGRES_DATABASE ?? "neondb";
  if (!host || !user || !password) return null;
  const url = new URL(`postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/${database}`);
  url.searchParams.set("sslmode", "require");
  return url.toString();
}

function sourceCandidates(): Array<{ key: string; value: string }> {
  return [
    ["DATABASE_URL_UNPOOLED", process.env.DATABASE_URL_UNPOOLED],
    ["POSTGRES_URL_NON_POOLING", process.env.POSTGRES_URL_NON_POOLING],
    ["POSTGRES_URL", process.env.POSTGRES_URL],
    ["POSTGRES_PRISMA_URL", process.env.POSTGRES_PRISMA_URL],
    ["PG_VARS", buildConnectionFromPgVars()],
  ]
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([key, value]) => ({ key, value }));
}

function resolveConnections() {
  const target = resolveDatabaseUrl()?.trim() || null;
  const targetHost = parseHost(target);
  const source = sourceCandidates().find((candidate) => parseHost(candidate.value) !== targetHost) ?? null;
  return {
    source,
    sourceHost: parseHost(source?.value),
    target,
    targetHost,
  };
}

async function connect(connectionString: string): Promise<Client> {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

async function tableExists(client: Client, table: TableName): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return (result.rowCount ?? 0) > 0;
}

async function tableColumns(client: Client, table: TableName): Promise<string[]> {
  const result = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

async function countRows(client: Client, table: TableName): Promise<number> {
  const result = await client.query<{ count: string }>(`SELECT count(*) AS count FROM "${table}"`);
  return Number(result.rows[0]?.count ?? 0);
}

async function inspectTables(source: Client, target: Client): Promise<CopyResult[]> {
  const results: CopyResult[] = [];
  for (const table of TABLES) {
    const [sourceExists, targetExists] = await Promise.all([
      tableExists(source, table),
      tableExists(target, table),
    ]);
    if (!sourceExists || !targetExists) {
      results.push({ table, sourceCount: 0, targetBefore: 0, inserted: 0, targetAfter: 0 });
      continue;
    }
    const [sourceCount, targetBefore] = await Promise.all([
      countRows(source, table),
      countRows(target, table),
    ]);
    results.push({ table, sourceCount, targetBefore, inserted: 0, targetAfter: targetBefore });
  }
  return results;
}

async function copyTable(source: Client, target: Client, table: TableName): Promise<CopyResult> {
  const [sourceExists, targetExists] = await Promise.all([
    tableExists(source, table),
    tableExists(target, table),
  ]);
  if (!sourceExists || !targetExists) {
    return { table, sourceCount: 0, targetBefore: 0, inserted: 0, targetAfter: 0 };
  }

  const [sourceColumns, targetColumns, sourceCount, targetBefore] = await Promise.all([
    tableColumns(source, table),
    tableColumns(target, table),
    countRows(source, table),
    countRows(target, table),
  ]);
  const targetSet = new Set(targetColumns);
  const columns = sourceColumns.filter((column) => targetSet.has(column));
  if (columns.length === 0 || sourceCount === 0) {
    return { table, sourceCount, targetBefore, inserted: 0, targetAfter: targetBefore };
  }

  const quotedColumns = columns.map((column) => `"${column}"`).join(", ");
  const orderColumn = columns.includes("id") ? "id" : columns[0]!;
  const batchSize = 500;
  let inserted = 0;

  for (let offset = 0; offset < sourceCount; offset += batchSize) {
    const rows = await source.query<Record<string, unknown>>(
      `SELECT ${quotedColumns} FROM "${table}" ORDER BY "${orderColumn}" LIMIT $1 OFFSET $2`,
      [batchSize, offset],
    );
    if (rows.rows.length === 0) continue;

    const values: unknown[] = [];
    const placeholders = rows.rows.map((row, rowIndex) => {
      const rowPlaceholders = columns.map((column, columnIndex) => {
        values.push(row[column]);
        return `$${rowIndex * columns.length + columnIndex + 1}`;
      });
      return `(${rowPlaceholders.join(", ")})`;
    });

    const result = await target.query(
      `INSERT INTO "${table}" (${quotedColumns}) VALUES ${placeholders.join(", ")} ON CONFLICT DO NOTHING`,
      values,
    );
    inserted += result.rowCount ?? 0;
  }

  const targetAfter = await countRows(target, table);
  return { table, sourceCount, targetBefore, inserted, targetAfter };
}

async function withClients<T>(fn: (source: Client, target: Client) => Promise<T>) {
  const connections = resolveConnections();
  if (!connections.source?.value || !connections.target) {
    return {
      ok: false as const,
      status: 400,
      body: {
        ok: false,
        error: "missing_source_or_target_database",
        sourceKey: connections.source?.key ?? null,
        sourceHost: connections.sourceHost,
        targetHost: connections.targetHost,
      },
    };
  }
  if (!connections.sourceHost || !connections.targetHost || connections.sourceHost === connections.targetHost) {
    return {
      ok: false as const,
      status: 400,
      body: {
        ok: false,
        error: "invalid_source_target_database",
        sourceKey: connections.source.key,
        sourceHost: connections.sourceHost,
        targetHost: connections.targetHost,
      },
    };
  }

  const source = await connect(connections.source.value);
  const target = await connect(connections.target);
  try {
    const result = await fn(source, target);
    return {
      ok: true as const,
      status: 200,
      body: {
        ok: true,
        sourceKey: connections.source.key,
        sourceHost: connections.sourceHost,
        targetHost: connections.targetHost,
        result,
      },
    };
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!isAuthorized(req, url)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const response = await withClients((source, target) => inspectTables(source, target));
  return NextResponse.json(response.body, { status: response.status });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!isAuthorized(req, url)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (url.searchParams.get("confirm") !== "copy") {
    return NextResponse.json({ ok: false, error: "missing_confirm_copy" }, { status: 400 });
  }

  const response = await withClients(async (source, target) => {
    const results: CopyResult[] = [];
    for (const table of TABLES) {
      results.push(await copyTable(source, target, table));
    }
    return results;
  });
  return NextResponse.json(response.body, { status: response.status });
}
