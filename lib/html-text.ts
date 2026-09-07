const HTML_TEXT_ENTITIES = [
  [/&(?:amp|#0*38|#x0*26);/gi, "&"],
  [/&(?:quot|#0*34|#x0*22);/gi, '"'],
  [/&(?:apos|#0*39|#x0*27);/gi, "'"],
  [/&(?:lt|#0*60|#x0*3c);/gi, "<"],
  [/&(?:gt|#0*62|#x0*3e);/gi, ">"],
  [/&(?:nbsp|#0*160|#x0*a0);/gi, " "],
] as const;

export function decodeHtmlText(value: string): string {
  let decoded = value;

  // 네이버 응답에 이중 인코딩된 문자열이 섞여도 화면에는 한 번만 보이게 한다.
  for (let pass = 0; pass < 2; pass += 1) {
    const before = decoded;
    for (const [entity, replacement] of HTML_TEXT_ENTITIES) {
      decoded = decoded.replace(entity, replacement);
    }
    if (decoded === before) break;
  }

  return decoded;
}
