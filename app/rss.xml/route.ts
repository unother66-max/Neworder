export async function GET() {
    const baseUrl = "https://postlabs.co.kr";
  
    const rss = `<?xml version="1.0" encoding="UTF-8" ?>
  <rss version="2.0">
    <channel>
      <title>포스트랩스</title>
      <link>${baseUrl}</link>
      <description>네이버 플레이스 순위조회, 스마트스토어 순위확인, 키워드 분석, 리뷰 추적 서비스</description>
      <language>ko-KR</language>
      <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  
      <item>
        <title>포스트랩스 | 네이버 플레이스 순위조회</title>
        <link>${baseUrl}/place</link>
        <description>네이버 플레이스 순위조회와 순위 추적 기능을 제공합니다.</description>
        <pubDate>${new Date().toUTCString()}</pubDate>
      </item>
  
      <item>
        <title>포스트랩스 | 스마트스토어 순위확인</title>
        <link>${baseUrl}/smartstore</link>
        <description>스마트스토어 상품 순위확인과 키워드 분석 기능을 제공합니다.</description>
        <pubDate>${new Date().toUTCString()}</pubDate>
      </item>
  
      <item>
        <title>포스트랩스 | 네이버 플레이스 순위 분석</title>
        <link>${baseUrl}/place-analysis</link>
        <description>네이버 플레이스 키워드별 순위와 경쟁 매장을 분석합니다.</description>
        <pubDate>${new Date().toUTCString()}</pubDate>
      </item>
  
      <item>
        <title>포스트랩스 커뮤니티</title>
        <link>${baseUrl}/community</link>
        <description>마케팅, 순위조회, 키워드 분석 관련 정보를 공유합니다.</description>
        <pubDate>${new Date().toUTCString()}</pubDate>
      </item>
    </channel>
  </rss>`;
  
    return new Response(rss, {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
      },
    });
  }