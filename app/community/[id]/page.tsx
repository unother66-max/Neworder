import type { Metadata } from "next";
import CommunityDetailClient from "./CommunityDetailClient";

const SITE_URL = "https://postlabs.co.kr";

type Props = {
  params: Promise<{ id: string }>;
};

function stripHtml(text?: string) {
  return (text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const res = await fetch(`${SITE_URL}/api/community/${id}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return {
        title: "커뮤니티 | 포스트랩스",
        description:
          "네이버 플레이스, 스마트스토어, 블로그 마케팅 정보를 공유하는 포스트랩스 커뮤니티",
      };
    }

    const data = await res.json();
    const post = data?.post;

    if (!post) {
      return {
        title: "커뮤니티 | 포스트랩스",
        description:
          "네이버 플레이스, 스마트스토어, 블로그 마케팅 정보를 공유하는 포스트랩스 커뮤니티",
      };
    }

    const title = `${post.title} | 포스트랩스`;
    const description =
      stripHtml(post.content).slice(0, 150) ||
      "포스트랩스 커뮤니티 게시글입니다.";

    const url = `${SITE_URL}/community/${id}`;

    return {
      title,
      description,
      alternates: {
        canonical: url,
      },
      openGraph: {
        title,
        description,
        url,
        siteName: "포스트랩스",
        type: "article",
        images: [
          {
            url: `${SITE_URL}/images/og-image-v2.png`,
            width: 1200,
            height: 630,
            alt: "포스트랩스",
          },
        ],
        locale: "ko_KR",
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [`${SITE_URL}/images/og-image-v2.png`],
      },
    };
  } catch {
    return {
      title: "커뮤니티 | 포스트랩스",
      description:
        "네이버 플레이스, 스마트스토어, 블로그 마케팅 정보를 공유하는 포스트랩스 커뮤니티",
    };
  }
}

export default function CommunityDetailPage() {
  return <CommunityDetailClient />;
}