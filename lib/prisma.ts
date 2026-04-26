import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function buildDevDbUrl(base: string | undefined): string | undefined {
  const raw = base?.trim();
  if (!raw) return base;
  // Prisma supports query params like connection_limit and pool_timeout for PostgreSQL.
  // Limiting connections in dev prevents pool exhaustion during hot reload.
  try {
    const u = new URL(raw);
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "20");
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "20");
    return u.toString();
  } catch {
    // If URL parsing fails, return original.
    return raw;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(process.env.NODE_ENV !== "production"
      ? {
          datasources: {
            db: { url: buildDevDbUrl(process.env.DATABASE_URL) },
          },
        }
      : null),
    log: process.env.NODE_ENV === "development" ? ["error"] : [],
  });

if (process.env.NODE_ENV !== "production") {
  // Ensure a single PrismaClient instance across hot reloads.
  globalForPrisma.prisma = prisma;
}