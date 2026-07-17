// The effort reading — a live push read up close: what it is, the drafts staged under it, the crew on
// it, and steering as dialogue. Steer ("make it warmer") and "try another approach" both wire to
// driveTeammate scoped to this bet (api.ts:498); the resulting change arrives through the projection
// poll and re-blooms on the world. Renders the exact snapshot carried on the descended node (the bet,
// drafts, teammates) — no invented fields, no re-fetch.
import { useState, type KeyboardEvent } from "react";
import { driveTeammate } from "@/api";
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import { crewColor, initialFor } from "../../nodes/nodeCrew";

export function EffortReading({
  ventureId,
  node,
  onSteered,
}: {
  ventureId: string;
  node: AtlasNode;
  onSteered: () => void;
}) {
  const data = node.data;
  const bet = data.bet;
  const betId = bet?.id ?? (node.id.startsWith("bet:") ? node.id.slice("bet:".length) : null);
  const teammates = data.teammates ?? [];
  const staged = bet?.staged ?? [];
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const steer = async (goal: string) => {
    const value = goal.trim();
    if (!value || busy || !betId) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await driveTeammate(ventureId, { goal: value, betId });
      setDraft("");
      setNote("Direction received. The world will show what changed.");
      onSteered();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The firm could not take that direction.");
    } finally {
      setBusy(false);
    }
  };

  // "Try another approach" is a deterministic fork: branchFrom seeds a genuinely distinct sibling bet
  // from this effort's parent before the drive begins (work-routes.mjs), so a dashed sibling is
  // guaranteed on the next projection poll. If the branch verb is unavailable (older brain), fall back
  // to the phrased steer so the founder still gets a divergent attempt.
  const branch = async () => {
    if (busy || !betId) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const goal = `Try another approach to ${data.title}`;
    try {
      await driveTeammate(ventureId, { goal, branchFrom: betId });
      setNote("A new approach is branching. It will arrive as a sibling on the world.");
      onSteered();
    } catch (cause) {
      try {
        await driveTeammate(ventureId, { goal, betId });
        setNote("A new approach is on the way. It will arrive on the world.");
        onSteered();
      } catch {
        setError(cause instanceof Error ? cause.message : "The firm could not branch this effort.");
      }
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void steer(draft);
    }
  };

  return (
    <div className="iw-reading iw-reading-effort">
      {/* The archetype kicker lives in the descend header (breadcrumb root); the serif title is the
          single headline here, so no mono restatement of it above. */}
      <h2 className="iw-reading-title">{data.title}</h2>
      <div className="iw-reading-state" data-tone={data.effortTone === "needs" ? "needs" : "live"}>
        <span className="iw-reading-state-dot" />
        {data.stateLabel ?? "Underway"}
      </div>
      {data.statement ? (
        <section className="iw-reading-sec">
          <div className="iw-reading-sk">What this is</div>
          <p className="iw-reading-p">{data.statement}</p>
        </section>
      ) : null}

      {staged.length ? (
        <section className="iw-reading-sec">
          <div className="iw-reading-sk">Drafts · {staged.length}, named by what they are</div>
          {staged.map((artifact, index) => (
            <article key={artifact.id ?? index} className="iw-draft">
              <div className="iw-draft-k">Draft · not yet sent</div>
              <div className="iw-draft-t">{artifact.title ?? `Draft ${index + 1}`}</div>
              {typeof artifact.content === "string" ? <div className="iw-draft-b">{artifact.content}</div> : null}
            </article>
          ))}
        </section>
      ) : null}

      {teammates.length ? (
        <section className="iw-reading-sec">
          <div className="iw-reading-sk">On it</div>
          <div className="iw-reading-crew">
            {teammates.map((mate) => (
              <div key={mate.ref} className="iw-reading-crew-row">
                <span className="iw-face" style={{ ["--face-color" as string]: crewColor(mate.ref) }}>
                  {initialFor(mate.name || mate.ref)}
                </span>
                <span className="iw-reading-crew-name">{mate.name || mate.ref}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="iw-reading-sec">
        <div className="iw-reading-sk">Steer this, in words</div>
        <textarea
          className="iw-reading-steer"
          rows={2}
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setError(null); setNote(null); }}
          onKeyDown={onKeyDown}
          placeholder="Refine it — “make the note warmer”, “lead with the missed-appointment angle”…"
          aria-label="Steer this effort"
          disabled={busy || !betId}
        />
        <div className="iw-reading-actions">
          <button type="button" className="iw-reading-btn" data-kind="steer" onClick={() => void steer(draft)} disabled={busy || !draft.trim() || !betId}>
            {busy ? "Sending…" : "Send this direction"}
          </button>
          <button
            type="button"
            className="iw-reading-btn"
            data-kind="branch"
            onClick={() => void branch()}
            disabled={busy || !betId}
          >
            Try another approach
          </button>
        </div>
      </section>
      {note ? <p className="iw-reading-hint" role="status">{note}</p> : null}
      {error ? <p className="iw-reading-error" role="alert">{error}</p> : null}
    </div>
  );
}
