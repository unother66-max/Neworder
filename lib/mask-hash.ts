/** IP 원문 대신 저장된 해시의 일부만 표시 */
export function maskedFingerprint(ipHash: string): string {
  if (!ipHash || ipHash.length < 8) return "···";
  return `${ipHash.slice(0, 6)}⋯${ipHash.slice(-4)}`;
}
