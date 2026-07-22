"use server";

import { redirect } from "next/navigation";
import { analytics } from "@/lib/analytics-server";
import { createWorkspace, createUser } from "@/lib/accounts";

// The signup server action. This is the moment the account is born and the win
// event fires. Everything the business cares about hangs off this event landing
// cleanly — which makes what's MISSING from it the whole problem.
export async function completeSignup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const plan = String(formData.get("plan") ?? "team");
  const workspaceName = String(formData.get("workspace") ?? "");

  const user = await createUser({ email });
  const workspace = await createWorkspace({
    name: workspaceName,
    ownerId: user.id,
    plan,
  });

  // Win event. The account exists; this is what "it worked" looks like.
  //
  // Note what's here and what isn't: userId, plan, workspace, seats — every
  // product fact we need. But no utm_source, no campaign, no referrer. The
  // attribution cookie the landing page set is sitting right there in the
  // request and nobody reads it. So this event can tell us a signup happened
  // and never which campaign, post, or channel earned it.
  analytics.track({
    userId: user.id,
    event: "signup_completed",
    properties: {
      plan,
      workspaceId: workspace.id,
      seats: workspace.seats,
    },
  });

  redirect(`/w/${workspace.id}`);
}
