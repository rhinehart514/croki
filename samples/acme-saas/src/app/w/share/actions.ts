"use server";

import { createHmac } from "node:crypto";
import { analytics } from "@/lib/analytics-server";

// A project brief is a real product object, not marketing copy. A workspace owner
// can hand one read-only URL to a client or collaborator without adding a paid seat.
export async function createProjectBrief(input: {
  workspaceId: string;
  projectId: string;
  createdBy: string;
}) {
  const payload = `${input.workspaceId}:${input.projectId}`;
  const token = createHmac("sha256", process.env.ACME_SHARE_SECRET ?? "public-sample-only")
    .update(payload)
    .digest("hex")
    .slice(0, 20);
  const shareUrl = `/brief/${input.projectId}?token=${token}`;

  analytics.track("project_brief_shared", {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    createdBy: input.createdBy,
    shareUrl,
  });

  return { shareUrl, access: "read-only" as const };
}

// This receipt proves that the shared product surface was opened. It deliberately
// does not claim a signup, a new workspace, or revenue; those outcomes need their
// own joined evidence.
export async function recordProjectBriefViewed(input: {
  projectId: string;
  referrer: string | null;
}) {
  analytics.track("project_brief_viewed", {
    projectId: input.projectId,
    referrer: input.referrer,
  });
}
