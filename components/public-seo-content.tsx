type FaqItem = {
  question: string;
  answer: string;
};

type PublicSeoContentProps = {
  eyebrow: string;
  title: string;
  description: string;
  features: string[];
  faqs: FaqItem[];
};

export default function PublicSeoContent({
  eyebrow,
  title,
  description,
  features,
  faqs,
}: PublicSeoContentProps) {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return (
    <section className="relative z-10 border-t border-slate-100 bg-white px-5 py-16 text-slate-900 md:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] md:text-5xl">
          {title}
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600 md:text-lg">
          {description}
        </p>

        <div className="mt-10 grid gap-3 md:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5 text-sm font-semibold leading-6 text-slate-700"
            >
              {feature}
            </div>
          ))}
        </div>

        <div className="mt-16">
          <h2 className="text-2xl font-black tracking-[-0.025em]">
            자주 묻는 질문
          </h2>
          <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
            {faqs.map((faq) => (
              <article key={faq.question} className="py-6">
                <h3 className="text-base font-bold text-slate-900">
                  {faq.question}
                </h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  {faq.answer}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </section>
  );
}
