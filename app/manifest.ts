import type { MetadataRoute } from "next";

// Web app manifest (served at /manifest.webmanifest). Dark "trading-floor"
// install identity. theme/background are sRGB hex — the manifest spec + install
// chrome don't render OKLCH. dir/lang make the installed app Hebrew-RTL.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "פוליטיקל — שוק הניחושים של הפוליטיקה הישראלית",
    short_name: "פוליטיקל",
    description: "נחשו את הפוליטיקה הישראלית. בלי כסף אמיתי — רק על הכבוד.",
    start_url: "/",
    scope: "/",
    id: "/?source=pwa",
    display: "standalone",
    orientation: "portrait",
    dir: "rtl",
    lang: "he",
    background_color: "#0B1020",
    theme_color: "#0B1020",
    categories: ["games", "entertainment", "news"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
