export type ReferrerCategory =
  | "direct"
  | "naver"
  | "kakao"
  | "instagram"
  | "google"
  | "other";

const LABEL: Record<ReferrerCategory, string> = {
  direct: "직접 접속",
  naver: "네이버",
  kakao: "카카오톡",
  instagram: "인스타그램",
  google: "구글",
  other: "기타",
};

export function referrerCategoryLabel(cat: string): string {
  return LABEL[cat as ReferrerCategory] ?? LABEL.other;
}

/** document.referrer 또는 유사 문자열 기준 유입 분류 */
export function categorizeReferrer(
  referrer: string | null | undefined
): ReferrerCategory {
  if (!referrer?.trim()) return "direct";

  let host = "";
  try {
    host = new URL(referrer.trim()).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "direct";
  }

  if (!host) return "direct";

  if (host.includes("naver.")) return "naver";
  if (host.includes("kakao.") || host === "talk.kakaocdn.net" || host.includes("daum"))
    return "kakao";
  if (host.endsWith("instagram.com") || host.includes("instagram.")) return "instagram";
  if (host === "google.com" || host.endsWith(".google.com") || host.endsWith(".googleusercontent.com"))
    return "google";

  return "other";
}

export const REFERRER_ORDER: ReferrerCategory[] = [
  "direct",
  "naver",
  "kakao",
  "instagram",
  "google",
  "other",
];
