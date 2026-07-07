"use server";

import { analytics } from "@/lib/analytics-server";

// Inviting a teammate into a workspace. A second real event, so the account
// isn't the only thing the app tracks — and so it's clear the signup event
// isn't special-cased, it just happens to be the one that matters for growth.
export async function inviteTeammate(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const inviteeEmail = String(formData.get("email") ?? "");
  const role = String(formData.get("role") ?? "member");

  analytics.track("invite_sent", {
    workspaceId,
    inviteeEmail,
    role,
  });
}
