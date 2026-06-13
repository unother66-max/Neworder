export type ParsedProductSpec = {
  unitCount: number;
  packageUnit: string;
  volumePerUnit: number | null;
  volumeUnit: "ml" | "g" | "매" | null;
};

export type PriceMetrics = ParsedProductSpec & {
  productPrice: number;
  shippingFee: number;
  shippingUnitCount: number;
  effectiveShippingFee: number;
  totalPrice: number;
  unitPrice: number;
  totalVolume: number | null;
  pricePer100: number | null;
  pricePerMeasure: number | null;
};

export type ShippingStatus = "FREE" | "PAID" | "UNKNOWN";
export type ShippingFeeMode =
  | "INCLUDED"
  | "UNKNOWN"
  | "ORDER_ONCE"
  | "PER_ITEM"
  | "PER_N_ITEMS";

export function normalizeShippingFeeMode(
  value: unknown
): ShippingFeeMode | null {
  return value === "INCLUDED" ||
    value === "UNKNOWN" ||
    value === "ORDER_ONCE" ||
    value === "PER_ITEM" ||
    value === "PER_N_ITEMS"
    ? value
    : null;
}

export type PriceCandidateLike = {
  title: string;
  itemPrice: number;
  shippingFee: number;
  shippingUnitCount?: number;
  shippingFeeMode?: ShippingFeeMode | null;
  shippingStatus?: ShippingStatus;
  shippingNeedsConfirmation?: boolean;
  quantityPerPack?: number;
  volumePerUnit?: number | null;
  volumeUnit?: string | null;
  packageUnit?: string | null;
};

const COUNT_UNITS = "개|병|팩|박스|봉|캔|입|롤|통|세트|P|p";

function positiveNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

export function parseProductSpec(title: string): ParsedProductSpec {
  const normalized = String(title ?? "")
    .replace(/[×＊]/g, "x")
    .replace(/\s+/g, " ")
    .trim();

  let volumePerUnit: number | null = null;
  let volumeUnit: ParsedProductSpec["volumeUnit"] = null;
  let measureEnd = -1;

  const physical = normalized.match(
    /(\d+(?:\.\d+)?)\s*(ml|mL|ML|l|L|g|G|kg|KG|Kg)/
  );
  if (physical) {
    const raw = Number(physical[1]);
    const rawUnit = physical[2].toLowerCase();
    if (rawUnit === "l") {
      volumePerUnit = raw * 1000;
      volumeUnit = "ml";
    } else if (rawUnit === "kg") {
      volumePerUnit = raw * 1000;
      volumeUnit = "g";
    } else {
      volumePerUnit = raw;
      volumeUnit = rawUnit === "ml" ? "ml" : "g";
    }
    measureEnd = (physical.index ?? 0) + physical[0].length;
  } else {
    const sheets = normalized.match(/(\d+(?:\.\d+)?)\s*매/);
    if (sheets) {
      volumePerUnit = Number(sheets[1]);
      volumeUnit = "매";
      measureEnd = (sheets.index ?? 0) + sheets[0].length;
    }
  }

  const afterMeasure = measureEnd >= 0 ? normalized.slice(measureEnd) : normalized;
  const countPatterns = [
    new RegExp(`(?:x|X|\\*)\\s*(\\d+)\\s*(${COUNT_UNITS})`),
    new RegExp(`(?:,|/|\\+)?\\s*(\\d+)\\s*(${COUNT_UNITS})`),
  ];

  let unitCount = 1;
  let packageUnit = "개";
  for (const pattern of countPatterns) {
    const match = afterMeasure.match(pattern);
    if (!match) continue;
    unitCount = Math.max(1, Number(match[1]) || 1);
    packageUnit = match[2];
    break;
  }

  return { unitCount, packageUnit, volumePerUnit, volumeUnit };
}

export function calculatePriceMetrics(
  candidate: PriceCandidateLike
): PriceMetrics {
  const parsed = parseProductSpec(candidate.title);
  const unitCount = Math.round(
    positiveNumber(candidate.quantityPerPack, parsed.unitCount)
  );
  const volumePerUnit =
    candidate.volumePerUnit == null
      ? parsed.volumePerUnit
      : positiveNumber(candidate.volumePerUnit, parsed.volumePerUnit ?? 0) || null;
  const volumeUnit =
    candidate.volumeUnit === "ml" ||
    candidate.volumeUnit === "g" ||
    candidate.volumeUnit === "매"
      ? candidate.volumeUnit
      : parsed.volumeUnit;
  const packageUnit = candidate.packageUnit?.trim() || parsed.packageUnit;
  const productPrice = Math.max(0, Number(candidate.itemPrice) || 0);
  const shippingFee = Math.max(0, Number(candidate.shippingFee) || 0);
  const shippingUnitCount = Math.round(
    positiveNumber(candidate.shippingUnitCount, 1)
  );
  const shippingStatus =
    candidate.shippingStatus ??
    (candidate.shippingNeedsConfirmation
      ? "UNKNOWN"
      : shippingFee > 0
        ? "PAID"
        : "FREE");
  const effectiveShippingFee =
    shippingStatus !== "PAID" || shippingFee <= 0
      ? 0
      : candidate.shippingFeeMode === "PER_ITEM"
        ? shippingFee * unitCount
        : candidate.shippingFeeMode === "PER_N_ITEMS"
          ? shippingFee * Math.ceil(unitCount / shippingUnitCount)
          : candidate.shippingFeeMode === "ORDER_ONCE"
            ? shippingFee
            : shippingUnitCount > 1
              ? shippingFee * Math.ceil(unitCount / shippingUnitCount)
              : shippingFee;
  const totalPrice = productPrice + effectiveShippingFee;
  const totalVolume =
    volumePerUnit && volumeUnit ? volumePerUnit * unitCount : null;

  return {
    unitCount,
    packageUnit,
    volumePerUnit,
    volumeUnit,
    productPrice,
    shippingFee,
    shippingUnitCount,
    effectiveShippingFee,
    totalPrice,
    unitPrice: totalPrice / unitCount,
    totalVolume,
    pricePer100:
      totalVolume && (volumeUnit === "ml" || volumeUnit === "g")
        ? (totalPrice / totalVolume) * 100
        : null,
    pricePerMeasure:
      totalVolume && volumeUnit === "매" ? totalPrice / totalVolume : null,
  };
}

export type ParsedShippingCondition = {
  shippingFee: number;
  shippingUnitCount: number;
  shippingStatus: ShippingStatus;
  shippingNote: string | null;
  shippingCondition: string | null;
  shippingNeedsConfirmation: boolean;
};

export function parseShippingCondition(
  value: unknown,
  fallbackFee = 0
): ParsedShippingCondition {
  const text = String(value ?? "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (/무료\s*배송|배송\s*무료|배송비\s*무료/.test(text)) {
    return {
      shippingFee: 0,
      shippingUnitCount: 1,
      shippingStatus: "FREE",
      shippingNote: text || "무료배송",
      shippingCondition: text || "무료배송",
      shippingNeedsConfirmation: false,
    };
  }

  const feeMatch = text.match(
    /(?:배송비|배송료|운임)\s*[:：]?\s*(\d{2,})\s*원?/
  );
  const unitMatch =
    text.match(/(\d+)\s*개\s*(?:마다|당)\s*(?:부과|발생|배송)?/) ??
    text.match(/(?:수량별|묶음)\s*배송[^\d]{0,12}(\d+)\s*개/);
  const shippingFee = feeMatch ? Number(feeMatch[1]) : Math.max(0, fallbackFee);
  const shippingUnitCount = unitMatch
    ? Math.max(1, Number(unitMatch[1]) || 1)
    : 1;
  const ambiguous = /묶음\s*배송|수량별\s*배송/.test(text) && !unitMatch;
  const hasFallbackFee = Number(fallbackFee) > 0;
  const hasKnownCondition =
    /무료\s*배송|배송\s*무료|배송비\s*무료/.test(text) ||
    Boolean(unitMatch) ||
    Boolean(feeMatch && !ambiguous) ||
    hasFallbackFee;

  const shippingStatus: ShippingStatus =
    shippingFee > 0 && hasKnownCondition ? "PAID" : "UNKNOWN";
  return {
    shippingFee,
    shippingUnitCount,
    shippingStatus,
    shippingNote:
      shippingStatus === "UNKNOWN"
        ? text || "배송비 정보를 자동으로 확인하지 못했습니다."
        : text || null,
    shippingCondition: text || null,
    shippingNeedsConfirmation: shippingStatus === "UNKNOWN",
  };
}

export function formatComposition(metrics: ParsedProductSpec): string {
  if (metrics.volumePerUnit && metrics.volumeUnit) {
    return `${formatMeasure(metrics.volumePerUnit)}${metrics.volumeUnit} × ${metrics.unitCount}${metrics.packageUnit}`;
  }
  return `${metrics.unitCount}${metrics.packageUnit}`;
}

function formatMeasure(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export type RecommendationMetric =
  | "totalPrice"
  | "unitPrice"
  | "pricePer100"
  | "pricePerMeasure";

export type PriceSort =
  | "totalPrice"
  | "unitPrice"
  | "pricePer100"
  | "savings";

export function getRecommendationMetric(
  itemName: string,
  category: string
): RecommendationMetric {
  const text = `${itemName} ${category}`.toLowerCase();
  if (/오일|올리브유|소스|식초|시럽|액상|음료|주스|우유/.test(text)) {
    return "pricePer100";
  }
  if (/장갑|냅킨|티슈|종이|행주|수세미|봉투|빨대|컵/.test(text)) {
    return "pricePerMeasure";
  }
  return "unitPrice";
}

export function metricValue(
  metrics: PriceMetrics,
  metric: RecommendationMetric
): number {
  if (metric === "pricePer100") {
    return metrics.pricePer100 && metrics.pricePer100 > 0
      ? metrics.pricePer100
      : Number.POSITIVE_INFINITY;
  }
  if (metric === "pricePerMeasure") {
    return metrics.pricePerMeasure && metrics.pricePerMeasure > 0
      ? metrics.pricePerMeasure
      : Number.POSITIVE_INFINITY;
  }
  return metrics[metric];
}

export function priceSortValue(
  metrics: PriceMetrics,
  sort: PriceSort,
  recentUnitPrice: number | null
): number | null {
  if (sort === "pricePer100") {
    return metrics.pricePer100 && metrics.pricePer100 > 0
      ? metrics.pricePer100
      : null;
  }
  if (sort === "savings") {
    return recentUnitPrice && recentUnitPrice > 0 && metrics.unitPrice > 0
      ? recentUnitPrice - metrics.unitPrice
      : null;
  }
  const value = metrics[sort];
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function comparePriceMetrics(
  a: PriceMetrics,
  b: PriceMetrics,
  sort: PriceSort,
  recentUnitPrice: number | null
): number {
  const aValue = priceSortValue(a, sort, recentUnitPrice);
  const bValue = priceSortValue(b, sort, recentUnitPrice);
  if (aValue == null) return bValue == null ? 0 : 1;
  if (bValue == null) return -1;
  return sort === "savings" ? bValue - aValue : aValue - bValue;
}
