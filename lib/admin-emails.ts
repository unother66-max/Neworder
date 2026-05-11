import { ADMIN_EMAIL as LEGACY_ADMIN_EMAIL } from "@/lib/constants";

/**
 * Comma-separated `ADMIN_EMAILS` (recommended). Fallback: `ADMIN_EMAIL` env or app constant for migration.
 */
export function getAdminEmailSet(): ReadonlySet<string> {
  const envList =
    process.env.ADMIN_EMAILS?.split(/[,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean) ??
    [];
  if (envList.length > 0) return new Set(envList);
  const single = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (single) return new Set([single]);
  return new Set([LEGACY_ADMIN_EMAIL.trim().toLowerCase()]);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email?.trim()) return false;
  return getAdminEmailSet().has(email.trim().toLowerCase());
}
