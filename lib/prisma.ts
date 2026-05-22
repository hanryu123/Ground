import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __ground_prisma__: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
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
 * - 빌드 타임(DATABASE_URL 미설정)에 module evaluation 오류 방지
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
