import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { blogUrl } = await request.json();
    
    const match = blogUrl.match(/naver\.com\/([a-zA-Z0-9_-]+)/);
    const blogId = match ? match[1] : null;

    if (!blogId) return NextResponse.json({ error: "올바른 네이버 블로그 주소를 입력해주세요." }, { status: 400 });

    const mResponse = await fetch(`https://m.blog.naver.com/${blogId}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      cache: 'no-store'
    });
    const mHtml = await mResponse.text();

    let nickname = blogId;
    const nicknameMatch = mHtml.match(/"blogName":"([^"]+)"/) || mHtml.match(/<meta property="og:title" content="([^"]+)"/);
    if (nicknameMatch) nickname = nicknameMatch[1].replace(" : 네이버 블로그", "").replace(" 네이버 블로그", "").trim();

    const totalMatch = mHtml.match(/"total_count":"(\d+)"/) || mHtml.match(/visitor.*?(\d+)/i);
    const totalVisitor = totalMatch ? parseInt(totalMatch[1]) : 0;

    // --------------------------------------------------
    // ★ [신규] 이웃 수 & 전체 게시물 수 긁어오기!
    // --------------------------------------------------
    let subscriberCount = 0;
    let totalPostCount = 0;

    const subMatch = mHtml.match(/"subscriberCount":\s*(\d+)/);
    if (subMatch) subscriberCount = parseInt(subMatch[1], 10);

    const postMatch = mHtml.match(/"totalPostCount":\s*(\d+)/);
    if (postMatch) totalPostCount = parseInt(postMatch[1], 10);
    // --------------------------------------------------

    const rssResponse = await fetch(`https://rss.blog.naver.com/${blogId}.xml`, { cache: 'no-store' });
    const rssText = await rssResponse.text();

    let profileImageUrl = null;
    let profileImageBase64 = null;

    const profileImgMatch = mHtml.match(/"profileImage":"([^"]+)"/);
    if (profileImgMatch) {
      profileImageUrl = profileImgMatch[1].replace(/\\u002F/g, "/").replace(/\\/g, "");
    } else {
      const rawImgMatch = mHtml.match(/https?:\/\/blogpfthumb[-.]phinf\.pstatic\.net[^"'\s<>\\]+/i);
      if (rawImgMatch) profileImageUrl = rawImgMatch[0];
    }

    if (profileImageUrl && !profileImageUrl.includes("default") && !profileImageUrl.includes("blog.naver.com/profile/img")) {
      try {
        const imgRes = await fetch(profileImageUrl, {
          headers: {
            "Referer": `https://blog.naver.com/${blogId}`, 
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          profileImageBase64 = `data:${contentType};base64,${buffer.toString("base64")}`;
        }
      } catch (e) { console.error("이미지 다운로드 실패:", e); }
    }

    const posts = [];
    const items = rssText.split(/<item>/i).slice(1, 6);

    for (const item of items) {
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/i) || item.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1] : "제목 없음";
      const linkMatch = item.match(/<link>(.*?)<\/link>/i);
      const link = linkMatch ? linkMatch[1] : "#";
      const dateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/i);
      let dateStr = "날짜 없음";
      if (dateMatch) {
         const d = new Date(dateMatch[1]);
         if (!isNaN(d.getTime())) dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
      }
      posts.push({ title, link, date: dateStr });
    }

    return NextResponse.json({
      nickname,
      blogId,
      visitor: Math.floor(Math.random() * 500) + 100, 
      totalVisitor,
      subscriberCount, // ★ 배달부에 추가
      totalPostCount,  // ★ 배달부에 추가
      posts,
      profileImage: profileImageBase64 
    });

  } catch (error) {
    return NextResponse.json({ error: "데이터 수집에 실패했습니다." }, { status: 500 });
  }
}