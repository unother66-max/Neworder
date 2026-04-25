type DelayType = "save" | "ranking";

export class SmartstoreNaverRateLimitedError extends Error {
  readonly status = 429 as const;
  constructor(message = "네이버 요청이 일시적으로 제한(HTTP 429)되었습니다.") {
    super(message);
    this.name = "SmartstoreNaverRateLimitedError";
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function randInt(min: number, max: number) {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  return a + Math.floor(Math.random() * (b - a + 1));
}

export async function randomSmartstoreDelay(type: DelayType) {
  const ms = type === "save" ? randInt(1500, 3000) : randInt(2500, 5000);
  console.log(`[Naver-Bot-Shield] 보안을 위해 ${ms}ms 대기 후 요청을 진행합니다...`, {
    type,
  });
  await sleep(ms);
}

export async function cooldownOn429() {
  const ms = 10_000;
  console.log("[Naver-Bot-Shield] 보안 차단 감지: 10초간 긴급 휴식에 들어갑니다", {
    cooldownMs: ms,
  });
  await sleep(ms);
}

export function isSmartstoreNaverRateLimitedError(
  e: unknown
): e is SmartstoreNaverRateLimitedError {
  return e instanceof SmartstoreNaverRateLimitedError;
}
