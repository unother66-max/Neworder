import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

/**
 * prisma.config.ts가 있으면 Prisma CLI는 기본 .env 로딩을 하지 않습니다.
 * Next.js와 같이 .env → .env.local 순으로 로드하고, DATABASE_URL 계열을 정규화합니다.
 */
function loadPrismaEnvFiles(): void {
  const root = process.cwd();
  const envPath = resolve(root, ".env");
  const envLocalPath = resolve(root, ".env.local");

  if (existsSync(envPath)) {
    config({ path: envPath });
  }
  if (existsSync(envLocalPath)) {
    config({ path: envLocalPath, override: true });
  }

  const databaseUrl =
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_URL?.trim() ||
    process.env.PRISMA_DATABASE_URL?.trim();

  if (databaseUrl) {
    process.env.DATABASE_URL = databaseUrl;
  }
}

loadPrismaEnvFiles();

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
