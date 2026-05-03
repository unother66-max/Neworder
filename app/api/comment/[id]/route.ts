import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

const ADMIN_EMAIL = "natalie0@nate.com";

// 1. 댓글 수정 (PATCH)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions as any) as any;
    if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { id } = await params;
    const { content } = await req.json();

    if (!content.trim()) return NextResponse.json({ error: "내용이 없습니다." }, { status: 400 });

    const comment = await prisma.comment.findUnique({ where: { id }, include: { author: true } });
    if (!comment) return NextResponse.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 });

    // 🚨 권한 체크 철저하게 수정 (고유 ID 비교 + 이메일 소문자 공백제거 비교)
    const sessionUserId = session.user.id;
    const sessionEmail = session.user.email?.trim().toLowerCase() || "";
    const commentAuthorEmail = comment.author?.email?.trim().toLowerCase() || "";

    const isAuthor = (sessionUserId && comment.userId === sessionUserId) || 
                     (sessionEmail && commentAuthorEmail === sessionEmail);
    const isAdmin = sessionEmail === ADMIN_EMAIL.toLowerCase();

    if (!isAuthor && !isAdmin) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    await prisma.comment.update({
      where: { id },
      data: { content }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Comment Edit Error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}

// 2. 댓글 삭제 (DELETE)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions as any) as any;
    if (!session?.user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

    const { id } = await params;
    
    const comment = await prisma.comment.findUnique({ where: { id }, include: { author: true } });
    if (!comment) return NextResponse.json({ error: "댓글을 찾을 수 없습니다." }, { status: 404 });

    // 🚨 삭제 부분도 동일하게 철저한 권한 체크 적용
    const sessionUserId = session.user.id;
    const sessionEmail = session.user.email?.trim().toLowerCase() || "";
    const commentAuthorEmail = comment.author?.email?.trim().toLowerCase() || "";

    const isAuthor = (sessionUserId && comment.userId === sessionUserId) || 
                     (sessionEmail && commentAuthorEmail === sessionEmail);
    const isAdmin = sessionEmail === ADMIN_EMAIL.toLowerCase();

    if (!isAuthor && !isAdmin) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    await prisma.comment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Comment Delete Error:", error);
    return NextResponse.json({ error: "서버 오류" }, { status: 500 });
  }
}