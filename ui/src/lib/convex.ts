// The UI's connection to the team's Convex deployment. Everything here is GUARDED on VITE_CONVEX_URL:
// with no URL set, `convexClient` is null and the app runs exactly as before — fully local, solo, no
// Convex loaded. Set the URL (after `npx convex dev` provisions a deployment) and the team layer
// turns on: onboarding, the reactive project list, the approval queue.
//
import { ConvexReactClient } from "convex/react";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
export const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;
export const convexEnabled = !!convexClient;

// ── The locally-remembered team identity ──────────────────────────────────────────────────────
// Until real auth lands, the signed-in person and their chosen team live in localStorage. This is
// what onboarding writes and what the rest of the UI reads to know "who am I, which team."
export type TeamIdentity = {
  identity: string; // email for now
  name: string;
  teamId: string;
  teamName: string;
  role?: string;
};

const KEY = "gtm-ide-team";

export function loadTeamIdentity(): TeamIdentity | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TeamIdentity) : null;
  } catch {
    return null;
  }
}

// The solo/local identity — the founder proceeds as a party of one, no name or email asked. Identity
// is deferred: this is what seeds `teamIdentity` so the founder is never gated on "who are you" before
// seeing their product. It resolves to the personal space the server already defaults to (teamId
// "local"), so nothing about release authority or scoping changes. A real name/email is captured later,
// only when it's actually needed (setting up a shared team in Settings, or the moment something sends).
export function localTeamIdentity(): TeamIdentity {
  return {
    identity: "founder@local",
    name: "Founder",
    teamId: "local",
    teamName: "Local workspace",
    role: "owner",
  };
}

