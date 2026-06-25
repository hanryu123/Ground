import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: ".env.local" });
dotenv.config();

const datasourceUrl =
  process.env.POSTGRES_PRISMA_URL ??
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL;

if (!datasourceUrl) {
  throw new Error("Database connection string is not configured");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: datasourceUrl,
  },
});
