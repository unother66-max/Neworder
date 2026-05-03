import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(
  req: Request, 
  { params }: { params: Promise<{ id: string }> } // 🚨 파라미터를 Promise로 받습니다.
) {
  try {
    const session = await getServerSession(authOptions as any) as any;
    if (!session?.user?.id) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    // 🚨 핵심 수정 부분: 글 번호(id)를 기다렸다가(await) 가져옵니다!
    const { id } = await params;

    const { content } = await req.json();
    if (!content || !content.trim()) {
      return NextResponse.json({ error: "내용을 입력해주세요." }, { status: 400 });
    }

    const comment = await prisma.comment.create({
      data: {
        content,
        postId: id, // 🚨 가져온 글 번호(id)를 여기에 쏙 넣어줍니다.
        userId: session.user.id
      },
      include: {
        author: { select: { name: true, image: true } }
      }
    });

    return NextResponse.json({ ok: true, comment });
  } catch (error) {
    console.error("Comment POST Error:", error);
    return NextResponse.json({ error: "댓글 등록 실패" }, { status: 500 });
  }
}