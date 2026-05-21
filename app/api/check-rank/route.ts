import { confirmedMonthlyVolumes } from "@/lib/blog-keyword-volume";
import { getKeywordSearchVolume } from "@/lib/getKeywordSearchVolume";
import { makePostMatchKey, searchNaverBlogRanks } from "@/lib/naver";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export async function POST(request: Request) {
  try {
    const session = (await getServerSession(authOptions as any)) as any;
    if (!session?.user?.id) {
      return Response.json({ rank: "로그인 필요", searchVolume: "-", error: "로그인이 필요합니다." }, { status: 401 });
    }

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

    const [rankMap, volumeRaw] = await Promise.all([
      searchNaverBlogRanks(keyword, 300),
      getKeywordSearchVolume(keyword),
    ]);

    const key = makePostMatchKey(postLink);
    const foundRank = key ? rankMap.get(key) : undefined;

    const normalized = confirmedMonthlyVolumes(volumeRaw);
    const searchVolume =
      normalized != null
        ? {
            ...volumeRaw,
            ok: true,
            total: normalized.totalVolume,
            mobile: normalized.mobileVolume ?? volumeRaw.mobile,
            pc: normalized.pcVolume ?? volumeRaw.pc,
          }
        : volumeRaw;

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
