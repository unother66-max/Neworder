export default function Loading() {
  return (
    <main className="grid min-h-dvh place-items-center bg-white px-6">
      <div className="flex flex-col items-center text-center">
        <img
          src="/images/earth-loading.gif"
          alt=""
          width={200}
          height={200}
          className="h-[200px] w-[200px]"
        />
        <p className="mt-4 text-[15px] font-medium text-slate-700">
          글로벌 데이터를 분석 중입니다...
        </p>
      </div>
    </main>
  );
}

