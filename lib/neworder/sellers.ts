export const BAEMIN_MART_SOURCE = "BAEMIN_MART" as const;
export const BAEMIN_MART_BASE_URL = "https://mart.baemin.com/";
export const BAEMIN_MART_DOMAIN = "mart.baemin.com";

export function isBaeminMartUrl(value: string): boolean {
  try {
    return new URL(value).hostname.toLowerCase() === BAEMIN_MART_DOMAIN;
  } catch {
    return false;
  }
}
