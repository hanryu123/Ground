import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __ground_prisma__: PrismaClient | undefined;
}

export const prisma =
  globalThis.__ground_prisma__ ??
  new PrismaClient({
    adapter: process.env.DATABASE_URL
      ? new PrismaPg(
          new Pool({
            connectionString: process.env.DATABASE_URL,
            max: process.env.NODE_ENV === "production" ? 10 : 5,
          })
        )
      : undefined,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__ground_prisma__ = prisma;
}
