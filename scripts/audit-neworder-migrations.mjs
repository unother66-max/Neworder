import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const root = process.cwd();
const envPath = resolve(root, ".env");
const envLocalPath = resolve(root, ".env.local");
if (existsSync(envPath)) config({ path: envPath });
if (existsSync(envLocalPath)) config({ path: envLocalPath, override: true });

const prisma = new PrismaClient();

try {
  const columns = await prisma.$queryRaw`
    SELECT
      table_name,
      column_name,
      data_type,
      udt_name,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name IN (
        'NewOrderPriceCandidate',
        'NewOrderPriceHistory',
        'NewOrderItem'
      )
    ORDER BY table_name, ordinal_position
  `;
  const indexes = await prisma.$queryRaw`
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename IN ('NewOrderPriceCandidate', 'NewOrderPriceHistory')
    ORDER BY tablename, indexname
  `;
  const constraints = await prisma.$queryRaw`
    SELECT
      relation.relname AS table_name,
      constraint_row.conname,
      constraint_row.contype,
      pg_get_constraintdef(constraint_row.oid) AS definition
    FROM pg_constraint AS constraint_row
    JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = current_schema()
      AND relation.relname IN (
        'NewOrderPriceCandidate',
        'NewOrderPriceHistory'
      )
    ORDER BY relation.relname, constraint_row.conname
  `;
  const enums = await prisma.$queryRaw`
    SELECT enum_type.typname, enum_value.enumlabel
    FROM pg_type AS enum_type
    JOIN pg_enum AS enum_value ON enum_type.oid = enum_value.enumtypid
    JOIN pg_namespace AS namespace ON namespace.oid = enum_type.typnamespace
    WHERE namespace.nspname = current_schema()
      AND enum_type.typname IN (
        'NewOrderPriceSource',
        'NewOrderShippingStatus'
      )
    ORDER BY enum_type.typname, enum_value.enumsortorder
  `;
  const migrations = await prisma.$queryRaw`
    SELECT
      migration_name,
      started_at,
      finished_at,
      rolled_back_at,
      applied_steps_count,
      logs
    FROM "_prisma_migrations"
    WHERE migration_name >= '20260611120000_neworder_purchase_list'
    ORDER BY started_at
  `;
  const counts = await prisma.$queryRaw`
    SELECT
      (SELECT count(*)::int FROM "NewOrderPriceCandidate") AS candidates,
      (SELECT count(*)::int FROM "NewOrderPriceHistory") AS histories,
      (
        SELECT count(*)::int
        FROM "NewOrderPriceCandidate" AS candidate
        LEFT JOIN "NewOrderPriceHistory" AS history
          ON history.id = 'history_' || candidate.id
        WHERE history.id IS NULL
      ) AS missing_legacy_histories
  `;
  const duplicateCurrentBest = await prisma.$queryRaw`
    SELECT
      "itemId",
      count(*)::int AS current_count,
      array_agg(id ORDER BY "checkedAt" DESC, "createdAt" DESC) AS candidate_ids
    FROM "NewOrderPriceCandidate"
    WHERE "isCurrentBest" = true
    GROUP BY "itemId"
    HAVING count(*) > 1
  `;
  const backfillGaps = await prisma.$queryRaw`
    SELECT
      count(*) FILTER (
        WHERE btrim("mallName") = ''
      )::int AS blank_mall_names,
      count(*) FILTER (
        WHERE "savedBy" = 'system' OR btrim("savedBy") = ''
      )::int AS unresolved_saved_by
    FROM "NewOrderPriceCandidate"
  `;
  const keywordNulls = await prisma.$queryRaw`
    SELECT
      count(*) FILTER (
        WHERE "requiredKeywords" IS NULL
      )::int AS required_keywords_nulls,
      count(*) FILTER (
        WHERE "optionalKeywords" IS NULL
      )::int AS optional_keywords_nulls,
      count(*) FILTER (
        WHERE "preferredKeywords" IS NULL
      )::int AS preferred_keywords_nulls
    FROM "NewOrderItem"
  `;

  console.log(
    JSON.stringify(
      {
        columns,
        indexes,
        constraints,
        enums,
        migrations,
        counts,
        duplicateCurrentBest,
        backfillGaps,
        keywordNulls,
      },
      (_key, value) => (typeof value === "bigint" ? Number(value) : value),
      2
    )
  );
} finally {
  await prisma.$disconnect();
}
