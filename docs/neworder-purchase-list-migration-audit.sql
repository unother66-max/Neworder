-- Read-only audit for 20260611120000_neworder_purchase_list and its
-- dependent NewOrder migrations. This file does not modify data.

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
ORDER BY table_name, ordinal_position;

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = current_schema()
  AND tablename IN ('NewOrderPriceCandidate', 'NewOrderPriceHistory')
ORDER BY tablename, indexname;

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
ORDER BY relation.relname, constraint_row.conname;

SELECT enum_type.typname, enum_value.enumlabel
FROM pg_type AS enum_type
JOIN pg_enum AS enum_value ON enum_type.oid = enum_value.enumtypid
JOIN pg_namespace AS namespace ON namespace.oid = enum_type.typnamespace
WHERE namespace.nspname = current_schema()
  AND enum_type.typname IN (
    'NewOrderPriceSource',
    'NewOrderShippingStatus'
  )
ORDER BY enum_type.typname, enum_value.enumsortorder;

SELECT
  migration_name,
  started_at,
  finished_at,
  rolled_back_at,
  applied_steps_count,
  logs
FROM "_prisma_migrations"
WHERE migration_name >= '20260611120000_neworder_purchase_list'
ORDER BY started_at;

SELECT
  (SELECT count(*) FROM "NewOrderPriceCandidate") AS candidates,
  (SELECT count(*) FROM "NewOrderPriceHistory") AS histories,
  (
    SELECT count(*)
    FROM "NewOrderPriceCandidate" AS candidate
    LEFT JOIN "NewOrderPriceHistory" AS history
      ON history.id = 'history_' || candidate.id
    WHERE history.id IS NULL
  ) AS missing_legacy_histories;

SELECT
  "itemId",
  count(*) AS current_count,
  array_agg(id ORDER BY "checkedAt" DESC, "createdAt" DESC) AS candidate_ids
FROM "NewOrderPriceCandidate"
WHERE "isCurrentBest" = true
GROUP BY "itemId"
HAVING count(*) > 1;

SELECT
  count(*) FILTER (
    WHERE btrim("mallName") = ''
  ) AS blank_mall_names,
  count(*) FILTER (
    WHERE "savedBy" = 'system' OR btrim("savedBy") = ''
  ) AS unresolved_saved_by
FROM "NewOrderPriceCandidate";

SELECT
  count(*) FILTER (
    WHERE "requiredKeywords" IS NULL
  ) AS required_keywords_nulls,
  count(*) FILTER (
    WHERE "optionalKeywords" IS NULL
  ) AS optional_keywords_nulls,
  count(*) FILTER (
    WHERE "preferredKeywords" IS NULL
  ) AS preferred_keywords_nulls
FROM "NewOrderItem";
