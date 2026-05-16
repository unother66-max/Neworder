# PostLabs Blog Ranking Big Data Design

## 목적

PostLabs의 `/blog-analysis`에서 보여줄 `전체 순위`와 `주제 순위`를 네이버 공식 순위처럼 오해되지 않게 분리하고, PostLabs에 누적된 분석 데이터만으로 자체 랭킹을 만들기 위한 설계 문서다.

이 랭킹은 블톡처럼 블로그 채널의 상대적 위치를 보여주는 것을 목표로 하지만, 네이버 공식 순위가 아니며 블톡, 블로그차트, 로그인/유료/비공개 데이터를 수집하지 않는다. 공식 API, 사용자가 직접 분석한 데이터, 공개 접근 가능한 블로그 정보만 사용한다.

## 기본 원칙

- `전체 순위`는 PostLabs에 누적된 전체 블로그 분석 데이터 안에서의 자체 순위다.
- `주제 순위`는 같은 `officialBlogTopic` 안에서의 자체 순위다.
- 데이터가 충분히 누적되기 전에는 순위를 억지로 계산하지 않고 `-` 또는 `데이터 누적 후 제공`으로 표시한다.
- 기존 `BlogAnalysisHistory`는 매 분석 시점의 일반 히스토리로 유지하고, 랭킹은 별도 스냅샷으로 분리한다.
- 네이버, 블로그차트, 블톡의 순위를 가져오거나 유사하게 위장하지 않는다.
- 크론은 대량 재분석을 작은 배치로 쪼개고, 실패한 블로그는 큐 상태와 에러만 남긴다.

## 현재 코드와 연결 지점

### BlogAnalysisHistory

현재 `prisma/schema.prisma`의 `BlogAnalysisHistory`는 사용자가 분석하거나 API가 실행될 때마다 남는 일반 분석 기록이다.

연결 가능한 필드:

- `blogId`, `blogName`, `nickname`, `profileImage`, `blogTopic`
- `visitorCount`, `postCount`, `subscriberCount`, `postingFrequency`
- `validKeywordCount`
- `level`, `grade`, `totalScore`
- `influenceScore`, `keywordInfluenceScore`, `contentInfluenceScore`
- `averageTitleLength`, `averageContentLength`, `averageImageCount`
- `titleLengthScore`, `contentLengthScore`, `imageCountScore`
- `analyzedAt`

랭킹 시스템에서는 이 테이블을 원천 로그로 보고, 최신 분석값을 `BlogProfile`과 `BlogMetricSnapshot`으로 정규화해 사용할 수 있다.

### BlogPostMetricSnapshot

현재 `BlogPostMetricSnapshot`은 최근 포스팅별 캐시다.

연결 가능한 필드:

- `blogId`, `postKey`, `postUrl`, `logNo`, `title`, `publishedAt`
- `wordCount`, `imageCount`, `videoCount`
- `commentCount`, `sympathyCount`, `shareCount`
- `potentialScore`, `reactivityScore`, `relatednessScore`
- `postLevel`, `exposureStatus`, `foundOnSearch`
- `analyzedAt`

랭킹 시스템에서는 포스팅 단위 평균값을 `BlogMetricSnapshot`의 콘텐츠 품질, 반응성, 최근 활동성 계산에 사용할 수 있다.

### 현재 계산 함수

현재 `lib/blog-score.ts`의 `computeBlogScore`는 임시 자체 기준으로 `totalScore`, `influenceScore`, `keywordInfluenceScore`, `contentInfluenceScore`, `level`, `grade`를 계산한다.

초기 랭킹 시스템에서는 기존 값을 그대로 재사용하되, `BlogMetricSnapshot.totalScore`에는 랭킹용 정규화 점수를 별도로 저장하는 방향이 안전하다.

### 현재 API 흐름

`app/api/blog-analysis/route.ts`는 다음 값을 이미 만들고 있다.

- `officialBlogTopic` 우선의 `blogTopic`
- `postCount`, `scrapCount`, `subscriberCount`
- `postingFrequency`
- `recentPosts`
- `representativeValidKeywords`
- `patternAnalysis`
- `blogScorePayload`

따라서 1차 구현에서는 분석 API 완료 시점에 `BlogProfile`과 `BlogMetricSnapshot`을 upsert하는 흐름을 추가할 수 있다.

## 데이터 수집 흐름

### 1. 사용자가 직접 분석한 블로그 저장

사용자가 `/blog-analysis`에서 블로그를 분석하면 즉시 `BlogProfile`을 upsert한다.

처리 순서:

1. `blogId` 정규화
2. 현재 분석 결과에서 프로필/주제/게시글 수/이웃 수/스크랩 수 추출
3. `BlogProfile` upsert
4. 현재 분석 점수와 포스팅 평균값으로 `BlogMetricSnapshot` 생성
5. 랭킹은 즉시 계산하지 않고 다음 주간 랭킹 배치에서 반영

### 2. 검색 API 기반 후보 블로그 수집

운영자가 정한 seed keyword 또는 공식 API 검색 결과에서 후보 블로그를 수집한다.

허용 소스:

- 네이버 Search API 등 공식 API
- 공개 접근 가능한 검색 결과 페이지
- 사용자가 직접 분석한 블로그의 공개 연결 정보

금지 소스:

- 블톡 데이터 파싱
- 블로그차트 데이터 무단 수집
- 로그인/유료/비공개 데이터 우회
- 과도한 크롤링

### 3. 중복 제거

`blogId`를 기준으로 중복을 제거한다.

중복 처리:

- 이미 `BlogProfile`에 있으면 `lastDiscoveredAt` 또는 `updatedAt`만 갱신
- 이미 큐에 `pending` 상태로 있으면 priority만 조정
- 최근 분석된 블로그는 `lastAnalyzedAt` 기준으로 재분석 보류

### 4. 후보와 분석 완료 상태 분리

`BlogDiscoveryQueue`는 아직 분석되지 않았거나 재분석 대기 중인 후보 상태를 관리한다.

`BlogProfile`은 최소 1회 이상 정규 분석이 완료된 블로그 프로필을 관리한다.

### 5. 재분석 기준

초기 기준:

- `lastAnalyzedAt`이 14일 이상 오래된 블로그
- 최근 포스팅이 많거나 priority가 높은 블로그
- 사용자 직접 분석 요청이 들어온 블로그
- 이전 분석 실패 후 backoff 시간이 지난 블로그

## 운영 스케줄

### 매일 새벽 2시: 신규 후보 수집

목표:

- 신규 후보 블로그 1,000개 수집
- seed keyword별 검색 결과에서 `blogId` 추출
- `BlogDiscoveryQueue`에 upsert

예상 route:

- `GET /api/cron/blog-discovery`

### 매일 새벽 3시: 오래된 분석 데이터 갱신

목표:

- 오래된 블로그 500~2,000개 재분석
- 실패 시 전체 크론 실패로 만들지 않고 큐 상태만 갱신
- 분석 성공 시 `BlogProfile`, `BlogMetricSnapshot` 업데이트

예상 route:

- `GET /api/cron/blog-profile-refresh`

### 매주 월요일 새벽: 랭킹 스냅샷 계산

목표:

- 최신 `BlogMetricSnapshot` 기준으로 전체 순위 계산
- `officialBlogTopic`별 주제 순위 계산
- `BlogRankSnapshot` 저장

예상 route:

- `GET /api/cron/blog-rank-snapshot`

## Prisma 모델 초안

아직 `prisma/schema.prisma`에 반영하지 않는다. 아래는 설계 초안이다.

### BlogProfile

블로그 단위의 최신 프로필 상태를 저장한다.

| 필드 | 타입 후보 | Nullable | 인덱스/제약 후보 | 설명 |
| --- | --- | --- | --- | --- |
| id | String | No | `@id @default(cuid())` | 내부 ID |
| blogId | String | No | `@unique` | 네이버 블로그 ID |
| blogUrl | String | Yes | `@db.Text` | 블로그 URL |
| blogName | String | Yes |  | 블로그명 |
| nickname | String | Yes |  | 닉네임 |
| profileImage | String | Yes | `@db.Text` | 프로필 이미지 |
| officialBlogTopic | String | Yes | `@@index([officialBlogTopic])` | 네이버 공식 블로그 주제 |
| postCount | Int | Yes |  | 게시글 수 |
| scrapCount | Int | Yes |  | 글 스크랩 수 |
| neighborCount | Int | Yes |  | 이웃 수 |
| postingFrequency | Float | Yes |  | 최근 작성 빈도 |
| lastAnalyzedAt | DateTime | Yes | `@@index([lastAnalyzedAt])` | 마지막 분석 시각 |
| lastDiscoveredAt | DateTime | Yes |  | 마지막 후보 발견 시각 |
| status | String | No | `@@index([status])` | active, pending, failed 등 |
| createdAt | DateTime | No |  | 생성 시각 |
| updatedAt | DateTime | No |  | 갱신 시각 |

upsert 기준:

- `blogId`

조회 패턴:

- 오래된 분석 대상 조회: `lastAnalyzedAt asc`
- 주제별 후보 조회: `officialBlogTopic`
- 특정 블로그 프로필 조회: `blogId`

### BlogMetricSnapshot

랭킹 계산에 사용할 블로그 단위 메트릭 스냅샷을 저장한다.

| 필드 | 타입 후보 | Nullable | 인덱스/제약 후보 | 설명 |
| --- | --- | --- | --- | --- |
| id | String | No | `@id @default(cuid())` | 내부 ID |
| blogId | String | No | `@@index([blogId])` | 블로그 ID |
| influenceScore | Float | Yes |  | 영향력 지수 |
| keywordInfluenceScore | Float | Yes |  | 키워드 영향력 |
| contentInfluenceScore | Float | Yes |  | 콘텐츠 영향력 |
| validKeywordCount | Int | Yes |  | 대표 유효키워드 수 |
| recentActivityScore | Float | Yes |  | 최근 활동성 점수 |
| contentQualityScore | Float | Yes |  | 콘텐츠 품질 점수 |
| reactionScore | Float | Yes |  | 반응성 점수 |
| avgWordCount | Float | Yes |  | 최근 포스팅 평균 글자 수 |
| avgImageCount | Float | Yes |  | 최근 포스팅 평균 이미지 수 |
| avgVideoCount | Float | Yes |  | 최근 포스팅 평균 동영상 수 |
| avgCommentCount | Float | Yes |  | 평균 댓글 수 |
| avgSympathyCount | Float | Yes |  | 평균 공감/하트 수 |
| avgShareCount | Float | Yes |  | 평균 공유 수 |
| avgPotentialScore | Float | Yes |  | 평균 가능성 점수 |
| avgRelatednessScore | Float | Yes |  | 평균 관련성 점수 |
| avgReactivityScore | Float | Yes |  | 평균 반응성 점수 |
| totalScore | Float | No | `@@index([totalScore])` | 랭킹용 최종 점수 |
| analyzedAt | DateTime | No | `@@index([analyzedAt])` | 분석 시각 |
| createdAt | DateTime | No |  | 생성 시각 |

인덱스 후보:

- `@@index([blogId, analyzedAt])`
- `@@index([totalScore])`
- `@@index([analyzedAt])`

조회 패턴:

- 블로그별 최신 메트릭: `blogId + analyzedAt desc`
- 랭킹 계산 대상: 기간 내 최신 `BlogMetricSnapshot`

### BlogRankSnapshot

주간 랭킹 계산 결과를 저장한다.

| 필드 | 타입 후보 | Nullable | 인덱스/제약 후보 | 설명 |
| --- | --- | --- | --- | --- |
| id | String | No | `@id @default(cuid())` | 내부 ID |
| blogId | String | No | `@@index([blogId])` | 블로그 ID |
| overallRank | Int | Yes | `@@index([overallRank])` | PostLabs 기준 전체 순위 |
| topicRank | Int | Yes | `@@index([officialBlogTopic, topicRank])` | PostLabs 기준 주제 순위 |
| officialBlogTopic | String | Yes | `@@index([officialBlogTopic])` | 공식 블로그 주제 |
| totalBlogsCount | Int | No |  | 전체 랭킹 모집단 수 |
| topicBlogsCount | Int | Yes |  | 주제 랭킹 모집단 수 |
| totalScore | Float | No |  | 랭킹 계산에 사용한 점수 |
| rankSource | String | No |  | `postlabs` |
| rankSourceLabel | String | No |  | `PostLabs 기준` |
| calculatedAt | DateTime | No | `@@index([calculatedAt])` | 계산 시각 |
| rankPeriod | String | No |  | 예: `2026-W20` |
| createdAt | DateTime | No |  | 생성 시각 |

unique 후보:

- `@@unique([blogId, rankPeriod])`
- 또는 주간 재계산을 여러 번 허용하려면 `@@unique([blogId, calculatedAt])`

조회 패턴:

- 상세 화면 최신 순위: `blogId + calculatedAt desc`
- 전체 차트: `rankPeriod + overallRank`
- 주제 차트: `rankPeriod + officialBlogTopic + topicRank`

### BlogDiscoveryQueue

후보 블로그 수집과 재분석 대기열을 관리한다.

| 필드 | 타입 후보 | Nullable | 인덱스/제약 후보 | 설명 |
| --- | --- | --- | --- | --- |
| id | String | No | `@id @default(cuid())` | 내부 ID |
| blogId | String | No | `@@index([blogId])` | 블로그 ID |
| blogUrl | String | Yes | `@db.Text` | 후보 URL |
| source | String | No | `@@index([source])` | user, search_api, seed_keyword, cron 등 |
| seedKeyword | String | Yes | `@@index([seedKeyword])` | 후보 수집 키워드 |
| officialBlogTopic | String | Yes | `@@index([officialBlogTopic])` | 수집 시 확인된 공식 주제 |
| status | String | No | `@@index([status])` | pending, running, succeeded, failed, skipped |
| priority | Int | No | `@@index([priority])` | 처리 우선순위 |
| discoveredAt | DateTime | No |  | 발견 시각 |
| lastTriedAt | DateTime | Yes | `@@index([lastTriedAt])` | 마지막 분석 시도 |
| tryCount | Int | No |  | 시도 횟수 |
| errorMessage | String | Yes | `@db.Text` | 마지막 실패 이유 |
| createdAt | DateTime | No |  | 생성 시각 |
| updatedAt | DateTime | No |  | 갱신 시각 |

unique 후보:

- `@@unique([blogId, source, seedKeyword])`
- 운영 단순화를 우선하면 `@@unique([blogId])`

조회 패턴:

- 처리 대기열: `status=pending order by priority desc, discoveredAt asc`
- 실패 재시도: `status=failed and lastTriedAt < backoff`
- 특정 source 성과 확인: `source + status`

## totalScore 계산 기준 초안

초기 랭킹 점수는 0~100 범위로 정규화한다.

권장 초안:

| 구성 요소 | 가중치 | 현재 연결 후보 |
| --- | ---: | --- |
| 영향력 지수 | 30% | `influenceScore`, `keywordInfluenceScore`, `contentInfluenceScore` |
| 유효 키워드 수 | 25% | `representativeValidKeywords.length`, `validKeywordCount` |
| 최근 활동성 | 20% | `postingFrequency`, 최근 글 수, 최근 발행일 |
| 콘텐츠 품질 | 15% | `potentialScore`, `relatednessScore`, 패턴 점수, 평균 글자/이미지 수 |
| 반응성 | 10% | `reactivityScore`, `commentCount`, `sympathyCount`, `shareCount` |

### 점수 정규화 방식

초기에는 절대 기준과 percentile 기준을 섞어 쓴다.

- `influenceScore`: 기존 `computeBlogScore` 결과를 우선 사용
- `validKeywordCount`: 전체 분포 percentile 또는 log scale 사용
- `recentActivityScore`: 최근 7~14일 작성 빈도와 마지막 발행일 기반
- `contentQualityScore`: 최근 포스팅의 `potentialScore`, `relatednessScore`, 패턴 평균 기반
- `reactionScore`: 댓글/공감/공유 평균을 topic별 분포로 정규화

계산 예:

```ts
totalScore =
  influenceScore * 0.30 +
  validKeywordScore * 0.25 +
  recentActivityScore * 0.20 +
  contentQualityScore * 0.15 +
  reactionScore * 0.10
```

모든 하위 점수와 최종 점수는 0~100 사이로 clamp한다.

### 현재 값과의 연결

- `influenceScore`: `computeBlogScore`의 결과를 1차 사용
- `keywordInfluenceScore`: 키워드 영향력 참고값
- `contentInfluenceScore`: 콘텐츠 영향력 참고값
- `potentialScore`: 최근 포스팅 검색 적합 구조
- `relatednessScore`: 제목/본문 정합성
- `reactivityScore`: 현재는 값이 없으면 제외하거나 중립값 처리
- `commentCount`, `sympathyCount`, `shareCount`: 반응성 보조값
- `postingFrequency`: 최근 활동성 핵심값

## 순위 계산 방식

### overallRank

전체 순위는 최신 `BlogMetricSnapshot.totalScore` 기준으로 전체 블로그를 정렬해 계산한다.

정렬 기준:

1. `totalScore desc`
2. `recentActivityScore desc`
3. `validKeywordCount desc`
4. `analyzedAt desc`
5. `blogId asc`

동점 처리는 같은 순위를 부여할지, 안정적인 정렬로 순위를 나눌지 운영 정책에서 결정한다. 초기 구현은 안정적인 단일 순위가 UI와 저장에 단순하다.

### topicRank

주제 순위는 `officialBlogTopic`이 같은 블로그끼리 `totalScore` 기준으로 정렬한다.

처리 기준:

- `officialBlogTopic`이 없으면 `미분류` 그룹으로 보관
- `미분류`는 UI에서 주제 순위로 노출하지 않거나 별도 표시
- 특정 주제의 표본 수가 너무 적으면 `데이터 누적 후 제공`으로 표시

권장 최소 표본 기준:

- 전체 순위: 최소 분석 블로그 1,000개 이상부터 공개
- 주제 순위: 해당 주제 분석 블로그 100개 이상부터 공개

이 기준은 초기 운영 데이터에 따라 낮추거나 높일 수 있다.

## Cron/API 구조 제안

### `/api/cron/blog-discovery`

역할:

- seed keyword 목록 기반 후보 블로그 수집
- 중복 blogId 제거
- `BlogDiscoveryQueue` upsert

입력 후보:

- 내부 seed keyword config
- 공식 블로그 주제별 seed keyword
- 최근 사용자 분석 키워드

출력:

- discovered count
- inserted count
- duplicated count
- failed seed list

### `/api/cron/blog-profile-refresh`

역할:

- `BlogDiscoveryQueue`와 `BlogProfile.lastAnalyzedAt` 기준으로 재분석 대상 선정
- 하루 500~2,000개 범위에서 배치 처리
- 분석 성공 시 `BlogProfile`, `BlogMetricSnapshot` 저장
- 실패 시 queue status와 error만 저장

주의:

- Vercel Function 시간 제한을 고려해 batch size를 작게 둔다.
- 긴 작업은 여러 호출로 나누거나 큐 기반 워커로 분리한다.
- 개별 블로그 실패가 전체 job 실패가 되지 않게 한다.

### `/api/cron/blog-rank-snapshot`

역할:

- 최신 `BlogMetricSnapshot`을 blogId별로 1개씩 선택
- 전체 순위 계산
- `officialBlogTopic`별 주제 순위 계산
- `BlogRankSnapshot` 저장

권장 실행:

- 매주 월요일 새벽
- 필요하면 관리자 수동 재계산 버튼 또는 route 추가

### `/api/blog-analysis/rank-status`

역할:

- 특정 `blogId`의 최신 PostLabs 랭킹 상태 조회
- 기존 `/api/blog-analysis` 응답 확장으로 대체 가능

응답 후보:

```ts
{
  blogId: string;
  postlabsOverallRank: number | null;
  postlabsTopicRank: number | null;
  officialBlogTopic: string | null;
  totalBlogsCount: number | null;
  topicBlogsCount: number | null;
  rankSource: "postlabs";
  rankSourceLabel: "PostLabs 기준";
  calculatedAt: string | null;
  message?: string;
}
```

## UI 표시 문구

### 순위가 있을 때

라벨:

- `PostLabs 기준 전체 순위`
- `PostLabs 기준 주제 순위`

설명:

> PostLabs에 누적 분석된 블로그 데이터를 기준으로 유효 키워드, 영향력 지수, 최근 활동성 등을 종합해 산정한 자체 순위입니다. 네이버 공식 순위가 아닙니다.

표시:

- `전체 순위: 302,522위`
- `주제 순위: 16,285위`
- `기준: PostLabs`

### 데이터가 부족할 때

표시:

- `전체 순위: -`
- `주제 순위: -`

설명:

> 데이터가 충분히 누적되면 PostLabs 자체 기준 순위를 제공합니다.

또는:

> PostLabs 자체 기준 순위입니다. 네이버 공식 순위가 아닙니다.

## 단계별 구현 계획

### 1단계: 설계 문서 작성

- 이 문서로 모델, 수집 흐름, 계산 기준, UI 문구를 고정한다.
- 기존 `BlogAnalysisHistory`, `BlogPostMetricSnapshot`, `computeBlogScore`, `route.ts` 연결 지점을 확인한다.

### 2단계: Prisma 모델 추가

- `BlogProfile`
- `BlogMetricSnapshot`
- `BlogRankSnapshot`
- `BlogDiscoveryQueue`

migration 생성 전에는 필드 nullable 기준과 unique/index 기준을 다시 확정한다.

### 3단계: 사용자 분석 블로그 저장

- `/api/blog-analysis` 완료 시점에 `BlogProfile` upsert
- 같은 분석 결과로 `BlogMetricSnapshot` 저장
- 기존 `BlogAnalysisHistory` 저장 흐름은 유지

### 4단계: PostLabs 기준 순위 계산 API 추가

- 최신 `BlogMetricSnapshot` 기준 전체 순위 계산
- `officialBlogTopic`별 주제 순위 계산
- `BlogRankSnapshot` 저장
- 순위 모집단 수를 함께 저장

### 5단계: 오래된 블로그 재분석 크론

- `BlogProfile.lastAnalyzedAt` 기준 대상 선정
- 하루 500~2,000개 범위로 제한
- 실패/차단/타임아웃은 queue status로 관리

### 6단계: 검색 API 기반 후보 블로그 수집

- 공식 API 또는 공개 검색 결과 기반으로 후보 blogId 수집
- `BlogDiscoveryQueue`에 누적
- 주제별 seed keyword를 운영 config로 관리

### 7단계: UI에서 PostLabs 기준 순위 표시

- 최신 `BlogRankSnapshot`이 있으면 순위 표시
- 없으면 `-` 또는 `데이터 누적 후 제공`
- 툴팁/설명에서 네이버 공식 순위가 아님을 명확히 표시

## 운영 리스크와 보류 항목

- 표본 수가 적을 때 순위가 자주 흔들릴 수 있으므로 공개 기준을 둔다.
- 공식 주제가 없는 블로그는 주제 순위에서 제외하거나 `미분류`로 묶는다.
- 반응성 점수는 실제 검색 노출 데이터가 들어오기 전까지 보수적으로 계산한다.
- BlogKeywordExposureSnapshot이 도입되면 유효 키워드와 키워드 영향력 계산을 다시 보정한다.
- 초기 랭킹은 `PostLabs 베타 기준`으로 노출하는 것이 안전하다.

## 하지 않을 것

- 네이버 공식 순위처럼 표시하지 않는다.
- 블톡 순위를 가져오지 않는다.
- 블로그차트 데이터를 무단 수집하지 않는다.
- 로그인/유료/비공개 데이터 접근을 우회하지 않는다.
- 이 문서 단계에서는 Prisma schema, migration, API, UI 코드를 수정하지 않는다.
