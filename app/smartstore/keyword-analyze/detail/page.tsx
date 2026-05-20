import KeywordDetailClient from "./keyword-detail-client";

export default async function SmartstoreKeywordAnalyzeDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ keyword?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawKeyword = Array.isArray(params.keyword) ? params.keyword[0] : params.keyword;
  return <KeywordDetailClient initialKeyword={rawKeyword ?? ""} />;
}
