import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// 1. 글과 댓글을 불러오는 API (GET)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) return NextResponse.json({ error: "ID가 유효하지 않습니다." }, { status: 400 });

    const post = await prisma.post.findUnique({
      where: { id: id },
      include: {
        author: { select: { name: true, email: true } },
        comments: {
          include: { author: { select: { name: true, email: true, image: true } } },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!post) return NextResponse.json({ error: "게시글을 찾을 수 없습니다." }, { status: 404 });

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

// 2. 글을 삭제하는 API (DELETE)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions as any) as any;
    if (!session?.user?.email) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const { id } = await params;
    const post = await prisma.post.findUnique({
      where: { id },
      include: { author: true }
    });

    if (!post) return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 });

    // 작성자 본인인지, 혹은 관리자인지 확인
    if (post.author.email !== session.user.email && session.user.email !== "natalie0@nate.com") {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    await prisma.post.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Post DELETE Error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}
// 3. 글을 수정하는 API (PATCH)
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
  ) {
    try {
      const session = await getServerSession(authOptions as any) as any;
      if (!session?.user?.email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  
      const { id } = await params;
      const body = await req.json();
      const { title, category, content } = body;
  
      if (!title || !category || !content) return NextResponse.json({ error: "필수 항목이 누락되었습니다." }, { status: 400 });
  
      const post = await prisma.post.findUnique({ where: { id }, include: { author: true } });
      if (!post) return NextResponse.json({ error: "글을 찾을 수 없습니다." }, { status: 404 });
  
      // 권한 확인 (본인 또는 운영자)
      const isAuthor = post.author.email === session.user.email;
      const isAdmin = session.user.email === "natalie0@nate.com";
  
      if (!isAuthor && !isAdmin) return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  
      // 데이터베이스 업데이트
      await prisma.post.update({
        where: { id },
        data: { title, category, content }
      });
  
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("Post Edit Error:", error);
      return NextResponse.json({ error: "서버 오류" }, { status: 500 });
    }
  }