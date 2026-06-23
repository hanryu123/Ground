const DATABASE_URL_KEYS = [
  "POSTGRES_PRISMA_URL",
  "POSTGRES_URL",
  "DATABASE_URL",
] as const;

export type DatabaseUrlKey = typeof DATABASE_URL_KEYS[number];

export function resolveDatabaseUrl(): string | undefined {
  return resolveDatabaseConnection()?.value;
}

export function resolveDatabaseConnection():
  | { key: DatabaseUrlKey; value: string }
  | null {
  for (const key of DATABASE_URL_KEYS) {
    const value = process.env[key]?.trim();
    if (value) return { key, value };
  }
  return null;
}

export function databaseConnectionStatus() {
  const connection = resolveDatabaseConnection();
  if (!connection) return null;

  try {
    const url = new URL(connection.value);
    return {
      key: connection.key,
      host: url.hostname,
      name: url.pathname.replace(/^\//, "") || null,
    };
  } catch {
    return {
      key: connection.key,
      host: null,
      name: null,
    };
  }
}
