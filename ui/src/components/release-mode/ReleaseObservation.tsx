import { useState } from "react";
import type { ObservationContract, ReleaseDetail } from "@/api";

function localInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function sentMessageCount(release: ReleaseDetail) {
  return release.decisions.filter((decision) => decision.releasedAt && ((decision.executionResult as Record<string, unknown> | undefined)?.messageId || (decision.executionResult as Record<string, unknown> | undefined)?.providerMessageId)).length;
}

function describeResult(contract: ObservationContract) {
  if (!contract.lastResult) return "Not checked yet";
  const count = contract.lastResult.ingested?.length ?? 0;
  if (count) return `${count} attributable ${count === 1 ? "return" : "returns"} recorded`;
  return contract.lastResult.reason ?? "Checked · no returned evidence yet";
}

export function ReleaseObservation({ release, readOnlyReason, onGrant, onCheck, onRevoke, onReconnect }: {
  release: ReleaseDetail;
  readOnlyReason: string | null;
  onGrant: (value: { source: "gmail"; purpose: string; startsAt: string; endsAt: string; returnConditions: string[] }) => Promise<void>;
  onCheck: (contractId: string) => Promise<void>;
  onRevoke: (contractId: string) => Promise<void>;
  onReconnect: () => void;
}) {
  const [openedAt] = useState(() => Date.now());
  const newest = release.observations?.[0] ?? null;
  const active = newest && !newest.revokedAt && Date.parse(newest.endsAt) >= openedAt ? newest : null;
  const [purpose, setPurpose] = useState("Capture replies and objections attributable to this release.");
  const [startsAt, setStartsAt] = useState(() => localInput(new Date(openedAt)));
  const [endsAt, setEndsAt] = useState(() => localInput(new Date(openedAt + 14 * 86_400_000)));
  const [condition, setCondition] = useState("A reply, objection, bounce, or the observation window closing");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceCount = sentMessageCount(release);
  const unavailable = readOnlyReason ?? (!sourceCount ? "Release one real Gmail action first. Observation cannot infer a source." : null);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(null); try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } finally { setBusy(false); } };

  return <section className="release-observation" aria-labelledby="release-observation-title">
    <header><div><span>Bounded observation</span><h2 id="release-observation-title">Watch only what this release authorized</h2></div><p>Read-only · release-scoped · no sends, spend, or interpretation changes</p></header>
    {active ? <div className="release-observation-contract">
      <dl><div><dt>Source</dt><dd>Gmail · {active.messageIds.length} exact sent {active.messageIds.length === 1 ? "message" : "messages"}</dd></div><div><dt>Window</dt><dd>{new Date(active.startsAt).toLocaleString()} → {new Date(active.endsAt).toLocaleString()}</dd></div><div><dt>Return when</dt><dd>{active.returnConditions.join(" · ")}</dd></div><div><dt>Last check</dt><dd>{describeResult(active)}</dd></div></dl>
      {active.lastResult?.needsReconnect ? <button type="button" onClick={onReconnect}>Reconnect Gmail</button> : null}
      <div><button type="button" disabled={busy || Boolean(readOnlyReason)} onClick={() => void run(() => onCheck(active.id))}>Check now</button><button type="button" disabled={busy || Boolean(readOnlyReason)} onClick={() => void run(() => onRevoke(active.id))}>Revoke observation</button></div>
    </div> : <form onSubmit={(event) => { event.preventDefault(); void run(() => onGrant({ source: "gmail", purpose, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), returnConditions: [condition] })); }}>
      <label>Purpose<input value={purpose} onChange={(event) => setPurpose(event.target.value)} /></label>
      <div><label>Starts<input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></label><label>Ends<input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label></div>
      <label>Return when<input value={condition} onChange={(event) => setCondition(event.target.value)} /></label>
      {unavailable ? <p role="status">{unavailable}</p> : <p>{sourceCount} exact released Gmail {sourceCount === 1 ? "message is" : "messages are"} in scope. Nothing else will be read.</p>}
      <button type="submit" disabled={busy || Boolean(unavailable) || !purpose.trim() || !condition.trim()}>Authorize observation</button>
    </form>}
    {error ? <p className="release-observation-error" role="alert">{error}</p> : null}
  </section>;
}
