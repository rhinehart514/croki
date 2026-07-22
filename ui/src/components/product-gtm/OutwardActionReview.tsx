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
  return {
    command: readable(contract.command),
    destination: readable(contract.destination ?? effect.destination ?? effect.environment),
    unavailable: readable(effect.deployUnavailableReason),
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
  if (action.state === "execution-failed") return { eyebrow: "Deploy failed", body: action.lastExecutionError ?? "The exact deploy did not complete. Nothing was recorded as live." };
  if (action.state === "execution-unknown") return { eyebrow: "Deploy needs verification", body: "Drover was interrupted after execution began. Verify the destination before preparing another deploy; retry is intentionally disabled." };
  if (action.state === "observation-failed") return { eyebrow: "Return check failed", body: action.latestObservation?.lastResult?.error ?? "The authorized source could not be read. The action remains in the world." };
  if (action.state === "silent") return { eyebrow: "No expected return yet", body: "The exact source was checked, but the prepared return condition was not present. Drover has not interpreted the silence." };
  if (action.state === "returned") return { eyebrow: "Reality returned", body: "The prepared condition was observed and remains attached to this exact outward action." };
  if (action.state === "in-world") return { eyebrow: "In the world", body: "The deploy completed. Observation stays bounded to the exact prepared target." };
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
  const canExecute = action.kind === "deploy" && !action.executedAt && !action.executionLease && !material.unavailable;
  const canGrant = Boolean(action.executedAt && !observation && plan.source === "http" && plan.url && plan.hours);
  const canCheck = Boolean(action.executedAt && observation && !observation.revokedAt);

  return <section className="product-gtm-outward-review" aria-live="polite">
    <header><small>{copy.eyebrow}</small><strong>{copy.body}</strong></header>
    <dl>
      <div><dt>Exact act</dt><dd>{material.command ?? action.kind.replaceAll("-", " ")}</dd></div>
      {material.destination ? <div><dt>Destination</dt><dd>{material.destination}</dd></div> : null}
      {plan.url ? <div><dt>Expected return</dt><dd>{plan.url}</dd></div> : null}
      {plan.hours ? <div><dt>Observation window</dt><dd>{plan.hours} {plan.hours === 1 ? "hour" : "hours"}, only after you grant it</dd></div> : null}
    </dl>
    {material.unavailable ? <p role="status">{material.unavailable}</p> : null}
    {error ? <p className="is-error" role="alert">{error}</p> : null}
    <footer>
      {canExecute ? <button className="is-founder" type="button" disabled={readOnly || busy !== null} onClick={() => void perform("execute", () => executeOutwardAction(ventureId, action.id))}>{busy === "execute" ? "Deploying…" : action.state === "execution-failed" ? "Retry exact deploy" : "Deploy now"}</button> : null}
      {canGrant ? <button className="is-founder" type="button" disabled={readOnly || busy !== null} onClick={() => void perform("grant", async () => { const result = await grantOutwardObservation(ventureId, action.id); setLocalObservation(result.observation); })}>{busy === "grant" ? "Authorizing…" : `Watch for ${plan.hours}h`}</button> : null}
      {canCheck ? <button type="button" disabled={readOnly || busy !== null} onClick={() => void perform("check", async () => { const result = await checkOutwardObservation(ventureId, action.id, observation!.id); setLocalObservation(result.contract); })}>{busy === "check" ? "Checking…" : action.state === "observation-failed" ? "Retry return check" : "Check exact return"}</button> : null}
      {!canExecute && !action.executedAt && action.kind !== "deploy" ? <span>This kind is prepared, but no executor adapter is available yet.</span> : null}
      {observation?.revokedAt ? <span>The observation grant was revoked. No further source reads are authorized.</span> : null}
    </footer>
  </section>;
}
