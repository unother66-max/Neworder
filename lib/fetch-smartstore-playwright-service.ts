/**
 * 스마트스토어 상품 메타(name / imageUrl / category)를 **별도 Playwright HTTP 서버**에서 가져올 때 사용.
 * 맥에서 서버 실행 + Cloudflare Tunnel 공개 URL을 Vercel의 SMARTSTORE_PLAYWRIGHT_URL 로 두고 호출하는 전제.
 * (Vercel 함수 안에서는 브라우저를 띄우지 않고 HTTP만 수행)
 */
const LOG_PREFIX = "[smartstore-playwright-service]";

export type PlaywrightServiceMetaResult = {
  name: string | null;
  imageUrl: string | null;
  category: string | null;
};

/** 상대경로·프록시 URL 등을 상품 페이지 기준 절대 https URL로 정리. 비어 있거나 실패하면 null */
export function resolveProductAssetUrl(
  productPageUrl: string,
  raw: string | null | undefined
): string | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    const base = productPageUrl.trim();
    if (t.startsWith("//")) {
      const u = new URL(`https:${t}`);
      if (u.protocol === "https:" || u.protocol === "http:") return u.href;
      return null;
    }
    const u = new URL(t, base);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.href;
  } catch {
    return null;
  }
}

type ExtractResponseJson = {
  ok?: unknown;
  error?: unknown;
  name?: unknown;
  imageUrl?: unknown;
  category?: unknown;
};

function readServiceBaseUrl(): string {
  const v = process.env.SMARTSTORE_PLAYWRIGHT_URL?.trim();
  if (!v) {
    throw new Error("SMARTSTORE_PLAYWRIGHT_URL 환경변수가 설정되어 있지 않습니다.");
  }
  return v.replace(/\/+$/, "");
}

/**
 * POST {SMARTSTORE_PLAYWRIGHT_URL}/extract — 로컬·Tunnel·배포형 Playwright 서버 공통 계약
 */
export async function fetchSmartstoreMetaFromPlaywrightService(
  productPageUrl: string,
  opts?: { timeoutMs?: number }
): Promise<PlaywrightServiceMetaResult> {
  const timeoutMs = opts?.timeoutMs ?? 55_000;
  const base = readServiceBaseUrl();
  const endpoint = `${base}/extract`;
  const cookie = process.env.NAVER_COOKIE?.trim() || process.env.SMARTSTORE_COOKIE?.trim() || "";

  console.log(`${LOG_PREFIX} 단계=요청준비`, {
    입력상품URL: productPageUrl,
    Playwright서비스URL: endpoint,
    timeoutMs,
    cookieProvided: Boolean(cookie),
    cookieLength: cookie ? cookie.length : 0,
  });

  const secret = process.env.SMARTSTORE_PLAYWRIGHT_SECRET?.trim();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-smartstore-scrape-secret": secret } : {}),
      },
      body: JSON.stringify({ productUrl: productPageUrl, cookie: cookie || undefined }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} 단계=fetch실패`, {
      입력상품URL: productPageUrl,
      Playwright서비스URL: endpoint,
      error: msg,
      stack: e instanceof Error ? e.stack : undefined,
      aborted: e instanceof Error && e.name === "AbortError",
    });
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        `Playwright 서버 응답 시간 초과(${Math.round(timeoutMs / 1000)}초). Tunnel·맥 서버 가동 여부를 확인해주세요.`
      );
    }
    throw new Error(`Playwright 서버 연결 실패: ${msg}`);
  } finally {
    clearTimeout(t);
  }

  let json: ExtractResponseJson;
  try {
    json = (await res.json()) as ExtractResponseJson;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`${LOG_PREFIX} 단계=JSON파싱실패`, {
      httpStatus: res.status,
      error: msg,
      stack: e instanceof Error ? e.stack : undefined,
    });
    throw new Error(
      "Playwright 서버 응답이 JSON이 아닙니다. 맥 터미널의 스크래퍼 로그를 확인해주세요."
    );
  }

  console.log(`${LOG_PREFIX} 단계=응답수신`, {
    httpStatus: res.status,
    응답본문: json,
  });

  if (!res.ok) {
    const errText =
      typeof json.error === "string" && json.error.trim()
        ? json.error.trim()
        : `HTTP ${res.status}`;
    console.error(`${LOG_PREFIX} 단계=http에러`, {
      httpStatus: res.status,
      error: errText,
      body: json,
    });
    throw new Error(`Playwright 서버 오류: ${errText}`);
  }

  if (json.ok !== true) {
    const errText =
      typeof json.error === "string" && json.error.trim()
        ? json.error.trim()
        : "ok=false (사유 없음)";
    console.error(`${LOG_PREFIX} 단계=본문ok거짓`, { error: errText, body: json });
    throw new Error(`Playwright 서버 메타 수집 실패: ${errText}`);
  }

  const nameRaw = typeof json.name === "string" ? json.name.trim() : "";
  const imageRaw = typeof json.imageUrl === "string" ? json.imageUrl.trim() : "";
  const categoryRaw = typeof json.category === "string" ? json.category.trim() : "";

  const resolvedImage = resolveProductAssetUrl(productPageUrl, imageRaw || null);

  const out: PlaywrightServiceMetaResult = {
    name: nameRaw.length > 0 ? nameRaw : null,
    imageUrl: resolvedImage,
    category: categoryRaw.length > 0 ? categoryRaw : null,
  };

  console.log(`${LOG_PREFIX} 단계=정규화완료(저장전단계에서 최종병합)`, {
    name: out.name,
    imageUrl: out.imageUrl,
    category: out.category,
  });

  return out;
}

/** SMARTSTORE_PLAYWRIGHT_URL 이 있으면 원격 Playwright 서비스 경로 사용 (없으면 서버 내 getSmartstoreProductSnapshot) */
export function isSmartstorePlaywrightServiceConfigured(): boolean {
  return Boolean(process.env.SMARTSTORE_PLAYWRIGHT_URL?.trim());
}
