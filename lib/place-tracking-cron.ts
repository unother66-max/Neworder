/**
 * 한 업체의 키워드가 연속으로 큐를 차지하지 않도록 업체마다 한 개씩 섞는다.
 * 함수 제한에 가까워져도 뒤에 등록된 업체가 매일 통째로 누락되는 일을 막는다.
 */
export function interleaveTrackedKeywordsByPlace<T extends { placeId: string }>(
  keywords: readonly T[]
): T[] {
  const queues = new Map<string, T[]>();

  for (const keyword of keywords) {
    const queue = queues.get(keyword.placeId);
    if (queue) queue.push(keyword);
    else queues.set(keyword.placeId, [keyword]);
  }

  const interleaved: T[] = [];
  let round = 0;

  while (interleaved.length < keywords.length) {
    for (const queue of queues.values()) {
      const keyword = queue[round];
      if (keyword) interleaved.push(keyword);
    }
    round += 1;
  }

  return interleaved;
}
