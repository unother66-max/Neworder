/**
 * 라우트 전환 시 세그먼트 Suspense 로딩 UI.
 * fixed + 높은 z-index + 불투명 배경으로 이전 화면/모달 블러 잔상이 비치지 않게 합니다.
 */
export function GlobalLoading({
  message = "데이터를 분석 중입니다...",
}: {
  message?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[22000] flex min-h-dvh w-screen flex-col items-center justify-center bg-white px-6"
    >
      <div className="flex flex-col items-center text-center">
        <img
          src="/images/earth-loading.gif"
          alt=""
          width={200}
          height={200}
          className="h-[200px] w-[200px]"
        />
        <p className="mt-4 text-[15px] font-medium text-slate-700">{message}</p>
      </div>
    </div>
  );
}
