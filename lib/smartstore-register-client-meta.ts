/**
 * 스마트스토어 상품 등록 (서버 저장 API만 사용)
 *
 * - `POST /api/smartstore-product-save` 한 번으로 서버에서 네이버 메타 fetch + DB 저장
 * - 네이버 JSON은 브라우저에서 CORS로 직접 호출할 수 없어 **클라이언트 우회는 하지 않음**
 * - 서버가 메타를 못 받으면(`metaFetchIncomplete`) 폴백 이름 등으로만 저장되고 UI에 안내
 *
 * 플레이스·카카오 등 다른 기능과 무관.
 */

export type SmartstoreProductSavePayload = {
  productUrl: string;
  skipMetaFetch?: boolean;
  name?: string;
  imageUrl?: string;
  thumbnailLink?: string;
  category?: string;
};

export type SmartstoreProductSaveResponse = {
  ok?: boolean;
  error?: string;
  product?: unknown;
  updated?: boolean;
  /** 서버가 네이버 메타 JSON을 못 받은 경우(429 등) */
  metaFetchIncomplete?: boolean;
};

export async function postSmartstoreProductSave(
  payload: SmartstoreProductSavePayload
): Promise<{ res: Response; data: SmartstoreProductSaveResponse }> {
  try {
    const res = await fetch("/api/smartstore-product-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    let data: SmartstoreProductSaveResponse = {};
    try {
      data = (await res.json()) as SmartstoreProductSaveResponse;
    } catch {
      data = {};
    }
    return { res, data };
  } catch (e) {
    console.warn("[smartstore] postSmartstoreProductSave", e);
    return {
      res: new Response(null, { status: 0, statusText: "Network Error" }),
      data: { ok: false, error: "등록 요청에 실패했습니다." },
    };
  }
}

const META_NOTICE = "상품 메타 조회 실패";

/**
 * 상품 URL 등록: 서버 메타 조회 성공 시 그대로 저장, 실패 시 폴백 이름만 저장 + 안내 문구.
 */
export async function registerSmartstoreProductWithClientMetaFallback(
  productUrlRaw: string,
  _options?: {
    signal?: AbortSignal;
    /** 예약(호환). 클라이언트 네이버 fetch는 사용하지 않음. */
    onProgress?: (phase: "server" | "client") => void;
  }
): Promise<{
  ok: boolean;
  error?: string;
  metaNotice?: string;
}> {
  const trimmed = productUrlRaw.trim();
  const productUrl = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;

  _options?.onProgress?.("server");

  const { res, data } = await postSmartstoreProductSave({ productUrl });

  if (!res.ok || data.error) {
    return {
      ok: false,
      error: data.error || "등록 실패",
    };
  }

  if (data.metaFetchIncomplete) {
    return { ok: true, metaNotice: META_NOTICE };
  }

  return { ok: true };
}
