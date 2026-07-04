// The UI's connection to the team's Convex deployment. Everything here is GUARDED on VITE_CONVEX_URL:
// with no URL set, `convexClient` is null and the app runs exactly as before — fully local, solo, no
// Convex loaded. Set the URL (after `npx convex dev` provisions a deployment) and the team layer
// turns on: onboarding, the reactive project list, the approval queue.
//
// Functions are referenced by string (makeFunctionReference) so this compiles before the deployment
// has generated `convex/_generated/` — the names match the files in /convex exactly.
import { ConvexReactClient } from "convex/react";
import { makeFunctionReference } from "convex/server";

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
export const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;
export const convexEnabled = !!convexClient;

// teams.ts
export const teamsApi = {
  create: makeFunctionReference<"mutation">("teams:create"),
  joinByCode: makeFunctionReference<"mutation">("teams:joinByCode"),
  listForIdentity: makeFunctionReference<"query">("teams:listForIdentity"),
  get: makeFunctionReference<"query">("teams:get"),
  listMembers: makeFunctionReference<"query">("teams:listMembers"),
};

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

export function saveTeamIdentity(value: TeamIdentity): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* ignore quota/availability errors — the team layer is best-effort */
  }
}

