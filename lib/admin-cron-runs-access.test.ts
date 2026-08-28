import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  isAdminEmail: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/admin-emails", () => ({
  isAdminEmail: mocks.isAdminEmail,
}));
vi.mock("@/components/top-nav", () => ({ default: () => null }));

import AdminCronRunsLayout from "@/app/admin/cron-runs/layout";

describe("admin cron run history access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
  });

  it("redirects a signed-out visitor to login", async () => {
    mocks.getServerSession.mockResolvedValue(null);

    await expect(
      AdminCronRunsLayout({ children: "private cron history" })
    ).rejects.toThrow(
      "REDIRECT:/login?callbackUrl=%2Fadmin%2Fcron-runs"
    );
    expect(mocks.isAdminEmail).not.toHaveBeenCalled();
  });

  it("blocks a signed-in non-admin", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: "member@example.com" },
    });
    mocks.isAdminEmail.mockReturnValue(false);

    await expect(
      AdminCronRunsLayout({ children: "private cron history" })
    ).rejects.toThrow("REDIRECT:/");
    expect(mocks.isAdminEmail).toHaveBeenCalledWith("member@example.com");
  });

  it("renders for an administrator", async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { email: "admin@example.com" },
    });
    mocks.isAdminEmail.mockReturnValue(true);

    const result = await AdminCronRunsLayout({
      children: "private cron history",
    });

    expect(result).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
