import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const baseUrl = "https://postlabs.co.kr";
  const routes = [
    { path: "", priority: 1 },
    { path: "/top-blog", priority: 0.9 },
    { path: "/place", priority: 0.9 },
    { path: "/smartstore", priority: 0.9 },
    { path: "/kakao-place", priority: 0.9 },
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified,
    changeFrequency: "daily",
    priority: route.priority,
  }));
}
