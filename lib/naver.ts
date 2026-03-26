type NaverBlogItem = {
  title: string;
  link: string;
  description: string;
  bloggername: string;
  bloggerlink: string;
  postdate: string;
};

export type NaverPostKey = {
  blogId: string;
  logNo: string;
};

function normalizeUrl(url: string) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

function extractBlogPostKey(url: string): NaverPostKey | null {
  const normalized = normalizeUrl(url);

  try {
    const u = new URL(normalized);

    // 1) m.blog.naver.com/kikolog/223123456789
    // 2) blog.naver.com/kikolog/223123456789
    const pathParts = u.pathname.split("/").filter(Boolean);

    if (
      (u.hostname === "m.blog.naver.com" || u.hostname === "blog.naver.com") &&
      pathParts.length >= 2
    ) {
      const blogId = pathParts[0];
      const logNo = pathParts[1];

      if (blogId && /^\d+$/.test(logNo)) {
        return { blogId: blogId.toLowerCase(), logNo };
      }
    }

    // 3) blog.naver.com/PostView.naver?blogId=kikolog&logNo=223123456789
    const blogId = u.searchParams.get("blogId");
    const logNo = u.searchParams.get("logNo");

    if (blogId && logNo) {
      return { blogId: blogId.toLowerCase(), logNo };
    }
  } catch {
    return null;
  }

  return null;
}

export async function searchNaverBlogRanks(keyword: string, maxResults = 300) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 없습니다.");
  }

  const allItems: NaverBlogItem[] = [];
  let start = 1;

  while (allItems.length < maxResults) {
    const display = Math.min(100, maxResults - allItems.length);

    const apiUrl =
      `https://openapi.naver.com/v1/search/blog.json?query=${encodeURIComponent(keyword)}` +
      `&display=${display}&start=${start}&sort=sim`;

    const res = await fetch(apiUrl, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`네이버 검색 API 호출 실패: ${res.status}`);
    }

    const data = await res.json();
    const items = (data.items || []) as NaverBlogItem[];

    if (!items.length) break;

    allItems.push(...items);
    start += items.length;

    if (items.length < display) break;
  }

  // 핵심: URL 문자열이 아니라 blogId + logNo 기준으로 순위 맵 만들기
  const rankMap = new Map<string, number>();

  allItems.forEach((item, index) => {
    const key = extractBlogPostKey(item.link);

    if (key) {
      rankMap.set(`${key.blogId}:${key.logNo}`, index + 1);
    }
  });

  return rankMap;
}

export function makePostMatchKey(url: string) {
  const key = extractBlogPostKey(url);
  if (!key) return null;

  return `${key.blogId}:${key.logNo}`;
}