import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const root = process.cwd();
const envPath = resolve(root, ".env");
const envLocalPath = resolve(root, ".env.local");
if (existsSync(envPath)) config({ path: envPath });
if (existsSync(envLocalPath)) config({ path: envLocalPath, override: true });

const allowedRoles = new Set(["STORE_MANAGER", "ADMIN", "SUPERADMIN"]);
const role = process.env.NEW_ORDER_INITIAL_OPERATOR_ROLE?.trim() || "SUPERADMIN";
if (!allowedRoles.has(role)) {
  throw new Error(
    "NEW_ORDER_INITIAL_OPERATOR_ROLE은 STORE_MANAGER, ADMIN, SUPERADMIN 중 하나여야 합니다."
  );
}

const emails = (process.env.NEW_ORDER_INITIAL_OPERATOR_EMAILS || "")
  .split(/[,;]+/)
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

if (emails.length === 0) {
  throw new Error(
    "NEW_ORDER_INITIAL_OPERATOR_EMAILS에 최초 운영자 이메일을 설정하세요."
  );
}

const prisma = new PrismaClient();

try {
  for (const email of emails) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true, name: true },
    });
    if (!user) {
      throw new Error(
        `${email}: PostLabs User가 없습니다. 해당 계정으로 먼저 로그인한 뒤 다시 실행하세요.`
      );
    }

    await prisma.newOrderOperator.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        role,
        isActive: true,
        createdBy: user.id,
        updatedBy: user.id,
      },
      update: {
        role,
        isActive: true,
        updatedBy: user.id,
      },
    });
    console.log(
      `[neworder seed] ${user.email || email} (${user.name || "이름 없음"}) -> ${role}`
    );
  }
} finally {
  await prisma.$disconnect();
}
