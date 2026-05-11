/** 관리자용 대략적 단말/브라우저 문자열 (민감정보 최소화) */
export function snippetFromUserAgent(raw: string | null | undefined, maxLen = 256): string {
  const s = (raw ?? "").trim().slice(0, maxLen);
  return s || "unknown";
}

export function uaDeviceBrowserHint(snippet: string | null | undefined): string {
  const s = (snippet ?? "").toLowerCase();
  if (!s || s === "unknown") return "알 수 없음";

  const device = /iphone|ipad|ipod/.test(s)
    ? "iOS"
    : /android/.test(s)
      ? "안드로이드"
      : /mobile|webos/.test(s)
        ? "모바일"
        : "PC";

  let browser = "";
  if (s.includes("kakaotalk")) browser = "KakaoTalk";
  else if (s.includes("naver")) browser = "네이버앱인앱";
  else if (s.includes("instagram")) browser = "Instagram";
  else if (s.includes("edg/")) browser = "Edge";
  else if (s.includes("whale")) browser = "Whale";
  else if (s.includes("chrome") && !s.includes("edg")) browser = "Chrome";
  else if (s.includes("safari") && !s.includes("chrome")) browser = "Safari";
  else if (s.includes("firefox")) browser = "Firefox";
  else browser = "기타";

  return `${device} · ${browser}`;
}
