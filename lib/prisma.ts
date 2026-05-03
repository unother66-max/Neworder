import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// 개발 환경 연결 제한 로직 유지
function buildDevDbUrl(base: string | undefined): string | undefined {
  const raw = base?.trim();
  if (!raw) return base;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "20");
    return u.toString();
  } catch {
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(process.env.NODE_ENV !== "production"
      ? { datasources: { db: { url: buildDevDbUrl(process.env.DATABASE_URL) } } }
      : null),
    log: ["error"], 
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;