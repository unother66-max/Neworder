import type { Metadata } from "next";
import Link from "next/link";
import TopNav from "@/components/top-nav";

export const metadata: Metadata = {
  title: "이용약관 | 포스트랩스(PostLabs)",
  description:
    "포스트랩스(PostLabs) 서비스 이용약관. 네이버 플레이스·블로그·스마트스토어·키워드 분석 서비스 이용 조건을 확인하세요.",
};

export default function TermsPage() {
  return (
    <>
      <TopNav showBreadcrumb={false} />
      <main className="min-h-[calc(100vh-8rem)] bg-white pb-16 pt-20 text-slate-900 md:pt-24">
        <article className="mx-auto max-w-4xl px-4 md:px-6">
          <p className="mb-3 text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-slate-400">
            PostLabs
          </p>
          <h1 className="font-black tracking-[-0.03em] text-slate-900 text-[clamp(1.75rem,4vw,2.25rem)] leading-tight">
            이용약관
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-600 md:text-base">
            본 약관은 포스트랩스(PostLabs)가 제공하는 온라인 서비스 이용과 관련하여 회사와
            이용자 간의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.
          </p>

          <section className="mt-10" aria-labelledby="services-heading">
            <h2
              id="services-heading"
              className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg"
            >
              제공 서비스
            </h2>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600 md:text-base">
              회사가 제공하는 기능은 버전·플랜에 따라 일부가 달라질 수 있으며, 대표적으로 아래 영역을
              포함합니다. 세부 화면·지표 명칭은 서비스 업데이트에 따라 조정될 수 있습니다.
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-slate-600 md:text-base">
              <li>
                네이버 플레이스 분석: 검색·저장·리뷰 등 플레이스 관련 지표 및 순위 추적·리포트 기능
              </li>
              <li>
                네이버 블로그 분석: 블로그·포스트 단위 키워드·노출 관련 분석 및 조회 기능
              </li>
              <li>
                스마트스토어 분석: 상품·쇼핑 검색 연계 순위·리뷰 등 스토어 운영 지표 분석
              </li>
              <li>
                키워드 분석: 검색량·연관 키워드 등 마케팅 의사결정을 돕는 키워드 데이터 제공
              </li>
            </ul>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-600 md:text-base">
              위 기능은 모두 참고용 분석·모니터링 목적으로 제공되며, 특정 순위 달성·매출 증대 등
              결과를 보장하지 않습니다.
            </p>
          </section>

          <section className="mt-12 space-y-10">
            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                제1조 (목적)
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600 md:text-base">
                본 약관은 회사가 운영하는 포스트랩스 웹·앱 등 일체의 온라인 서비스(이하
                &quot;서비스&quot;)의 이용 조건, 회사와 회원 간 권리·의무, 분석 데이터의 성격 및 책임
                한도를 정함을 목적으로 합니다.
              </p>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                제2조 (정의)
              </h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-slate-600 md:text-base">
                <li>
                  &quot;서비스&quot;란 회사가 SaaS 형태로 제공하는 네이버 플레이스·블로그·스마트스토어·키워드
                  분석 및 이에 부수되는 저장·알림·리포트 기능 일체를 말합니다.
                </li>
                <li>
                  &quot;회원&quot;이란 본 약관에 동의하고 회사가 정한 절차에 따라 계정을 생성하거나 로그인하여
                  서비스를 이용하는 자를 말합니다.
                </li>
                <li>
                  &quot;분석 데이터&quot;란 외부 플랫폼·공개 정보·회원 입력 정보 등을 수집·가공하여 서비스
                  화면에 표시되는 수치·순위·그래프·텍스트 등을 말합니다.
                </li>
                <li>
                  &quot;게시물&quot;이란 회원이 서비스 내에 입력하거나 업로드한 URL, 키워드, 메모 등 이용 기록을
                  말합니다.
                </li>
              </ol>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                제3조 (약관의 게시와 개정)
              </h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-slate-600 md:text-base">
                <li>
                  회사는 본 약관을 서비스 초기 화면 또는 연결 화면에 게시하여 회원이 언제든 확인할 수
                  있도록 합니다.
                </li>
                <li>
                  회사는 관련 법령을 위반하지 않는 범위에서 약관을 개정할 수 있으며, 변경 내용·시행일·
                  변경 사유를 시행일 7일 전(회원에게 불리한 경우 30일 전)부터 서비스 내 공지합니다.
                </li>
                <li>
                  회원이 개정 약관 시행일 이후에도 서비스를 계속 이용하는 경우 개정 약관에 동의한 것으로
                  간주합니다. 동의하지 않는 경우 이용계약을 해지할 수 있습니다.
                </li>
              </ol>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                제4조 (이용계약의 성립)
              </h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-slate-600 md:text-base">
                <li>
                  이용계약은 회원이 약관에 동의하고 회사가 정한 가입 절차를 완료한 시점에 성립합니다.
                </li>
                <li>
                  회사는 다음 각 호에 해당하는 경우 가입을 거절하거나 사후에 이용을 제한·해지할 수
                  있습니다.
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>허위 정보 제공, 타인 명의 도용, 중복·부정 가입이 의심되는 경우</li>
                    <li>서비스 운영·보안·다른 회원의 권익을 현저히 해치는 경우</li>
                    <li>법령 또는 본 약관·별도 운영정책을 위반한 경우</li>
                  </ul>
                </li>
              </ol>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                제5조 (서비스의 제공·변경·중단)
              </h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-slate-600 md:text-base">
                <li>
                  회사는 분석 파이프라인 안정화, 기능 고도화, 보안 패치 등을 위해 서비스를 상시 개선할
                  수 있으며, 이에 따라 UI·지표 정의·제공 주기가 변경될 수 있습니다.
                </li>
                <li>
                  점검, 장애, 트래픽 과부하, 외부 API 제한 등으로 서비스의 전부 또는 일부가 일시 중단될
                  수 있습니다. 가능한 경우 사전 또는 사후 공지합니다.
                </li>
                <li>
                  네이버·카카오 등 제3자 플랫폼의 정책·노출 규칙·데이터 제공 방식이 변경되면, 회사는 합리적
                  범위 내에서 수집 경로·분석 로직을 조정할 수 있으며 그 결과 화면상 지표가 달라질 수
                  있습니다.
                </li>
              </ol>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                제6조 (분석 데이터의 성격 및 이용)
              </h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-slate-600 md:text-base">
                <li>
                  분석 데이터는 통계·추정·지연 반영 등 기술적 특성상 오차·누락·시차가 발생할 수 있으며,
                  금융·법률·행정 등 최종 판단의 유일한 근거로 삼기에 적합하지 않습니다.
                </li>
                <li>
                  순위·노출·검색량 등은 실시간 검색 결과와 다를 수 있고, 동일 조건에서도 플랫폼 측
                  실험·개인화·지역·단말에 따라 달라질 수 있습니다.
                </li>
                <li>
                  회원은 분석 데이터를 내부 의사결정 보조 목적으로 이용해야 하며, 회사의 별도 서면 동의
                  없이 제3자에게 재판매·대량 배포하는 행위를 해서는 안 됩니다.
                </li>
              </ol>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                제7조 (회원의 의무)
              </h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-slate-600 md:text-base">
                <li>
                  회원은 관계 법령, 본 약관, 개인정보처리방침 및 회사가 게시한 운영정책·공지를
                  준수합니다.
                </li>
                <li>
                  회원은 타인의 영업비밀·개인정보·저작권을 침해하지 않도록 입력 정보의 적법성을 보증합니다.
                </li>
                <li>
                  계정·비밀번호·인증 수단을 제3자와 공유하지 않으며, 무단 사용이 의심되면 즉시 회사에
                  통지합니다.
                </li>
              </ol>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                제8조 (금지 행위)
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600 md:text-base">
                회원은 다음 각 호의 행위를 해서는 안 됩니다. 위반 시 회사는 제9조에 따라 조치할 수
                있습니다.
              </p>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-slate-600 md:text-base">
                <li>
                  크롤링·스크래핑·리버스 엔지니어링 등을 통해 서비스 또는 분석 데이터의 전부·일부를
                  무단으로 수집·복제·재구축하는 행위
                </li>
                <li>
                  봇·스크립트·자동화 도구 등을 이용하여 정상 이용 패턴을 벗어난 대량 요청·반복 접속을
                  하거나, 회사가 허용하지 않은 방식으로 API·엔드포인트에 접근하는 행위
                </li>
                <li>
                  서비스의 보안·인증·요금·쿼터 제한을 우회·무력화하거나, 타 계정·시스템에 비정상적으로
                  침입하는 행위
                </li>
                <li>
                  분석 결과·리포트·대시보드 캡처 등을 무단으로 복제·배포하여 회사 또는 제3자의 권리를
                  침해하는 행위
                </li>
                <li>
                  서비스 운영을 방해하거나 다른 회원의 이용을 불편하게 하는 행위, 불법·비윤리적 목적의
                  이용 행위
                </li>
              </ol>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                제9조 (이용 제한 및 계약 해지)
              </h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-slate-600 md:text-base">
                <li>
                  회사는 회원이 본 약관 또는 관련 법령을 위반한 경우 경고, 기능 제한, 계정 정지, 영구
                  이용 제한 등 필요한 조치를 할 수 있습니다.
                </li>
                <li>
                  회원은 언제든지 회사가 제공하는 탈퇴 절차에 따라 이용계약을 해지할 수 있습니다.
                </li>
                <li>
                  이용 제한·해지와 관련하여 회원에게 발생한 데이터 삭제·포인트 소멸 등은 개인정보처리방침
                  및 별도 고지에 따릅니다.
                </li>
              </ol>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                제10조 (저작권 및 지식재산권)
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600 md:text-base">
                서비스 UI, 로고, 소스코드, 데이터베이스 구조, 리포트 템플릿, 브랜드 자산 등에 대한
                저작권·상표권·영업비밀 등 지식재산권은 회사 또는 정당한 권리자에게 귀속됩니다. 회원은
                회사의 사전 서면 동의 없이 이를 복제·전송·공중송신·2차적 저작물 작성 등으로 이용할 수
                없습니다.
              </p>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                제11조 (면책)
              </h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-slate-600 md:text-base">
                <li>
                  회사는 천재지변, 정전, 통신망 장애, 제3자 플랫폼·클라우드 인프라 장애 등 회사의 합리적
                  통제를 벗어난 사유로 서비스를 제공하지 못한 경우 책임이 면제됩니다.
                </li>
                <li>
                  네이버·카카오 등 외부 플랫폼의 정책 변경, 검색·노출 알고리즘 조정, 데이터 제공 중단·
                  형식 변경으로 인해 분석 결과가 달라지거나 제공이 어려워진 경우, 회사는 이에 대한
                  결과 보증이나 손해배상 책임을 지지 않습니다.
                </li>
                <li>
                  순위 변동, 검색량 추정 오차, 리뷰·저장 수 집계 지연 등 분석 데이터와 실제 현장 간의
                  불일치로 발생한 손해에 대하여 회사는 고의 또는 중대한 과실이 없는 한 책임을 지지
                  않습니다.
                </li>
                <li>
                  회원이 분석 데이터를 근거로 한 마케팅·계약·투자 등의 의사결정에서 입은 영업 손실·
                  기회 손실 등 간접적·특별 손해에 대하여 회사는 책임을 지지 않습니다.
                </li>
                <li>
                  회원의 귀책 사유, 제3자의 불법 행위, 회원 단말·네트워크 환경으로 인해 발생한 문제에
                  대하여 회사는 책임을 지지 않습니다.
                </li>
              </ol>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                제12조 (준거법 및 재판관할)
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600 md:text-base">
                본 약관은 대한민국 법령에 따릅니다. 서비스 이용과 관련하여 회사와 회원 간 분쟁이
                발생한 경우 상호 협의로 해결하는 것을 원칙으로 하며, 협의가 이루어지지 않으면
                민사소송법 등 관련 법령이 정한 관할 법원을 전속 관할로 합니다.
              </p>
            </div>

            <div>
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900 md:text-lg">
                부칙
              </h2>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600 md:text-base">
                본 약관은 2026년 5월 12일부터 시행합니다.
              </p>
            </div>
          </section>

          <p className="mt-14 text-[14px] text-slate-500 md:text-[15px]">
            <Link href="/privacy" className="font-medium text-[#0029FF] hover:underline">
              개인정보처리방침
            </Link>
            을 함께 확인해 주세요.
          </p>
        </article>
      </main>
    </>
  );
}
