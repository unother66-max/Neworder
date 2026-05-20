/** PostTitleListAsync 1페이지당 글 수 (기본 분석·load-more 공통) */
export const BLOG_RECENT_POSTS_TITLE_LIST_PAGE_SIZE = 30;

/** 기본 `/api/blog-analysis` 첫 로드 시 PostTitleListAsync 페이지 수 (가볍게) */
export const BLOG_RECENT_POSTS_INITIAL_TITLE_LIST_PAGES = 1;

/** 첫 응답 recentPosts 상한 (mergeRecentPostSources) */
export const BLOG_RECENT_POSTS_INITIAL_DISPLAY_LIMIT = 30;

/** 첫 로드 시 포스팅 메트릭 실시간 fetch 상한 */
export const BLOG_RECENT_POSTS_INITIAL_METRIC_FETCH_LIMIT = 30;
