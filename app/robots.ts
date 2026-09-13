import type { MetadataRoute } from "next";
import { absUrl } from "@/lib/seo/site";

// Allow all major AI crawlers explicitly (per-agent rules survive future
// tightening of each crawler's default policy), plus the wildcard. Authenticated
// / API surfaces are disallowed so they don't bleed into search or AI answers.
const AI_BOTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "Google-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Anthropic-ai",
  "CCBot",
];

const DISALLOW = ["/api/", "/admin/", "/onboarding", "/notifications", "/profile"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_BOTS.map((userAgent) => ({ userAgent, allow: "/", disallow: DISALLOW })),
    ],
    sitemap: absUrl("/sitemap.xml"),
    host: absUrl("/"),
  };
}
