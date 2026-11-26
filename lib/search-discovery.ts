import { PUBLIC_SERVICE_URL } from "./service-config.ts";

export const PUBLIC_INDEX_PATHS = ["/", "/privacy", "/terms"] as const;

export function sitemapXml() {
  const entries = PUBLIC_INDEX_PATHS.map((path) => `<url><loc>${PUBLIC_SERVICE_URL}${path === "/" ? "/" : path}</loc></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`;
}

export function robotsText() {
  return `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /operations\nDisallow: /auth/\n\nSitemap: ${PUBLIC_SERVICE_URL}/sitemap.xml\n`;
}
