# Blog Analysis Metrics Design

## Purpose

This document fixes the product and data definitions for `/blog-analysis` metrics before further score tuning or schema work.

The goal is to separate temporary analysis history from official influence snapshots, post-level metric caches, and keyword exposure caches. Score weights should not be tuned against only the current local data. They should be applied after the underlying data definitions are stable.

## Current Principles

- Keep the existing `BlogAnalysisHistory` flow for analysis history and charts.
- Treat the current influence score, blog level, operation grade, and rank values as beta metrics until official snapshot data exists.
- Keep `validKeywords` as the broad keyword pool.
- Use stricter representative keyword logic for the current top-card keyword count.
- Do not use expensive real search exposure checks in the first data phase.
- Do not change Prisma schema until metric definitions and snapshot responsibilities are agreed.

## Data Model Roles

### BlogAnalysisHistory

`BlogAnalysisHistory` is the ordinary analysis/history record.

It should be created when a user runs an analysis or when a scheduled lightweight analysis runs. It is suited for recent trend charts and day-by-day changes.

Primary responsibilities:

- Store per-analysis or daily values.
- Store visitor count, post count, subscriber count, posting frequency.
- Store representative valid keyword count for recent analysis.
- Store beta score values while official influence snapshots are not yet available.
- Support charts for rank, visitor, score, and keyword trends.

It should not become the only source for official biweekly influence rank, post-level cache, or keyword exposure cache.

### BlogInfluenceSnapshot

`BlogInfluenceSnapshot` is the official biweekly influence snapshot.

It should represent stable blog-level status that updates on a defined cadence, such as every two weeks. This model should become the source of truth for official influence score, blog level, operation grade, total rank, category rank, and official valid keyword count.

Primary purpose:

- Keep official influence metrics separate from realtime analysis.
- Make blog level, operation grade, rank, and official valid keyword count stable for a snapshot period.
- Support rank charts and comparison cards without recalculating expensive metrics on every page load.
- Provide a controlled place to apply official formulas after keyword exposure and post metric caches exist.

Suggested fields:

| Field | Meaning | Notes |
| --- | --- | --- |
| `blogId` | Naver blog id | Required lookup key |
| `topic` / `category` | Blog category or inferred topic | Used for category rank and averages |
| `influenceScore` | Official total influence score | 0-100, biweekly snapshot |
| `keywordInfluenceScore` | Official keyword influence score | Based on search exposure strength |
| `contentInfluenceScore` | Official content influence score | Based on post metric cache and content quality |
| `blogLevel` | Long-term accumulated blog level | Slower-moving than operation grade |
| `operationGrade` | Current operation grade | More sensitive to recent search/content performance |
| `totalRank` | Service-wide rank | Relative to snapshot population |
| `categoryRank` | Topic/category rank | Relative to same category/topic |
| `validKeywordCount` | Official valid keyword count | Eventually from `searchExposureKeywords.totalCount` |
| `visitorAvg` | Average visitor count for snapshot window | Prefer 14-day average if available |
| `subscriberCount` | Subscriber/neighbor count | Snapshot copy |
| `postCount` | Total post count | Snapshot copy |
| `postingFrequency` | Recent posting frequency | Snapshot-window value |
| `snapshotDate` | Logical snapshot date | Usually period start or period label date |
| `analyzedAt` | Calculation completion time | Actual run timestamp |
| `createdAt` | Row creation time | Standard metadata |
| `updatedAt` | Row update time | Standard metadata |

Update principle:

- Snapshot values should be calculated from enough keyword exposure, content, activity, and historical data.
- Blog level should represent accumulated influence and durability.
- Operation grade should represent current operating quality and market value.
- Ranking should be relative to the service dataset at the snapshot time.
- The normal update cadence should be every two weeks.
- If a snapshot run fails, the previous successful snapshot should remain visible.
- Partial failures should not erase official rank, level, grade, or valid keyword values.
- Stronger refresh modes can be introduced later for paid plans or manually watched blogs, but the official public metric should still keep a clear snapshot period.

Difference from `BlogAnalysisHistory`:

- `BlogAnalysisHistory` is event/daily history for user analysis, cron updates, and charts.
- `BlogInfluenceSnapshot` is the official biweekly metric state.
- `BlogAnalysisHistory` can contain beta or recent values.
- `BlogInfluenceSnapshot` should contain stable official values after enough collection data exists.

Blog level vs operation grade:

- `blogLevel`: accumulated influence, long-term keyword holding power, blog-tab durability, category focus, and historical stability.
- `operationGrade`: current market value, recent integrated/smartblock/blog exposure, content freshness, current posting flow, and recent content performance.
- Blog level should move slowly.
- Operation grade can react more quickly to recent quality or exposure changes.

Influence score input candidates:

- Official search-exposed valid keyword count.
- Keyword exposure strength by surface and rank.
- Content influence from cached post metrics.
- Visitor average and subscriber count.
- Post count and posting frequency.
- Total rank and category rank percentile.
- Historical consistency from previous snapshots.

Keyword influence input candidates:

- `BlogKeywordExposureSnapshot` rows.
- `keywordType`, `exposureType`, `integratedExposeBlock`, `smartBlockAmount`, `blogRank`, `popularRank`.
- `searchAmount` or monthly search volume.
- `contentAmountRatio` or keyword-level content competition signal.
- Matched post URL/logNo and matched content score.
- Keyword durability across multiple snapshots.

Content influence input candidates:

- `BlogPostMetricSnapshot` rows.
- `wordCount`, `imageCount`, `videoCount`.
- `titleScore`, `contentLengthScore`, `imageScore`.
- `potentialScore`, `reactivityScore`, `relatednessScore`.
- Recent publishing consistency.
- Average pattern comparison against category.
- Post freshness and reaction signals.

First implementation calculation:

- Can create beta snapshots from existing data only.
- Use representative keyword count until `searchExposureKeywords` exists.
- Use SearchAD volume and keyword title/body matches only as proxy data.
- Use mobile HTML post metrics where available.
- Keep UI language clear that these values are not the final exposure-backed official metrics.

Official calculation after exposure cache:

- Use `BlogKeywordExposureSnapshot` for keyword influence and official valid keyword count.
- Use `BlogPostMetricSnapshot` for content influence and post-level derived signals.
- Use the 2-week snapshot population for total and category ranks.
- Keep formulas stable within a snapshot period.

UI usage:

- Top profile card should prefer `BlogInfluenceSnapshot.blogLevel`, `operationGrade`, and official influence score when available.
- Latest rank card should prefer `BlogInfluenceSnapshot.validKeywordCount`, `totalRank`, and `categoryRank` when available.
- Rank charts can show `BlogInfluenceSnapshot` for official 2-week points and `BlogAnalysisHistory` for recent/beta daily movement.
- Average comparison cards should prefer snapshot/category aggregates when available.
- When no official snapshot exists, current beta history values can remain as fallback.

Not in this stage:

- No Prisma schema creation.
- No migration.
- No API, UI, or cron connection.
- No actual Naver search exposure implementation.
- No Playwright usage.

### BlogPostMetricSnapshot

`BlogPostMetricSnapshot` caches metrics for individual recent posts.

It should make the recent posting table fast and consistent, and later support post-level score explanations. The main purpose is to avoid recalculating post level, potential, reaction, relatedness, and exposure status on every page load.

The cache should be keyed by a stable post identity such as `blogId + logNo` or `postUrl`.

Suggested fields:

| Field | Meaning | Phase 1 without Playwright | Phase 2 exposure check | Notes |
| --- | --- | --- | --- | --- |
| `blogId` | Naver blog id | Yes | No | Required lookup key |
| `postUrl` | Canonical post URL | Yes | No | Use RSS URL or normalized mobile/PC URL |
| `logNo` | Naver post id extracted from URL | Yes | No | Prefer unique index with `blogId` |
| `title` | Post title | Yes | No | RSS title is enough initially |
| `publishedAt` | Published date | Yes | No | From RSS `pubDate` |
| `thumbnail` | Post thumbnail | Yes | No | From RSS media or description |
| `wordCount` | Body text length | Yes | No | Requires mobile HTML fetch |
| `imageCount` | Image count in body | Yes | No | Requires mobile HTML fetch |
| `videoCount` | Video count in body | Partial | No | Can be approximated from HTML markers |
| `commentCount` | Comment count | Partial | Maybe | May require dynamic/private data |
| `sympathyCount` | Sympathy/like count | Partial | Maybe | May require dynamic/private data |
| `shareCount` | Share count | No | Maybe | Usually not reliable from basic HTML |
| `titleScore` | Title quality score | Yes | No | Length, keyword, clarity heuristic |
| `contentLengthScore` | Body length quality score | Yes | No | Based on body length range |
| `imageScore` | Image usage score | Yes | No | Based on image count range |
| `potentialScore` | Search potential score | Yes | No | Derived from structure and keyword fit |
| `reactionScore` | Reaction/search activation score | Partial | Yes | Phase 1 can use available reactions only |
| `relatednessScore` | Title/body/topic alignment score | Yes | No | Needs body text and representative keywords |
| `postLevel` | Post strength level | Partial | Yes | Phase 1 draft, Phase 2 exposure-adjusted |
| `exposureStatus` | Exposure state | No | Yes | Needs search exposure checks for final status |
| `analyzedAt` | Metric calculation time | Yes | No | Used for cache freshness |
| `createdAt` | Row creation time | Yes | No | Standard metadata |
| `updatedAt` | Row update time | Yes | No | Standard metadata |

Metric intent:

- `potentialScore`: search potential from title, body structure, keyword placement, and content completeness.
- `reactionScore`: current or recent reaction signals, including comments, sympathy, sharing, and search activation when available.
- `relatednessScore`: alignment between title, body, keyword, topic, and search intent.
- `postLevel`: post strength relative to the blog's overall level and observed exposure.
- `exposureStatus`: simplified display state such as analyzed, needs check, exposed, weak exposure, or not exposed.

Cache freshness:

- Recent posts should be refreshed after 24 hours.
- Older posts can use a 7 day or 14 day cache window.
- Exposure status and reaction score should have their own freshness policy because search exposure and reactions can change independently from the static post body.
- The first implementation should prefer conservative refresh rules over aggressive crawling.

Analysis flow:

1. Fetch recent post list from RSS.
2. Extract stable post identity: `blogId`, `postUrl`, `logNo`, `publishedAt`.
3. Query `BlogPostMetricSnapshot` for matching posts.
4. Use cached rows first when they are fresh.
5. For missing or expired rows, fetch mobile post HTML.
6. Extract title/body/image/video metrics.
7. Calculate draft `potentialScore`, `relatednessScore`, and available `reactionScore`.
8. Calculate draft `postLevel` using blog-level context when available.
9. Upsert `BlogPostMetricSnapshot`.
10. Return enriched recent posts to the UI.

UI usage:

- The recent posting table should prefer `BlogPostMetricSnapshot` values.
- If a cached value is missing, the UI can keep using the current instant fallback.
- The UI should not block on expensive exposure checks.
- `exposureStatus` should show `needs_check` or `analyzed` until Phase 2 exposure data exists.

### BlogKeywordExposureSnapshot

`BlogKeywordExposureSnapshot` caches real search exposure results per keyword.

It should distinguish keywords that merely have search volume from keywords where the blog or its posts actually appear in search surfaces.

This model is the future source for `searchExposureKeywords`. It should become a core input for keyword influence, official valid keyword count, blog level, operation grade, and ranking snapshots.

Keyword sets should be separated as follows:

- `validKeywords`: broad keyword pool with search volume or basic validity.
- `representativeValidKeywords`: stricter local subset connected to recent content.
- `searchExposureKeywords`: keywords confirmed through actual search exposure checks.

Suggested fields:

| Field | Meaning | Phase 1 without Playwright | Phase 2 exposure check | Notes |
| --- | --- | --- | --- | --- |
| `blogId` | Naver blog id | Yes | No | Required lookup key |
| `keyword` | Search keyword | Yes | No | Candidate or exposed keyword |
| `monthlySearch` | Total monthly search volume | Yes | No | From SearchAD |
| `searchAmount` | Observed Blotalk-style total search amount | Yes | No | Naming candidate for `monthlySearch`; final schema should choose one canonical field |
| `mobileSearch` | Monthly mobile search volume | Yes | No | From SearchAD |
| `pcSearch` | Monthly PC search volume | Yes | No | From SearchAD |
| `keywordType` | Raw exposure keyword type | No | Yes | Candidate enum: `VIEW`, `INTEGRATED_INDEX1`, `INTEGRATED_INDEX2`, `INTEGRATED_INDEX3`, `MAIN_SMARTBLOCK` |
| `exposureType` | Highest or primary exposure surface | No | Yes | `integrated`, `smartblock`, `blog`, `popular`, `none` |
| `integratedExposeBlock` | Integrated-search exposed block index or label | No | Yes | Observed field from Blotalk valid keyword response |
| `integratedRank` | Integrated search position | No | Yes | Null if not checked or not exposed |
| `blogRank` | Blog-tab position | No | Yes | Important for blog level durability |
| `smartBlockCount` | Number of smart blocks where matched | No | Yes | App naming candidate |
| `smartBlockAmount` | Number of smart blocks where matched | No | Yes | Observed Blotalk field; final schema should choose one canonical field |
| `popularRank` | Popular post/content position | No | Yes | Null if not checked or not exposed |
| `matchedPostUrl` | Exposed or matched post URL | No | Yes | Can connect keyword to post metrics |
| `matchedLogNo` | Naver post id for matched post | No | Yes | Useful for joining post metric cache |
| `contentScore` | Keyword-specific content quality score | Partial | Yes | Phase 1 can estimate, Phase 2 can refine |
| `contentAmountRatio` | Content volume/competition ratio for the keyword | No | Yes | Observed Blotalk field; may feed content score or keyword difficulty |
| `isRepresentative` | Whether keyword belongs to representative set | Yes | No | Snapshot copy for filtering |
| `checkedAt` | Exposure check time | No | Yes | Search exposure cache freshness |
| `createdAt` | Row creation time | Yes | No | Standard metadata |
| `updatedAt` | Row update time | Yes | No | Standard metadata |

Exposure types:

- `integrated`: Naver integrated search exposure.
- `smartblock`: smart block exposure.
- `blog`: blog tab exposure.
- `view`: VIEW/blog-view exposure if kept distinct from `blog`.
- `popular`: popular post or popular content exposure.
- `none`: checked but no meaningful exposure found.

Observed Blotalk keyword type candidates:

- `VIEW`: blog/view-area exposure. Mapping candidate: `blog` or `view`.
- `INTEGRATED_INDEX1`: integrated search first exposed block. Mapping candidate: `integrated`.
- `INTEGRATED_INDEX2`: integrated search second exposed block. Mapping candidate: `integrated`.
- `INTEGRATED_INDEX3`: integrated search third exposed block. Mapping candidate: `integrated`.
- `MAIN_SMARTBLOCK`: main smart block exposure. Mapping candidate: `smartblock`.

Observed `valid-keyword/paging` response shape:

- `totalCount`: observed top valid keyword count. This is the leading candidate for future `searchExposureKeywords` count and the final top-card valid keyword number.
- `validKeywords[].keyword`
- `validKeywords[].keywordType`
- `validKeywords[].integratedExposeBlock`
- `validKeywords[].smartBlockAmount`
- `validKeywords[].blogRank`
- `validKeywords[].searchAmount`
- `validKeywords[].contentAmountRatio`

Observed behavior:

- Rows appear to be actual search-exposure keywords, not broad SearchAD-only keywords.
- Default sorting appears to be by `searchAmount` descending.
- `integratedExposeBlock`, `smartBlockAmount`, and `blogRank` should be treated as real exposure indicators.
- `contentAmountRatio` should be treated as a keyword-level content competition or content-density signal until its exact semantics are confirmed.

Collection flow:

1. Generate keyword candidates from recent post titles and body text.
2. Check SearchAD volume and keep the broad `validKeywords` pool.
3. Calculate `representativeValidKeywords` separately using local content relevance rules.
4. Select an initial bounded candidate set, usually 30 to 50 keywords.
5. Run actual search exposure checks only in Phase 2.
6. Store confirmed results as `BlogKeywordExposureSnapshot`.
7. Treat exposed rows as `searchExposureKeywords`.
8. Recheck cached keywords according to freshness rules.

Cache freshness:

- Search volume can be refreshed every 7 to 14 days.
- Exposure rank and position should be refreshed every 7 days or by manual refresh.
- Strong blogs, paid plans, or explicitly watched blogs can refresh more often.
- On failure, block, or 429 responses, keep the existing cache and mark the check as failed outside the ranking fields if a failure field is later added.
- Exposure checking should never block the normal detail page load.

UI usage:

- During early stages, the top valid keyword count can use `representativeValidKeywords`.
- After enough exposure data exists, official valid keyword count should move to `searchExposureKeywords`.
- `totalCount` from exposure-backed valid keywords is the strongest candidate for the final top-card valid keyword number.
- The keyword detail table can later expand toward: keyword, exposure location, integrated exposure block, smart block count, blog rank, popular rank, monthly search, and content ratio/score.
- The current UI should remain unchanged until the cache model and collection flow are implemented.

## Core Metric Definitions

### Influence Score

Influence score is the blog's overall search inflow and activity strength as a relative score.

It should combine:

- Keyword exposure strength.
- Content performance strength.
- Blog activity and durability.
- Visitor, subscriber, post count, and posting frequency signals.
- Relative rank within the service dataset.

It should not be tuned only from local RSS, SearchAD volume, or current beta fields.

### Blog Level

Blog level represents accumulated long-term influence.

Expected inputs:

- Sustained keyword exposure.
- Blog-tab keyword holding power.
- Category or topic concentration.
- Historical influence snapshots.
- Durable content performance.

Design note:

- Blog level should be slower to change than operation grade.
- Post level should usually sit near the blog level, often within about plus or minus 1 to 2 levels unless exposure data proves otherwise.

### Operation Grade

Operation grade represents the current practical value of the blog in the search market.

Expected inputs:

- Recent integrated search exposure.
- Smart block exposure.
- Blog-tab exposure.
- Current content influence.
- Posting freshness and consistency.
- Keyword quality and category focus.

Design note:

- Operation grade can move faster than blog level.
- It should reflect current operating flow more than long-term archive strength.

### Keyword Influence

Keyword influence measures how strongly the blog appears in real search environments.

Expected inputs:

- Count of search-exposed keywords.
- Keyword monthly search volume.
- Exposure type and position.
- Blog-tab rank and integrated search rank.
- Smart block participation.
- Matched post quality.
- Category consistency.

Current `representativeValidKeywords` is a stricter local proxy, not the final official keyword influence input.

### Content Influence

Content influence measures the performance potential and observed quality of the blog's posts.

Expected inputs:

- Title length and clarity.
- Body length and completeness.
- Image and video usage.
- Posting freshness.
- Publishing consistency.
- Topic and keyword relatedness.
- Commercial or informational intent fit.
- Reaction signals where available.

Content influence should use cached post metrics once `BlogPostMetricSnapshot` exists.

## Valid Keyword Types

### validKeywords

Broad keyword pool.

Definition:

- Candidate keywords derived from recent posts or other sources.
- Usually filtered by SearchAD volume or basic validity.
- Useful for detailed tables and exploration.

Not intended as the official top-card count by itself.

### representativeValidKeywords

Representative local keyword count.

Definition:

- A stricter subset of `validKeywords`.
- Must be connected to recent post titles or content.
- Should exclude minimal generic stopwords.
- Used as the current top-card and history fallback keyword count until real exposure data exists.

### searchExposureKeywords

Official search-exposed keyword count.

Definition:

- Keywords where the blog or its posts are actually observed in Naver search surfaces.
- Should include integrated search, smart block, blog tab, and popular post surfaces.
- Should power official `BlogInfluenceSnapshot.validKeywordCount` after exposure checking exists.
- Final top-card valid keyword count should likely use exposure-backed `totalCount`, not broad SearchAD-only keyword count.
- Candidate UI columns: keyword, exposure position, integrated exposure block, smart block count, blog rank, monthly search amount, and content ratio/score.

## Post-Level Metrics

### potentialScore

Search potential of a post based on its structure.

Inputs:

- Title presence and length.
- Body length and completeness.
- Image/video balance.
- Keyword placement.
- Search-intent fit.
- Title-body consistency.

This can be estimated in phase 1 without real exposure checks.

### reactionScore

Observed or inferred reaction strength.

Inputs:

- Comment count.
- Sympathy or like count.
- Share count.
- Search activation when available.
- Smart block or popular exposure when available.

This is limited in phase 1 and becomes more meaningful after phase 2 exposure collection.

### relatednessScore

Alignment between the post, keyword, and blog topic.

Inputs:

- Title and body keyword match.
- Topic consistency.
- Semantic match between title and body.
- Representative keyword overlap.

This can be estimated in phase 1 from title/body text.

### postLevel

Post-level strength relative to blog-level strength and post metrics.

Inputs:

- Blog level.
- Potential score.
- Reaction score.
- Relatedness score.
- Exposure status.

Design note:

- Post level should generally be close to the blog level.
- Real exposure checks can push it above or below the blog baseline.

### exposureStatus

Human-readable exposure state for a post.

Possible values:

- `analyzed`
- `needs_check`
- `exposed`
- `weak_exposure`
- `not_exposed`

Final naming can be localized in UI later.

## Phase 1 Data Without Playwright

Available without expensive search exposure checks:

- RSS recent posts.
- Mobile post HTML fetch.
- Title length.
- Body length.
- Image count.
- SearchAD monthly volume.
- Title and body keyword matching.
- Representative keyword calculation.
- Draft potential score.
- Draft relatedness score.
- Basic content pattern score.

Phase 1 should avoid presenting these as final official influence metrics.

## Phase 2 Data Requiring Search Exposure Checks

Expensive or dynamic checks:

- Integrated search exposure.
- Smart block exposure.
- Blog tab rank.
- Popular post rank.
- Keyword-level post ranking.
- Reaction score from live search activation.
- Official search-exposed valid keyword count.

These should be handled by cron, queue, manual refresh, or bounded background jobs rather than blocking normal page loads.

## Prisma Model Drafts

These are schema design drafts only. Do not create these models until the metric definitions and collection strategy are finalized.

Common principles:

- Keep these models centered on `blogId`.
- Do not add `User` relations in the first version.
- Use timestamps to separate logical snapshot time from execution/check time.
- Prefer upsert keys that are stable across reruns.
- Keep `BlogAnalysisHistory` as the ordinary analysis and chart history model.

### BlogInfluenceSnapshot Draft

Purpose:

- Store official biweekly blog-level metrics.
- Provide stable source of truth for influence score, blog level, operation grade, ranks, and official valid keyword count.

Field draft:

| Field | Type candidate | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String @id @default(cuid())` | No | Internal id |
| `blogId` | `String` | No | Naver blog id |
| `topic` | `String?` | Yes | Inferred topic |
| `category` | `String?` | Yes | Future official category label |
| `influenceScore` | `Float?` | Yes | Official total score |
| `keywordInfluenceScore` | `Float?` | Yes | Official keyword exposure score |
| `contentInfluenceScore` | `Float?` | Yes | Official content score |
| `blogLevel` | `Int?` | Yes | Long-term blog level |
| `operationGrade` | `String?` | Yes | Current operation grade |
| `totalRank` | `Int?` | Yes | Service-wide rank |
| `categoryRank` | `Int?` | Yes | Rank inside topic/category |
| `validKeywordCount` | `Int?` | Yes | Official exposure-backed keyword count |
| `visitorAvg` | `Float?` | Yes | Snapshot-window visitor average |
| `subscriberCount` | `Int?` | Yes | Snapshot copy |
| `postCount` | `Int?` | Yes | Snapshot copy |
| `postingFrequency` | `Float?` | Yes | Snapshot-window posting frequency |
| `snapshotDate` | `DateTime` | No | Logical biweekly snapshot date |
| `analyzedAt` | `DateTime?` | Yes | Calculation completion time |
| `createdAt` | `DateTime @default(now())` | No | Row creation time |
| `updatedAt` | `DateTime @updatedAt` | No | Row update time |

Unique/index candidates:

- `@@unique([blogId, snapshotDate])`
- `@@index([blogId])`
- `@@index([snapshotDate])`
- `@@index([topic, snapshotDate])`
- `@@index([category, snapshotDate])`
- `@@index([totalRank])`
- `@@index([categoryRank])`

Upsert key:

- Primary: `blogId + snapshotDate`

Query patterns:

- Latest official snapshot by `blogId`.
- Biweekly score/rank chart by `blogId`.
- Global rank table by `snapshotDate`.
- Category/topic rank table by `topic/category + snapshotDate`.
- Snapshot comparison against previous period.

### BlogPostMetricSnapshot Draft

Purpose:

- Cache recent post metrics and post-level scores.
- Avoid recalculating word count, image count, potential, relatedness, reaction, and post level on every page load.

Field draft:

| Field | Type candidate | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String @id @default(cuid())` | No | Internal id |
| `blogId` | `String` | No | Naver blog id |
| `postUrl` | `String @db.Text` | No | Canonical post URL |
| `orgUrl` | `String? @db.Text` | Yes | Original URL if different |
| `logNo` | `String?` | Yes | Naver post id |
| `title` | `String` | No | Display title |
| `cleanTitle` | `String?` | Yes | Cleaned title |
| `channelId` | `String?` | Yes | Source channel id if available |
| `publishedAt` | `DateTime?` | Yes | Published time |
| `simpleDate` | `String?` | Yes | Display date if kept |
| `thumbnail` | `String? @db.Text` | Yes | Thumbnail URL |
| `postContent` | `String? @db.Text` | Yes | Optional extracted body or excerpt |
| `wordCount` | `Int?` | Yes | Body length |
| `imageCount` | `Int?` | Yes | Image count |
| `videoCount` | `Int?` | Yes | Video count |
| `commentCount` | `Int?` | Yes | Comment count |
| `sympathyCount` | `Int?` | Yes | Sympathy/like count |
| `shareCount` | `Int?` | Yes | Share count |
| `titleScore` | `Float?` | Yes | Title quality score |
| `contentLengthScore` | `Float?` | Yes | Body length score |
| `imageScore` | `Float?` | Yes | Image usage score |
| `potentialScore` | `Float?` | Yes | Search potential score |
| `reactivityScore` | `Float?` | Yes | Reactivity score |
| `relatednessScore` | `Float?` | Yes | Title/body/topic alignment score |
| `postLevel` | `Int?` | Yes | Post level |
| `searchYn` | `Boolean?` | Yes | Observed search flag if available |
| `foundOnSearch` | `Boolean?` | Yes | Whether post was found in search |
| `status` | `String?` | Yes | Raw status from source |
| `exposureStatus` | `String?` | Yes | Normalized UI exposure state |
| `analyzedAt` | `DateTime?` | Yes | Metric calculation time |
| `createdAt` | `DateTime @default(now())` | No | Row creation time |
| `updatedAt` | `DateTime @updatedAt` | No | Row update time |

Unique/index candidates:

- `@@unique([blogId, logNo])` if `logNo` is always present.
- Alternative: `@@unique([blogId, postUrlHash])` if a URL hash field is introduced.
- `@@index([blogId])`
- `@@index([blogId, publishedAt])`
- `@@index([blogId, analyzedAt])`
- `@@index([postLevel])`
- `@@index([exposureStatus])`
- `@@index([foundOnSearch])`

Upsert key:

- Primary: `blogId + logNo`
- Fallback: canonical `postUrl` or URL hash when `logNo` is missing.

Query patterns:

- Recent post metrics by `blogId`, ordered by `publishedAt desc`.
- Missing or expired cache rows for refresh.
- Post-level table rows for `/blog-analysis/[blogId]`.
- Aggregate post pattern statistics for a blog.
- Join target for keyword exposure matched post URL/logNo.

### BlogKeywordExposureSnapshot Draft

Purpose:

- Cache keyword-level real search exposure.
- Provide future official `searchExposureKeywords`.
- Feed keyword influence, valid keyword count, rank, and exposure detail tables.

Field draft:

| Field | Type candidate | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `String @id @default(cuid())` | No | Internal id |
| `blogId` | `String` | No | Naver blog id |
| `keyword` | `String` | No | Keyword text |
| `keywordType` | `String?` | Yes | Raw type such as `VIEW`, `INTEGRATED_INDEX1`, `MAIN_SMARTBLOCK` |
| `exposureType` | `String` | No | Normalized type: `integrated`, `smartblock`, `blog/view`, `popular`, `none` |
| `monthlySearch` | `Int?` | Yes | Canonical monthly search field if chosen |
| `searchAmount` | `Int?` | Yes | Blotalk-style observed field |
| `mobileSearch` | `Int?` | Yes | Mobile search volume |
| `pcSearch` | `Int?` | Yes | PC search volume |
| `integratedExposeBlock` | `String?` | Yes | Integrated exposed block info |
| `integratedRank` | `Int?` | Yes | Integrated search rank |
| `blogRank` | `Int?` | Yes | Blog/view rank |
| `smartBlockCount` | `Int?` | Yes | App naming candidate |
| `smartBlockAmount` | `Int?` | Yes | Blotalk-style observed field |
| `popularRank` | `Int?` | Yes | Popular post/content rank |
| `matchedPostUrl` | `String? @db.Text` | Yes | Matched exposed post URL |
| `matchedLogNo` | `String?` | Yes | Matched post logNo |
| `contentScore` | `Float?` | Yes | Keyword-specific content quality score |
| `contentAmountRatio` | `Float?` | Yes | Content volume/competition ratio |
| `isRepresentative` | `Boolean @default(false)` | No | Whether keyword was in representative set |
| `checkedAt` | `DateTime?` | Yes | Exposure check time |
| `createdAt` | `DateTime @default(now())` | No | Row creation time |
| `updatedAt` | `DateTime @updatedAt` | No | Row update time |

Unique/index candidates:

- `@@unique([blogId, keyword, exposureType])` for one current row per exposure surface.
- Alternative snapshot style: `@@unique([blogId, keyword, exposureType, checkedAt])` if keeping every check result.
- `@@index([blogId])`
- `@@index([blogId, keyword])`
- `@@index([keyword])`
- `@@index([keywordType])`
- `@@index([exposureType])`
- `@@index([checkedAt])`
- `@@index([blogRank])`
- `@@index([searchAmount])`
- `@@index([isRepresentative])`

Upsert key:

- Current-row mode: `blogId + keyword + exposureType`
- Snapshot-row mode: `blogId + keyword + exposureType + checkedAt`
- Current-row mode is simpler for the first implementation.

Query patterns:

- Count `searchExposureKeywords` by `blogId`.
- Keyword detail table by `blogId`, sorted by `searchAmount desc`.
- Keyword influence calculation by exposure type and rank.
- Expired exposure cache lookup by `checkedAt`.
- Matched post lookup through `matchedLogNo` or `matchedPostUrl`.

## Implementation Stages

### Stage 1: Confirm Definitions

- Finalize this document.
- Freeze metric names and responsibilities.
- Decide which UI labels are beta and which are official.
- Avoid further score tuning until data ownership is clear.

### Stage 2: Add Prisma Models

- Add `BlogInfluenceSnapshot`.
- Add `BlogPostMetricSnapshot`.
- Add `BlogKeywordExposureSnapshot`.
- Keep `BlogAnalysisHistory` for ordinary analysis history and chart records.

### Stage 3: Post Metric Cache

- Populate `BlogPostMetricSnapshot` from RSS and mobile HTML.
- Cache word count, image count, video count, basic reactions if available, potential score, relatedness score, and draft post level.
- Update the recent posts table from cached metrics.

### Stage 4: Keyword Exposure Cache

- Add controlled search exposure checks.
- Store exposure type, rank, matched post URL, and checked timestamp.
- Separate `searchExposureKeywords` from broad `validKeywords`.

### Stage 5: Official Influence Snapshot

- Calculate official biweekly influence snapshots.
- Use keyword exposure, content metrics, activity, history, and relative rank.
- Make `BlogInfluenceSnapshot` the source of truth for official influence score, blog level, operation grade, rank, and official valid keyword count.

## Deferred Decisions

- Exact score weights for official metrics.
- Exposure check provider and throttling strategy.
- Whether reaction data comes from page HTML, search surfaces, or both.
- Whether official rankings are global, category-scoped, or both.
- Snapshot backfill strategy for existing blogs.
