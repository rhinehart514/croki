"use client";

import { useEffect } from "react";
import Link from "next/link";
import { readAttributionFromUrl, persistAttribution } from "@/lib/attribution";
import { trackPageView } from "@/lib/analytics";

// Pricing page. The landing page has always linked here ("See pricing", in
// src/app/page.tsx), but the /pricing route never existed — this fills it in.
//
// Two choices, both grounded in code that already ships:
//  1. Like the landing page, it captures first-touch attribution on load. Pricing
//     is a common first page a campaign links straight to, and the whole
//     attribution story depends on grabbing the source at the FIRST page hit.
//  2. Flat per-plan pricing, not per-seat — the landing page promises "no per-seat
//     surprise", so the pricing surface keeps that promise. The three plans match
//     the choices the signup form already offers (src/app/signup/page.tsx).
const PLANS = [
  {
    id: "solo",
    name: "Solo",
    price: "$0",
    cadence: "free forever",
    tagline: "For one person keeping their own work straight.",
    features: ["1 workspace", "Unlimited tasks", "Shareable read-only briefs"],
  },
  {
    id: "team",
    name: "Team",
    price: "$29",
    cadence: "per month, flat",
    tagline: "For a small team that needs to see who's on what.",
    features: ["Everything in Solo", "Invite your whole team", "Shared project briefs"],
    highlighted: true,
  },
  {
    id: "business",
    name: "Business",
    price: "$79",
    cadence: "per month, flat",
    tagline: "For a growing company that wants it locked down.",
    features: ["Everything in Team", "Admin roles & audit log", "Priority support"],
  },
];

export default function PricingPage() {
  useEffect(() => {
    const attribution = readAttributionFromUrl(new URL(window.location.href));
    persistAttribution(attribution);
    trackPageView("Pricing");
  }, []);

  return (
    <main className="pricing">
      <h1>Simple, flat pricing.</h1>
      <p>One price per plan — no per-seat surprise. Start free, switch whenever.</p>

      <ul className="plans">
        {PLANS.map((plan) => (
          <li key={plan.id} className={plan.highlighted ? "plan plan-highlighted" : "plan"}>
            <h2>{plan.name}</h2>
            <p className="plan-price">
              <span className="plan-amount">{plan.price}</span>{" "}
              <span className="plan-cadence">{plan.cadence}</span>
            </p>
            <p className="plan-tagline">{plan.tagline}</p>
            <ul className="plan-features">
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <Link className="cta" href="/signup">
              {plan.price === "$0" ? "Start free" : `Choose ${plan.name}`}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
