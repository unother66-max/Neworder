export type ProductKeywordRules = {
  requiredKeywords: string[];
  optionalKeywords: string[];
  preferredKeywords: string[];
  excludedKeywords: string[];
};

export type ProductKeywordMatch = {
  passesRequired: boolean;
  passesExcluded: boolean;
  optionalMatchCount: number;
  preferredMatchCount: number;
};

export function normalizeProductText(value: string): string {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[^0-9a-z가-힣]/g, "");
}

function normalizedKeywords(values: string[]): string[] {
  return values.map(normalizeProductText).filter(Boolean);
}

export function matchProductKeywords(
  title: string,
  rules: ProductKeywordRules
): ProductKeywordMatch {
  const normalizedTitle = normalizeProductText(title);
  const required = normalizedKeywords(rules.requiredKeywords);
  const optional = normalizedKeywords(rules.optionalKeywords);
  const preferred = normalizedKeywords(rules.preferredKeywords);
  const excluded = normalizedKeywords(rules.excludedKeywords);

  return {
    passesRequired: required.every((keyword) =>
      normalizedTitle.includes(keyword)
    ),
    passesExcluded: !excluded.some((keyword) =>
      normalizedTitle.includes(keyword)
    ),
    optionalMatchCount: optional.filter((keyword) =>
      normalizedTitle.includes(keyword)
    ).length,
    preferredMatchCount: preferred.filter((keyword) =>
      normalizedTitle.includes(keyword)
    ).length,
  };
}

export function compareKeywordMatches(
  left: ProductKeywordMatch,
  right: ProductKeywordMatch
): number {
  return (
    right.optionalMatchCount - left.optionalMatchCount ||
    right.preferredMatchCount - left.preferredMatchCount
  );
}
