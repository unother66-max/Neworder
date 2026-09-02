type SeoExplainerProps = {
  id: string;
  title: string;
  paragraphs: readonly string[];
};

export default function SeoExplainer({
  id,
  title,
  paragraphs,
}: SeoExplainerProps) {
  return (
    <section
      aria-labelledby={id}
      className="border-t border-slate-100 bg-white px-5 py-10 md:px-8 md:py-12"
    >
      <div className="mx-auto max-w-[1240px]">
        <h2
          id={id}
          className="text-xl font-black tracking-[-0.025em] text-slate-900 md:text-2xl"
        >
          {title}
        </h2>
        <div className="mt-4 max-w-4xl space-y-3 text-sm leading-7 text-slate-600 md:text-base">
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
