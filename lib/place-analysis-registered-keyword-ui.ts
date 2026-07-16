export function getRegisteredKeywordEmptyLabel(
  cacheStatus: string | null | undefined
): "수집 대기" | "수집 지연" | "-" {
  const status = String(cacheStatus ?? "");
  if (/DELAYED|COOLDOWN|CIRCUIT/i.test(status)) return "수집 지연";
  if (/QUEUE|PROCESSING|PENDING/i.test(status)) return "수집 대기";
  return "-";
}
