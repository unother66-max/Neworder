import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export const dynamic = "force-dynamic";

// 🚨 관리자 이메일 설정
const ADMIN_EMAIL = "natalie0@nate.com";

export async function GET() {
  try {
    const session = await getServerSession(authOptions as any) as any;
    
    // 1. 세션이 없으면 에러를 내지 않고 0으로 초기화된 값을 줍니다 (로그인 튕김 방지)
    if (!session?.user?.email) {
      return NextResponse.json({ 
        ok: true, 
        totalItems: 0, 
        maxLimit: 5, 
        tier: "FREE", 
        isAdmin: false 
      });
    }

    const userEmail = session.user.email.trim().toLowerCase();
    
    // 2. DB에서 유저 정보 확인
    const user = await prisma.user.findUnique({
      where: { email: session.user.email } 
    });

    if (!user) {
      return NextResponse.json({ 
        ok: true, 
        totalItems: 0, 
        maxLimit: 5, 
        tier: "FREE", 
        isAdmin: false 
      });
    }

    // 3. 사용 중인 개수 세기 (스마트스토어 + 장소)
    const smartstoreCount = await prisma.smartstoreProduct.count({ where: { userId: user.id } });
    const placeCount = await prisma.place.count({ where: { userId: user.id } });
    const totalItems = smartstoreCount + placeCount; 

    // 4. 권한 및 제한(Limit) 결정
    const isAdmin = userEmail === ADMIN_EMAIL.toLowerCase();
    let maxLimit = 5; // 기본 FREE 유저는 5개
    
    if (isAdmin) {
      maxLimit = 9999; // 운영자 무제한
    } else if (user.tier === "PRO") {
      maxLimit = 50; // PRO 유저 100개
    }

    return NextResponse.json({
      ok: true,
      totalItems,
      maxLimit,
      isAdmin,
      tier: user.tier,
    });

  } catch (error) {
    console.error("Quota API Error:", error);
    // 서버 에러 시에도 기본값을 내려주어 UI가 깨지지 않게 합니다.
    return NextResponse.json({ 
      ok: true, 
      totalItems: 0, 
      maxLimit: 5, 
      tier: "FREE", 
      isAdmin: false 
    });
  }
}