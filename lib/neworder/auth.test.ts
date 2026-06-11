import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    newOrderOperator: {
      findUnique: mocks.findUnique,
    },
  },
}));

import { getNewOrderAccess } from "@/lib/neworder/auth";

describe("getNewOrderAccess", () => {
  beforeEach(() => {
    mocks.getServerSession.mockReset();
    mocks.findUnique.mockReset();
  });

  it.each(["STORE_MANAGER", "ADMIN", "SUPERADMIN"] as const)(
    "활성 %s 운영자에게 동일하게 접근을 허용한다",
    async (role) => {
      mocks.getServerSession.mockResolvedValue({
        user: {
          id: "user-1",
          email: "operator@example.com",
          name: "운영자",
        },
      });
      mocks.findUnique.mockResolvedValue({ role, isActive: true });

      await expect(getNewOrderAccess()).resolves.toEqual({
        userId: "user-1",
        email: "operator@example.com",
        name: "운영자",
        role,
      });
    }
  );

  it("비활성 운영자는 접근을 허용하지 않는다", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "operator@example.com",
        name: "운영자",
      },
    });
    mocks.findUnique.mockResolvedValue({
      role: "SUPERADMIN",
      isActive: false,
    });

    await expect(getNewOrderAccess()).resolves.toBeNull();
  });

  it("운영자 레코드가 없으면 기존 관리자 이메일이어도 접근을 허용하지 않는다", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: {
        id: "user-1",
        email: "natalie0@nate.com",
        name: "관리자",
      },
    });
    mocks.findUnique.mockResolvedValue(null);

    await expect(getNewOrderAccess()).resolves.toBeNull();
  });

  it("비로그인 사용자는 DB 조회 없이 접근을 허용하지 않는다", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    await expect(getNewOrderAccess()).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
