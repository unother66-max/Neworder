import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

/** 알림 카테고리 (확장 가능) */
export type AdminAlertType =
  | "place"
  | "review"
  | "smartstore"
  | "kakao"
  | "cron"
  | "system";

export type AdminAlertLevel = "info" | "warning" | "error" | "success";

export type CreateAdminAlertInput = {
  type: AdminAlertType;
  level: AdminAlertLevel;
  title: string;
  message: string;
  meta?: Record<string, unknown> | null;
};

/**
 * 알림 행 저장. 실패 시 콘솔만 남기고 호출측 플로우는 영향 없음.
 */
export async function createAdminAlert(
  input: CreateAdminAlertInput
): Promise<void> {
  try {
    await prisma.adminAlert.create({
      data: {
        type: input.type,
        level: input.level,
        title: input.title.trim().slice(0, 500),
        message: input.message.trim().slice(0, 20_000),
        ...(input.meta != null
          ? { meta: input.meta as Prisma.InputJsonValue }
          : {}),
      },
    });
  } catch (e) {
    console.error("[admin-alert/createAdminAlert]", {
      type: input.type,
      level: input.level,
      title: input.title,
      message: input.message.slice(0, 200),
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
