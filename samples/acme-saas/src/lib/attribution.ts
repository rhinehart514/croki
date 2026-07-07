// Attribution capture. When someone lands from a campaign, the URL carries a
// `utm_source` (and friends). We grab it once, on the first page they hit, and
// keep it in a cookie so it survives the walk from landing page to signup.
//
// Capturing it is the easy half. The hard half — actually attaching it to the
// account when they convert — lives in the signup flow, and is where this app
// currently drops the ball.

const ATTRIBUTION_COOKIE = "acme_attribution";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

// Pull the campaign params off the current URL. This is where acquisition source
// enters the product — everything downstream depends on it being carried forward.
export function readAttributionFromUrl(url: URL) {
  return {
    utm_source: url.searchParams.get("utm_source"),
    utm_campaign: url.searchParams.get("utm_campaign"),
    utm_medium: url.searchParams.get("utm_medium"),
    referrer: typeof document !== "undefined" ? document.referrer || null : null,
  };
}

export type Attribution = ReturnType<typeof readAttributionFromUrl>;

// Persist first-touch attribution to a cookie (only if we don't already have one,
// so the first campaign that brought them wins).
export function persistAttribution(attribution: Attribution) {
  if (typeof document === "undefined") return;
  if (document.cookie.includes(`${ATTRIBUTION_COOKIE}=`)) return;
  const value = encodeURIComponent(JSON.stringify(attribution));
  document.cookie = `${ATTRIBUTION_COOKIE}=${value}; path=/; max-age=${THIRTY_DAYS}; samesite=lax`;
}

// Read it back out — this is what the signup flow is supposed to call, and doesn't.
export function loadAttribution(): Attribution | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`${ATTRIBUTION_COOKIE}=([^;]+)`));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1])) as Attribution;
  } catch {
    return null;
  }
}
