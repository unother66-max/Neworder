import { makePostMatchKey, searchNaverBlogRanks } from "@/lib/naver";
import { getKeywordSearchVolume } from "@/lib/searchad";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const keyword = body.keyword as string;
    const postLink = body.postLink as string;

    if (!keyword?.trim()) {
      return Response.json({
        rank: "키워드 없음",
        searchVolume: "-",
      });
    }

    if (!postLink?.trim()) {
      return Response.json({
        rank: "링크 없음",
        searchVolume: "-",
      });
    }

    const [rankMap, searchVolume] = await Promise.all([
      searchNaverBlogRanks(keyword, 300),
      getKeywordSearchVolume(keyword),
    ]);

    const key = makePostMatchKey(postLink);
    const foundRank = key ? rankMap.get(key) : undefined;

    return Response.json({
      rank: foundRank ? `${foundRank}위` : "300위 밖에",
      searchVolume: searchVolume || "-",
    });
  } catch (error) {
    console.error("check-rank error:", error);

    return Response.json({
      rank:
        error instanceof Error ? `오류` : "오류",
      searchVolume: "-",
    });
  }
}