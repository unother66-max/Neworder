import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route"; 

export const dynamic = "force-dynamic";

// 🚨 관리자 이메일 설정
const ADMIN_EMAIL = "natalie0@nate.com"; 

export async function GET() {
  try {
    const posts = await prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        author: { select: { name: true, email: true } }
      }
    });
    return NextResponse.json({ ok: true, posts: posts || [] });
  } catch (error) {
    console.error("Community GET Error:", error);
    return NextResponse.json({ ok: false, error: "목록 로딩 실패" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions as any) as any;
    const userId = session?.user?.id;
    
    // 🚨 마법의 코드 적용
    const userEmail = session?.user?.email?.trim().toLowerCase() || "";

    if (!userId) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const body = await req.json();
    
    // 🚨 프론트엔드에서 보낸 isSecret 값을 추가로 받아옵니다.
    const { title, category, content, isSecret } = body;

    // 🚨 관리자 권한 체크 로직 보강
    if (category === "공지" && userEmail !== ADMIN_EMAIL.toLowerCase()) {
      return NextResponse.json({ error: "공지사항은 관리자 전용입니다." }, { status: 403 });
    }

    if (!title || !content || !category) {
      return NextResponse.json({ error: "필수 항목이 누락되었습니다." }, { status: 400 });
    }

    const post = await prisma.post.create({
      data: {
        title,
        category,
        content,
        isSecret: isSecret || false, // 🚨 전달받은 비밀글 여부를 DB에 저장합니다. (없으면 기본값 false)
        userId
      }
    });

    return NextResponse.json({ ok: true, post });
  } catch (error) {
    console.error("Community POST Error:", error);
    return NextResponse.json({ error: "글 등록 중 서버 오류 발생" }, { status: 500 });
  }
}