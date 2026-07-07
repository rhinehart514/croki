import { AnalyticsBrowser } from "@segment/analytics-next";

// Single Segment instance for the whole app. Loaded once on the client; server
// actions call `track` through the thin server helper in ./analytics-server.
export const analytics = AnalyticsBrowser.load({
  writeKey: process.env.NEXT_PUBLIC_SEGMENT_WRITE_KEY ?? "",
});

// Identify the signed-in user so later events attach to a known person.
export function identifyUser(userId: string, traits: Record<string, unknown>) {
  analytics.identify(userId, traits);
}

// A page view — fired from the client on route changes.
export function trackPageView(name: string) {
  analytics.page(name);
}
