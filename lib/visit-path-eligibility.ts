/**
 * VisitorEvent(건별 이벤트) 저장 대상 경로 — VisitorLog(일 방문)와 구분
 */

export function visitPathnameFromFullPath(full: string): string {
  const trimmed = full.trim();
  const q = trimmed.indexOf("?");
  return (q >= 0 ? trimmed.slice(0, q) : trimmed) || "/";
}

/** `/admin/*`, `/api/*`, `/login`, `/_next/*` 는 VisitorEvent 제외 */
export function shouldPersistVisitorEvent(pathname: string): boolean {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (p.startsWith("/admin")) return false;
  if (p.startsWith("/operations")) return false;
  if (p.startsWith("/api")) return false;
  if (p === "/login" || p.startsWith("/login/")) return false;
  if (p.startsWith("/_next")) return false;
  return true;
}
