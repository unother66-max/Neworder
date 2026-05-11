/**
 * /api/internal/visit 내부 시크릿(선택)·브라우저 동일 출처 POST가 사용합니다.
 * NextAuth v5에서 AUTH_SECRET만 쓰는 경우에도 맞추기 위해 우선순위를 통일합니다.
 */
export function getVisitInternalSecret(): string {
  return (
    process.env.VISIT_LOG_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    process.env.AUTH_SECRET ??
    ""
  );
}
