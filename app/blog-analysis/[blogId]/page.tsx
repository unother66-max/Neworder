import type { Metadata } from "next";
import BlogAnalysisDetailClient from "./blog-analysis-detail-client";

type Props = {
  params: Promise<{ blogId: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { blogId: raw } = await params;
  const blogId = decodeURIComponent(raw);
  return {
    title: `${blogId} 블로그 분석 | PostLabs`,
  };
}

export default async function BlogAnalysisDetailPage({ params }: Props) {
  const { blogId: raw } = await params;
  const blogId = decodeURIComponent(raw);
  return <BlogAnalysisDetailClient key={blogId} blogId={blogId} />;
}
