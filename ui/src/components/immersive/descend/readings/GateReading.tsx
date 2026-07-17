// The gate reading — the one act that touches the world, read up close before your hand decides.
// Renders the EXACT staged payload via the real effect interpreter (reviewContent, api effect shape),
// and release/hold as DIALOGUE — no accept/reject buttons. The founder tells the firm what to do in
// words ("send it" / "hold it"), a text field submits, and code (never a model) reads those words into
// a decision: the gate is a consequence boundary, so the mapping must be legible and testable. Deploy
// effects require TWO explicit words: "authorize" THEN "send it" (CONTRACT 1.3 / architecture §3) — a
// release word before the deploy is armed is refused with a nudge, never silently sent. Wires straight
// to decideWallItem (api.ts:460).
import { useState } from "react";
import { decideWallItem, type WallQueueItemView } from "@/api";
import { reviewContent } from "@/components/lens/wallReviewContent";
import { interpretGateWords } from "./gateWords";

export function GateReading({
  ventureId,
  item,
  onDecided,
}: {
  ventureId: string;
  item: WallQueueItemView;
  onDecided: () => void;
}) {
  const content = reviewContent(item);
  const isDeploy = String(item.effect.kind ?? "").toLowerCase() === "deploy";
  const [authorized, setAuthorized] = useState<boolean>(Boolean(item.deployAuthorizedAt));
  const [busy, setBusy] = useState<null | "authorize" | "release" | "hold">(null);
  const [error, setError] = useState<string | null>(null);
  const [say, setSay] = useState("");

  const decide = async (
    action: "authorize" | "release" | "hold",
    decision: "authorize-deploy" | "release" | "reject",
    note?: string,
  ) => {
    if (busy) return;
    setBusy(action);
    setError(null);
    try {
      await decideWallItem(ventureId, item.id, { decision, note });
      if (action === "authorize") { setAuthorized(true); setSay(""); }
      else onDecided();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The firm could not record that decision.");
    } finally {
      setBusy(null);
    }
  };

  const submitWords = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const intent = interpretGateWords(say);
    if (intent === "unknown") {
      setError("Say it in words — “send it” to release, or “hold it” to keep it here.");
      return;
    }
    if (intent === "authorize") {
      if (!isDeploy) { setError("Nothing to arm here — just say “send it” or “hold it”."); return; }
      void decide("authorize", "authorize-deploy");
      return;
    }
    if (intent === "hold") {
      void decide("hold", "reject", say.trim() || "Held by the founder for now.");
      return;
    }
    // release
    if (isDeploy && !authorized) { setError("Arm the deploy first — say “authorize”, then “send it”."); return; }
    if (!content.releaseReady) { setError("This isn’t ready to leave yet."); return; }
    void decide("release", "release", say.trim() || undefined);
  };

  return (
    <div className="iw-reading iw-reading-gate">
      <div className="iw-reading-eyebrow" data-tone="needs">{content.eyebrow}</div>
      <h2 className="iw-reading-title">{content.title}</h2>
      <p className="iw-reading-why">{content.why}</p>

      <div className="iw-payload" aria-label="Exactly what would happen">
        {content.details.map((detail) => (
          <div key={detail.label} className="iw-payload-row" data-tone={detail.tone ?? "plain"}>
            <div className="iw-payload-label">{detail.label}</div>
            <div className="iw-payload-value">{detail.value}</div>
          </div>
        ))}
      </div>

      <div className="iw-reading-note" data-tone="needs">
        <span className="iw-reading-note-k">Your call, in words</span>
        This is not an approval form. Read exactly what would happen, then tell the firm to release it or
        to hold it. The firm remembers what you allow.
        {isDeploy ? " A deploy needs two words: authorize it, then send it." : ""}
      </div>

      <form className="iw-reading-dialogue" onSubmit={submitWords}>
        <div className="iw-reading-say-row" data-armed={isDeploy && authorized ? "true" : undefined}>
          <input
            className="iw-reading-say"
            data-kind="gate-say"
            type="text"
            autoComplete="off"
            value={say}
            onChange={(event) => { setSay(event.target.value); if (error) setError(null); }}
            placeholder={isDeploy && !authorized ? "Say “authorize” to arm the deploy…" : "Tell your venture — “send it” or “hold it”…"}
            aria-label="Tell your venture what to do — send it or hold it"
            disabled={busy !== null}
          />
          <button type="submit" className="iw-reading-say-go" disabled={busy !== null || !say.trim()} aria-label="Tell your venture">
            {busy ? "…" : "→"}
          </button>
        </div>
        <p className="iw-reading-say-hint" role="note">
          {isDeploy
            ? (authorized ? "Deploy armed. Say “send it” to release, or “hold it”." : "A deploy needs two words: “authorize”, then “send it”.")
            : "Say “send it” to release, or “hold it” to keep it here."}
        </p>
      </form>
      {error ? <p className="iw-reading-error" role="alert">{error}</p> : null}
    </div>
  );
}
