import { robotsText } from "@/lib/search-discovery";

export function GET() {
  return new Response(robotsText(), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
