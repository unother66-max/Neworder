import type { Metadata } from "next";
import BlogAnalysisDetailClient from "./blog-analysis-detail-client";

type Props = {
  params: Promise<{ blogId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { blogId: raw } = await params;
  const blogId = decodeURIComponent(raw);
  return {
    title: `${blogId} 블로그 분석 | PostLabs`,
  };
}

function readForceKeywordRefresh(searchParams: Record<string, string | string[] | undefined>): boolean {
  const raw = searchParams.forceKeywordRefresh;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "1" || v === "true";
}

export default async function BlogAnalysisDetailPage({ params, searchParams }: Props) {
  const { blogId: raw } = await params;
  const blogId = decodeURIComponent(raw);
  const sp = searchParams ? await searchParams : {};
  const forceKeywordRefreshDev =
    process.env.NODE_ENV === "development" && readForceKeywordRefresh(sp);

  return (
    <BlogAnalysisDetailClient key={blogId} blogId={blogId} forceKeywordRefreshDev={forceKeywordRefreshDev} />
  );
}
