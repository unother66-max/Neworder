export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

function extractBlogId(input: string) {
  try {
    const url = new URL(input);

    if (
      url.hostname === "blog.naver.com" ||
      url.hostname === "m.blog.naver.com"
    ) {
      return url.pathname.replace(/^\/+/, "").split("/")[0] || "";
    }

    return "";
  } catch {
    return "";
  }
}

function parseVisitorXml(xml: string) {
  const matches = [...xml.matchAll(/<visitorcnt\s+id="(\d+)"\s+cnt="(\d+)"\s*\/>/g)];

  const items = matches.map((match) => ({
    date: match[1],
    count: Number(match[2]),
  }));

  return items;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const blogUrl = String(body.blogUrl || "").trim();

    if (!blogUrl) {
      return NextResponse.json(
        { ok: false, error: "blogUrl 없음" },
        { status: 400 }
      );
    }

    const blogId = extractBlogId(blogUrl);

    if (!blogId) {
      return NextResponse.json(
        { ok: false, error: "blogId 추출 실패" },
        { status: 400 }
      );
    }

    const apiUrl = `https://blog.naver.com/NVisitorgp4Ajax.naver?blogId=${encodeURIComponent(
      blogId
    )}`;

    const res = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        Referer: `https://blog.naver.com/${blogId}`,
      },
      cache: "no-store",
    });

    const xml = await res.text();

    const items = parseVisitorXml(xml);
    const latest = items.length ? items[items.length - 1] : null;

    console.log("[blog-visitor] blogId:", blogId);
    console.log("[blog-visitor] apiUrl:", apiUrl);
    console.log("[blog-visitor] items:", items);

    return NextResponse.json({
      ok: true,
      blogId,
      visitor: latest?.count ?? null,
      latestDate: latest?.date ?? null,
      daily: items,
    });
  } catch (error) {
    console.error("blog-visitor error:", error);

    return NextResponse.json(
      { ok: false, error: "방문자 수집 실패" },
      { status: 500 }
    );
  }
}