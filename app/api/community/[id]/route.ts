import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> } // params를 Promise로 정의합니다.
) {
  try {
    // 👈 중요: Next.js 최신 규칙에 따라 params를 await 해줍니다.
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: "ID가 유효하지 않습니다." }, { status: 400 });
    }

    // 해당 ID의 게시글 조회 (작성자 정보 포함)
    const post = await prisma.post.findUnique({
      where: { id: id },
      include: {
        author: {
          select: { name: true, email: true }
        }
      }
    });

    if (!post) {
      return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });
    }

    // 조회수 1 증가
    await prisma.post.update({
      where: { id: id },
      data: { views: { increment: 1 } }
    });

    return NextResponse.json({ ok: true, post });
  } catch (error) {
    console.error("Community Detail GET Error:", error);
    return NextResponse.json({ error: "데이터를 불러오는 중 서버 오류 발생" }, { status: 500 });
  }
}