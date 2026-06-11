import {
  parseShippingCondition,
  type ParsedShippingCondition,
} from "@/lib/neworder/price-analysis";

type NaverShippingCandidate = {
  productUrl?: string | null;
  link?: string | null;
  shippingFee?: string | number | null;
  deliveryFee?: string | number | null;
  deliveryFeeContent?: string | null;
  shippingInfo?: string | null;
};

export type NaverShippingEnrichment = ParsedShippingCondition & {
  source: "SEARCH" | "DETAIL_JSON" | "DETAIL_HTML" | "UNKNOWN";
};

const DETAIL_TIMEOUT_MS = 4500;
const MAX_DETAIL_HTML_LENGTH = 2_000_000;

function decodeHtmlText(value: string): string {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16))
    )
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNaverDetailUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "naver.com" || url.hostname.endsWith(".naver.com"))
    );
  } catch {
    return false;
  }
}

function shippingTextFromJson(value: unknown): string | null {
  const fragments: string[] = [];
  const seen = new Set<unknown>();

  function visit(node: unknown, shippingContext: boolean, depth: number) {
    if (node == null || depth > 12 || seen.has(node)) return;
    if (typeof node === "string" || typeof node === "number") {
      if (shippingContext) fragments.push(String(node));
      return;
    }
    if (typeof node !== "object") return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node.slice(0, 100)) {
        visit(child, shippingContext, depth + 1);
      }
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      const keyIsShipping =
        /delivery|shipping|deliveryFee|baseFee|repeatQuantity|배송/i.test(key);
      if (
        typeof child === "string" ||
        typeof child === "number" ||
        typeof child === "boolean"
      ) {
        if (/(?:delivery|shipping|base).*fee|배송비|배송료/i.test(key)) {
          fragments.push(`배송비 ${String(child)}원`);
        } else if (
          /repeatQuantity|unitCount|shippingUnitCount|묶음수량/i.test(key)
        ) {
          fragments.push(`${String(child)}개마다 부과`);
        } else if (/free.*(?:delivery|shipping)|무료배송/i.test(key) && child) {
          fragments.push("무료배송");
        } else if (shippingContext || keyIsShipping) {
          fragments.push(String(child));
        }
      }
      visit(child, shippingContext || keyIsShipping, depth + 1);
    }
  }

  visit(value, false, 0);
  const text = decodeHtmlText(fragments.join(" "));
  return /무료\s*배송|배송\s*무료|배송비|배송료|개마다\s*부과/.test(text)
    ? text
    : null;
}

function parseJsonScripts(html: string): string | null {
  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => {
      const attributes = match[1];
      return (
        /\bid=["']__NEXT_DATA__["']/i.test(attributes) ||
        /\btype=["']application\/(?:ld\+)?json["']/i.test(attributes)
      );
    })
    .sort((a, b) => {
      const aIsNext = /\bid=["']__NEXT_DATA__["']/i.test(a[1]);
      const bIsNext = /\bid=["']__NEXT_DATA__["']/i.test(b[1]);
      return Number(bIsNext) - Number(aIsNext);
    });
  for (const match of scripts) {
    try {
      const text = shippingTextFromJson(JSON.parse(match[2]));
      if (text) return text;
    } catch {
      continue;
    }
  }
  return null;
}

function arrivalNote(text: string): string | null {
  return (
    text.match(
      /평균\s*\d+\s*일\s*이내\s*도착\s*확률\s*\d+\s*%/
    )?.[0] ??
    text.match(/(?:오늘|내일|모레)\s*도착\s*(?:예정|보장)?/)?.[0] ??
    null
  );
}

function parseShippingText(
  text: string,
  source: NaverShippingEnrichment["source"],
  fallbackFee = 0
): NaverShippingEnrichment {
  const parsed = parseShippingCondition(text, fallbackFee);
  const note = arrivalNote(text);
  const condition =
    parsed.shippingStatus === "FREE"
      ? "무료배송"
      : parsed.shippingStatus === "PAID"
        ? `배송비 ${parsed.shippingFee.toLocaleString("ko-KR")}원${
            parsed.shippingUnitCount > 1
              ? ` / ${parsed.shippingUnitCount}개마다 부과`
              : ""
          }`
        : null;
  return {
    ...parsed,
    shippingCondition: condition,
    shippingNote:
      note ??
      (parsed.shippingStatus === "UNKNOWN"
        ? "배송비 정보를 자동으로 확인하지 못했습니다."
        : condition),
    source,
  };
}

export function parseNaverShippingHtml(
  html: string
): NaverShippingEnrichment {
  const limitedHtml = String(html ?? "").slice(0, MAX_DETAIL_HTML_LENGTH);
  const jsonText = parseJsonScripts(limitedHtml);
  if (jsonText) {
    const parsed = parseShippingText(jsonText, "DETAIL_JSON");
    if (parsed.shippingStatus !== "UNKNOWN") return parsed;
  }

  const htmlText = decodeHtmlText(
    limitedHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
  );
  const parsed = parseShippingText(htmlText, "DETAIL_HTML");
  return parsed.shippingStatus === "UNKNOWN"
    ? {
        ...parsed,
        source: "UNKNOWN",
        shippingNote:
          parsed.shippingNote || "배송비 정보를 자동으로 확인하지 못했습니다.",
      }
    : parsed;
}

export async function enrichNaverShipping(
  candidate: NaverShippingCandidate
): Promise<NaverShippingEnrichment> {
  const inlineText = [
    candidate.deliveryFeeContent,
    candidate.shippingInfo,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const fallbackFee =
    Number(candidate.shippingFee ?? candidate.deliveryFee) || 0;
  const inline = parseShippingText(inlineText, "SEARCH", fallbackFee);
  if (inline.shippingStatus !== "UNKNOWN") return inline;

  const productUrl = String(candidate.productUrl ?? candidate.link ?? "").trim();
  if (!isNaverDetailUrl(productUrl)) return inline;

  try {
    const response = await fetch(productUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent":
          "Mozilla/5.0 (compatible; PostLabsNewOrder/1.0; +https://postlabs.kr)",
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(DETAIL_TIMEOUT_MS),
    });
    if (!response.ok) return inline;
    return parseNaverShippingHtml(await response.text());
  } catch {
    return inline;
  }
}

export async function enrichNaverShippingCandidates<T>(
  candidates: T[],
  enrich: (candidate: T) => Promise<void>,
  concurrency = 3
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(
    Math.max(1, Math.floor(concurrency)),
    candidates.length
  );
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < candidates.length) {
        const index = nextIndex++;
        try {
          await enrich(candidates[index]);
        } catch {
          // A single blocked or malformed detail page must not fail the search.
        }
      }
    })
  );
}
