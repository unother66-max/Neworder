import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const baseUrl = "https://postlabs.co.kr";
  const routes = [
    { path: "", priority: 1 },
    { path: "/place", priority: 0.9 },
    { path: "/smartstore", priority: 0.9 },
    { path: "/place-review", priority: 0.85 },
    { path: "/place-analysis", priority: 0.85 },
    { path: "/kakao-place", priority: 0.85 },
    { path: "/kakao-ranking", priority: 0.85 },
    { path: "/kakao-analysis", priority: 0.85 },
    { path: "/blog", priority: 0.85 },
    { path: "/top-blog", priority: 0.8 },
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified,
    changeFrequency: "daily",
    priority: route.priority,
  }));
}
