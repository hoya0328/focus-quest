export const VISIT_ANALYTICS_PREFERENCE = "focus-quest-visit-analytics";
export const VISIT_ANALYTICS_CHANGED = "focus-quest-visit-analytics-changed";

/** Browser-only preference, deliberately independent of account and signup metadata. */
export function saveVisitAnalyticsPreference(next: "allowed" | "denied") {
  try {
    localStorage.setItem(VISIT_ANALYTICS_PREFERENCE, next);
    window.dispatchEvent(new Event(VISIT_ANALYTICS_CHANGED));
    return true;
  } catch { return false; }
}

/** Only a clean public home URL is eligible; auth callbacks and operator pages are excluded. */
export function visitAnalyticsAllowed(url: URL, preference: string | null, doNotTrack: string | null) {
  return url.pathname === "/" && !url.search && !url.hash && preference === "allowed" && doNotTrack !== "1";
}

export function validAnalyticsToken(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{32}$/i.test(value);
}
