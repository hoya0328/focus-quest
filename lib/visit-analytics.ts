export const VISIT_ANALYTICS_PREFERENCE = "focus-quest-visit-analytics";

/** Only a clean public home URL is eligible; auth callbacks and operator pages are excluded. */
export function visitAnalyticsAllowed(url: URL, preference: string | null, doNotTrack: string | null) {
  return url.pathname === "/" && !url.search && !url.hash && preference === "allowed" && doNotTrack !== "1";
}

export function validAnalyticsToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{32}$/i.test(value);
}
