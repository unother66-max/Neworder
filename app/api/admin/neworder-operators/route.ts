import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/require-admin-api";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES = new Set(["STORE_MANAGER", "ADMIN", "SUPERADMIN"]);

function error(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function text(value: unknown, max = 300): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET() {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  const operators = await prisma.newOrderOperator.findMany({
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    include: {
      user: {
        select: { id: true, email: true, name: true, lastVisitAt: true },
      },
    },
  });

  return NextResponse.json({ ok: true, operators });
}

export async function POST(request: Request) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;
  const actorId = admin.session.user.id?.trim();
  if (!actorId) return error("관리자 사용자 ID를 확인할 수 없습니다.", 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return error("요청 형식이 올바르지 않습니다.");
  }

  const action = text(body.action, 50);
  if (action === "register") {
    const email = text(body.email).toLowerCase();
    const role = text(body.role, 30);
    if (!email || !ROLES.has(role)) {
      return error("이메일과 표시 역할을 확인해 주세요.");
    }
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });
    if (!user) {
      return error("해당 이메일로 로그인한 PostLabs 사용자를 찾을 수 없습니다.", 404);
    }

    await prisma.newOrderOperator.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        role: role as "STORE_MANAGER" | "ADMIN" | "SUPERADMIN",
        isActive: true,
        createdBy: actorId,
        updatedBy: actorId,
      },
      update: {
        role: role as "STORE_MANAGER" | "ADMIN" | "SUPERADMIN",
        isActive: true,
        updatedBy: actorId,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "update") {
    const id = text(body.id, 100);
    const role = text(body.role, 30);
    if (!id || !ROLES.has(role) || typeof body.isActive !== "boolean") {
      return error("운영자 정보를 확인해 주세요.");
    }
    await prisma.newOrderOperator.update({
      where: { id },
      data: {
        role: role as "STORE_MANAGER" | "ADMIN" | "SUPERADMIN",
        isActive: body.isActive,
        updatedBy: actorId,
      },
    });
    return NextResponse.json({ ok: true });
  }

  return error("지원하지 않는 작업입니다.");
}
