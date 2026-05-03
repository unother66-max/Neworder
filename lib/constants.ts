// lib/constants.ts

// 🚨 운영자 이메일 (여기에 등록된 이메일은 등급 상관없이 무제한)
export const ADMIN_EMAIL = "natalie0@nate.com";

// 🚨 등급별 제한 개수 설정
export const TIER_LIMITS = {
  FREE: 10,   // 일반 유저: 10개
  PRO: 30,    // PRO 유저: 30개
  ADMIN: 9999 // 운영자: 사실상 무제한
};

/**
 * 유저의 이메일과 등급(tier)을 받아 현재 가질 수 있는 최대 한도를 반환합니다.
 */
export function getLimit(tier: string | null | undefined, email: string | null | undefined) {
  const sessionEmail = email?.trim().toLowerCase() || "";
  
  // 1. 운영자 체크 (이메일 우선순위 1등)
  if (sessionEmail === ADMIN_EMAIL.toLowerCase()) {
    return TIER_LIMITS.ADMIN;
  }
  
  // 2. 등급별 체크 (PRO면 30, 아니면 10)
  if (tier === "PRO") {
    return TIER_LIMITS.PRO;
  }
  
  // 3. 기본값 (FREE)
  return TIER_LIMITS.FREE;
}