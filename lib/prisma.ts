import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { resolveDatabaseUrl } from "@/lib/databaseUrl";

declare global {
  // eslint-disable-next-line no-var
  var __ground_prisma__: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    throw new Error("Database connection string is not configured");
  }

  const pool = new Pool({
    connectionString,
    max: process.env.NODE_ENV === "production" ? 10 : 5,
  });
  return new PrismaClient({
    adapter: new PrismaPg(pool),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Lazy Proxy: 모듈 평가(import) 시점에 PrismaClient를 생성하지 않고
 * 첫 번째 실제 사용 시점에 생성한다.
 *
 * - 빌드 타임(DB URL 미설정)에 module evaluation 오류 방지
 * - Prisma 7 + @prisma/adapter-pg 조합에서 engineType "client" 에러 방지
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    if (!globalThis.__ground_prisma__) {
      globalThis.__ground_prisma__ = createClient();
    }
    const client = globalThis.__ground_prisma__!;
    const val = (client as any)[prop];
    return typeof val === "function" ? val.bind(client) : val;
  },
});
