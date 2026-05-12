import type { Metadata } from "next";
import Link from "next/link";
import TopNav from "@/components/top-nav";

export const metadata: Metadata = {
  title: "개인정보처리방침 | 포스트랩스(PostLabs)",
  description:
    "포스트랩스(PostLabs) 개인정보처리방침. 카카오 로그인 등 수집 항목, 이용 목적, 보관 및 회원 탈퇴 시 삭제 정책을 안내합니다.",
};

export default function PrivacyPage() {
  return (
    <>
      <TopNav showBreadcrumb={false} />
      <main className="min-h-[calc(100vh-8rem)] bg-white pb-16 pt-20 text-slate-900 md:pt-24">
        <article className="mx-auto max-w-4xl px-4 md:px-6">
          <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-slate-400">
            PostLabs
          </p>
          <h1 className="font-black tracking-[-0.03em] text-slate-900 text-[clamp(1.75rem,4vw,2.25rem)] leading-tight">
            개인정보처리방침
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-600 md:text-base">
            포스트랩스(PostLabs)(이하 &quot;회사&quot;)는 이용자의 개인정보를 중요하게 생각하며,
            「개인정보 보호법」 등 관련 법령을 준수합니다. 본 방침은 회사가 제공하는 서비스 적용을
            목적으로 하며, 변경 시 서비스 내 공지 등을 통해 안내합니다.
          </p>

          <section className="mt-12 space-y-10">
            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                1. 수집하는 개인정보 항목
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600 md:text-base">
                회사는 서비스 제공을 위해 다음과 같은 정보를 수집할 수 있습니다.
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-slate-600 md:text-base">
                <li>카카오 로그인 정보(카카오 계정을 통한 인증에 필요한 식별 정보)</li>
                <li>이메일</li>
                <li>닉네임</li>
                <li>프로필 이미지</li>
                <li>접속 로그(IP, 접속 일시, 브라우저 유형 등)</li>
                <li>서비스 이용 기록</li>
              </ul>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                2. 개인정보의 처리 목적
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600 md:text-base">
                회사는 수집한 정보를 다음의 목적으로만 처리합니다.
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-slate-600 md:text-base">
                <li>로그인 처리 및 회원 식별</li>
                <li>서비스 제공, 기능 운영, 고지·통지</li>
                <li>통계 분석 및 서비스 품질 개선</li>
                <li>문의 대응 및 분쟁 처리</li>
              </ul>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                3. 보유 및 이용 기간
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600 md:text-base">
                회사는 원칙적으로 개인정보 수집 및 이용 목적이 달성된 후에는 해당 정보를 지체 없이
                파기합니다. 다만 관계 법령에 따라 일정 기간 보관이 필요한 경우 해당 법령에서 정한
                기간 동안 보관합니다.
              </p>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                4. 회원 탈퇴 시 개인정보 삭제
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600 md:text-base">
                회원이 탈퇴를 요청하는 경우, 회사는 지체 없이 회원의 개인정보를 삭제합니다. 다만,
                관계 법령에 의하여 보관 의무가 있는 정보는 해당 기간 동안 별도 저장·관리되며,
                보관 목적 외의 다른 목적으로 이용하지 않습니다. 전자상거래 등에서의 소비자보호에 관한
                법률 등에 따른 거래 기록은 법정 보존 기간에 따라 보관될 수 있습니다.
              </p>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                5. 개인정보의 제3자 제공 및 처리위탁
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600 md:text-base">
                회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 따른
                요청이 있는 경우는 예외입니다. 서비스 운영을 위해 필요한 범위에서 개인정보 처리를
                위탁하는 경우, 위탁 업무의 내용과 수탁자를 이용자가 확인할 수 있도록 공개하거나
                안내합니다.
              </p>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                6. 이용자의 권리
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600 md:text-base">
                이용자는 언제든지 개인정보 열람·정정·삭제·처리 정지를 요청할 수 있으며, 회사는 지체
                없이 필요한 조치를 하겠습니다.
              </p>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                7. 개인정보 보호책임자
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600 md:text-base">
                개인정보 처리에 관한 문의는 서비스 내 고객 지원 채널 또는 회사가 안내하는 연락처로
                요청해 주시기 바랍니다.
              </p>
              <dl className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 text-[14px] leading-relaxed text-slate-600 md:p-6 md:text-[15px]">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                  <dt className="shrink-0 font-semibold text-slate-700 sm:w-36">상호</dt>
                  <dd>포스트랩스(PostLabs)</dd>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                  <dt className="shrink-0 font-semibold text-slate-700 sm:w-36">대표자</dt>
                  <dd>이환희</dd>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                  <dt className="shrink-0 font-semibold text-slate-700 sm:w-36">주소</dt>
                  <dd>서울 용산구 한남동 683-55, 1F</dd>
                </div>
              </dl>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                8. 방침의 변경
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600 md:text-base">
                본 개인정보처리방침은 2026년 5월 12일부터 적용됩니다. 내용 추가·삭제 및 수정이 있을
                경우 시행일 최소 7일 전에 공지합니다.
              </p>
            </div>
          </section>

          <p className="mt-14 text-[14px] text-slate-500 md:text-[15px]">
            서비스 이용 조건은{" "}
            <Link href="/terms" className="font-medium text-[#0029FF] hover:underline">
              이용약관
            </Link>
            을 참고해 주세요.
          </p>
        </article>
      </main>
    </>
  );
}
