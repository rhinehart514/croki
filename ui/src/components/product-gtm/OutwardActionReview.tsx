import { useState } from "react";
import { checkOutwardObservation, executeOutwardAction, grantOutwardObservation } from "@/api";
import type { MarketMovementIndex, OutwardObservation } from "@/types";

type Action = MarketMovementIndex["actions"][number];

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const readable = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;

function exactMaterial(action: Action) {
  const material = record(action.preparedMaterial);
  const effect = record(material.effect ?? material);
  const contract = record(effect.deployContract);
  const message = record(effect.messageContract);
  return {
    command: readable(contract.command),
    destination: readable(contract.destination ?? effect.destination ?? effect.environment),
    recipient: readable(message.to),
    subject: readable(message.subject),
    body: typeof message.body === "string" && message.body.trim() ? message.body : null,
    unavailable: readable(effect.deployUnavailableReason ?? effect.messageUnavailableReason),
  };
}

function returnPlan(action: Action) {
  const expected = record(action.expectedReturn);
  const target = record(expected.target);
  return {
    source: readable(expected.source),
    url: readable(target.url ?? expected.url),
    hours: typeof expected.windowHours === "number" ? Math.min(expected.windowHours, 168) : null,
  };
}

function stateCopy(action: Action) {
  const act = action.kind === "message" ? "Send" : "Deploy";
  if (action.state === "execution-failed") return { eyebrow: `${act} failed`, body: action.lastExecutionError ?? `The exact ${act.toLowerCase()} did not complete. Nothing crossed into the world.` };
  if (action.state === "execution-unknown") return { eyebrow: `${act} needs verification`, body: `Croki was interrupted after execution began. Verify the destination before preparing another ${act.toLowerCase()}; retry is intentionally disabled.` };
  if (action.state === "observation-failed") return { eyebrow: "Return check failed", body: action.latestObservation?.lastResult?.error ?? "The authorized source could not be read. The action remains in the world." };
  if (action.state === "silent") return { eyebrow: "No expected return yet", body: "The source was checked, but the prepared return condition was not present. Croki has not interpreted the silence." };
  if (action.state === "returned") return { eyebrow: "Reality returned", body: "The prepared condition was observed and remains attached to this exact outward action." };
  if (action.state === "in-world") return { eyebrow: "In the world", body: `The ${act.toLowerCase()} completed. Observation stays bounded to the exact prepared target.` };
  return { eyebrow: "Founder authority", body: "Nothing crosses into the world until you execute this exact action here." };
}

export function OutwardActionReview({ ventureId, action, readOnly, onChanged }: { ventureId: string; action: Action; readOnly: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<"execute" | "grant" | "check" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localObservation, setLocalObservation] = useState<OutwardObservation | null>(null);
  const material = exactMaterial(action);
  const plan = returnPlan(action);
  const observation = localObservation ?? action.latestObservation ?? action.observations?.[0] ?? null;
  const copy = stateCopy(action);

  const perform = async (kind: NonNullable<typeof busy>, operation: () => Promise<unknown>) => {
    setBusy(kind); setError(null);
    try { await operation(); onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The outward action could not continue."); }
    finally { setBusy(null); }
  };
  const message = action.kind === "message";
  const receiptThreadId = readable(record(action.executorReceipt).threadId);
  const executable = action.kind === "deploy" || (message && Boolean(material.recipient && material.body));
  const canExecute = executable && !action.executedAt && !action.executionLease && !material.unavailable;
  const canGrant = Boolean(action.executedAt && !observation && plan.hours && (plan.source === "http" ? Boolean(plan.url) : plan.source === "gmail-thread" ? Boolean(receiptThreadId) : false));
  const canCheck = Boolean(action.executedAt && observation && !observation.revokedAt);

  return <section className="product-gtm-outward-review" aria-live="polite">
    <header><small>{copy.eyebrow}</small><strong>{copy.body}</strong></header>
    <dl>
      <div><dt>Exact act</dt><dd>{material.command ?? (message ? "Send this email from your connected Gmail" : action.kind.replaceAll("-", " "))}</dd></div>
      {material.destination ? <div><dt>Destination</dt><dd>{material.destination}</dd></div> : null}
      {material.recipient ? <div><dt>To</dt><dd>{material.recipient}</dd></div> : null}
      {material.subject ? <div><dt>Subject</dt><dd>{material.subject}</dd></div> : null}
      {plan.url ? <div><dt>Expected return</dt><dd>{plan.url}</dd></div> : null}
      {plan.source === "gmail-thread" ? <div><dt>Expected return</dt><dd>A reply in this send’s exact Gmail thread</dd></div> : null}
      {plan.hours ? <div><dt>Observation window</dt><dd>{plan.hours} {plan.hours === 1 ? "hour" : "hours"}, only after you grant it</dd></div> : null}
    </dl>
    {material.body ? <blockquote className="product-gtm-outward-message">{material.body}</blockquote> : null}
    {material.unavailable ? <p role="status">{material.unavailable}</p> : null}
    {error ? <p className="is-error" role="alert">{error}</p> : null}
    <footer>
      {canExecute ? <button className="is-founder" type="button" disabled={readOnly || busy !== null} onClick={() => void perform("execute", () => executeOutwardAction(ventureId, action.id))}>{busy === "execute" ? (message ? "Sending…" : "Deploying…") : action.state === "execution-failed" ? (message ? "Retry send" : "Retry deploy") : message ? "Send this email" : "Deploy now"}</button> : null}
      {canGrant ? <button className="is-founder" type="button" disabled={readOnly || busy !== null} onClick={() => void perform("grant", async () => { const result = await grantOutwardObservation(ventureId, action.id); setLocalObservation(result.observation); })}>{busy === "grant" ? "Authorizing…" : `Watch for ${plan.hours}h`}</button> : null}
      {canCheck ? <button type="button" disabled={readOnly || busy !== null} onClick={() => void perform("check", async () => { const result = await checkOutwardObservation(ventureId, action.id, observation!.id); setLocalObservation(result.contract); })}>{busy === "check" ? "Checking…" : action.state === "observation-failed" ? "Retry return check" : "Check for a return"}</button> : null}
      {!canExecute && !action.executedAt && !executable && !material.unavailable ? <span>This kind is prepared, but no executor adapter is available yet.</span> : null}
      {observation?.revokedAt ? <span>The observation grant was revoked. No further source reads are authorized.</span> : null}
    </footer>
  </section>;
}
