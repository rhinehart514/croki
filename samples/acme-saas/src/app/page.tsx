"use client";

import { useEffect } from "react";
import Link from "next/link";
import { readAttributionFromUrl, persistAttribution } from "@/lib/attribution";
import { trackPageView } from "@/lib/analytics";

// Marketing landing page. First thing it does on load: grab the campaign params
// off the URL and stash them, so we remember how this visitor found us by the
// time they sign up.
export default function LandingPage() {
  useEffect(() => {
    const attribution = readAttributionFromUrl(new URL(window.location.href));
    persistAttribution(attribution);
    trackPageView("Landing");
  }, []);

  return (
    <main className="landing">
      <h1>Acme keeps your team on the same page.</h1>
      <p>
        A dead-simple task tracker for small teams. Make a workspace, invite your
        people, see who's on what. No setup call, no per-seat surprise.
      </p>
      <Link className="cta" href="/signup">
        Start free
      </Link>
    </main>
  );
}
