import {
  parseShippingCondition,
  type ParsedShippingCondition,
} from "@/lib/neworder/price-analysis";

type NaverShippingCandidate = {
  title?: string | null;
  productUrl?: string | null;
  link?: string | null;
  shippingFee?: string | number | null;
  deliveryFee?: string | number | null;
  deliveryFeeContent?: string | null;
  shippingInfo?: string | null;
};

export type NaverShippingEnrichment = ParsedShippingCondition & {
  source:
    | "SEARCH"
    | "NEXT_DATA"
    | "JSON_SCRIPT"
    | "HTML_TEXT"
    | "SAVED"
    | "UNKNOWN";
  fetchStatus: number | "timeout" | "network-error" | "not-requested" | null;
  resolvedUrl: string | null;
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

function parseJsonScripts(
  html: string
): { text: string; source: "NEXT_DATA" | "JSON_SCRIPT" } | null {
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
      if (text) {
        return {
          text,
          source: /\bid=["']__NEXT_DATA__["']/i.test(match[1])
            ? "NEXT_DATA"
            : "JSON_SCRIPT",
        };
      }
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
  fallbackFee = 0,
  fetchStatus: NaverShippingEnrichment["fetchStatus"] = null,
  resolvedUrl: string | null = null
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
    fetchStatus,
    resolvedUrl,
  };
}

export function parseNaverShippingHtml(
  html: string
): NaverShippingEnrichment {
  const limitedHtml = String(html ?? "").slice(0, MAX_DETAIL_HTML_LENGTH);
  const jsonScript = parseJsonScripts(limitedHtml);
  if (jsonScript) {
    const parsed = parseShippingText(jsonScript.text, jsonScript.source);
    if (parsed.shippingStatus !== "UNKNOWN") return parsed;
  }

  const htmlText = decodeHtmlText(
    limitedHtml.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
  );
  const parsed = parseShippingText(htmlText, "HTML_TEXT");
  return parsed.shippingStatus === "UNKNOWN"
    ? {
        ...parsed,
        source: "UNKNOWN",
        shippingNote: "배송비 파싱 실패: 배송비 텍스트 없음",
      }
    : parsed;
}

function failedEnrichment(
  inline: NaverShippingEnrichment,
  reason: string,
  fetchStatus: NaverShippingEnrichment["fetchStatus"],
  resolvedUrl: string | null = null
): NaverShippingEnrichment {
  return {
    ...inline,
    source: "UNKNOWN",
    shippingStatus: "UNKNOWN",
    shippingNeedsConfirmation: true,
    shippingNote: `배송비 파싱 실패: ${reason}`,
    fetchStatus,
    resolvedUrl,
  };
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
  if (inline.shippingStatus !== "UNKNOWN") {
    return { ...inline, fetchStatus: "not-requested", resolvedUrl: null };
  }

  const productUrl = String(candidate.productUrl ?? candidate.link ?? "").trim();
  if (!isNaverDetailUrl(productUrl)) {
    return failedEnrichment(
      inline,
      "네이버 상품 상세 URL이 아님",
      "not-requested"
    );
  }

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
    if (!response.ok) {
      return failedEnrichment(
        inline,
        String(response.status),
        response.status,
        response.url || productUrl
      );
    }
    const resolvedUrl = response.url || productUrl;
    try {
      if (new URL(resolvedUrl).hostname === "nid.naver.com") {
        return failedEnrichment(
          inline,
          "네이버 로그인 페이지로 리다이렉트됨",
          response.status,
          resolvedUrl
        );
      }
    } catch {
      // The original URL validation already succeeded; keep parsing if the
      // runtime returns an unusual response URL.
    }
    const parsed = parseNaverShippingHtml(await response.text());
    return {
      ...parsed,
      fetchStatus: response.status,
      resolvedUrl,
    };
  } catch (cause) {
    const isTimeout =
      cause instanceof Error &&
      (cause.name === "TimeoutError" || cause.name === "AbortError");
    return failedEnrichment(
      inline,
      isTimeout ? "timeout" : "network-error",
      isTimeout ? "timeout" : "network-error",
      productUrl
    );
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
