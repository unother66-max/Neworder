import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: AppPrisma;
};

// 개발 환경 연결 제한 로직 유지
function buildDevDbUrl(base: string | undefined): string | undefined {
  const raw = base?.trim();
  if (!raw) return base;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "20");
    // 연결 대기 허용 시간(풀 고갈 시 대기 초과 방지 여유)
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "30");
    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * 단일 프로세스·한 인스턴스당 Prisma 클라이언트 1개만 사용합니다.
 * Next.js dev(HMR)·prod 모두 globalThis에 고정해 중복 클라이언트·풀 과다 소비를 막습니다.
 */
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    ...(process.env.NODE_ENV !== "production"
      ? { datasources: { db: { url: buildDevDbUrl(process.env.DATABASE_URL) } } }
      : null),
    log: ["error"],
  });
}

/** 생성된 스키마 기준 전체 Prisma 클라이언트 타입 (커스텀 옵션으로 인한 타입 축소 방지) */
export type AppPrisma = PrismaClient;

function getPrismaSingleton(): AppPrisma {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  return client;
}

export const prisma: AppPrisma = getPrismaSingleton();
