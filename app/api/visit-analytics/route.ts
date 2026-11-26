import { env } from "cloudflare:workers";
import { validAnalyticsToken } from "@/lib/visit-analytics";

/** This site identifier is deliberately public; it is not a Cloudflare API credential. */
export function GET() {
  const token = (env as unknown as Record<string, unknown>).CLOUDFLARE_WEB_ANALYTICS_TOKEN;
  return Response.json(validAnalyticsToken(token) ? { enabled: true, token } : { enabled: false }, {
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
