// Firm shell: pick or start a venture, then open the lens over crew, bets, outcomes, and the wall.
// This is the sole render root. Deliberately small:
// a venture picker, FirmLens, a minimal drive form (give a teammate a goal), and a per-bet event feed
// read straight off bet.events.
//
// Desktop only, no mobile layout (AGENTS.md). CrewFace is the only teammate portrait door (DESIGN.md).

import { useCallback, useEffect, useState } from "react";
import {
  createVenture,
  driveTeammate,
  getFounderSession,
  getLens,
  listVentures,
  markFounderAway,
  markFounderPresent,
  type FirmVenture,
} from "@/api";
import type { FirmLens as FirmLensPayload } from "@/types";
import { FirmLens } from "@/components/lens/FirmLens";
import { FirmHeatControl } from "@/components/firm/FirmHeatControl";
import { FounderSessionUnlock } from "@/components/FounderSessionUnlock";
import { CrewFace } from "@/components/crew/CrewFace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import "@/styles/firm-app.css";

function VenturePicker({ onOpen, requestFounderAction }: {
  onOpen: (ventureId: string) => void;
  requestFounderAction: (run: () => Promise<void>) => Promise<void>;
}) {
  const [ventures, setVentures] = useState<FirmVenture[] | null>(null);
  const [name, setName] = useState("");
  const [repository, setRepository] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listVentures().then((res) => { if (live) setVentures(res.ventures); }).catch(() => { if (live) setVentures([]); });
    return () => { live = false; };
  }, []);

  const submit = async () => {
    const trimmed = name.trim();
    const trimmedRepository = repository.trim();
    if (!trimmed || !trimmedRepository || busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestFounderAction(async () => {
        const { venture } = await createVenture(trimmed, trimmedRepository);
        onOpen(venture.id);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start that venture.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="firm-app-picker">
      <div className="firm-app-picker-head">
        <h1>Drover</h1>
        <span>A portfolio of isolated machines behind one wall.</span>
      </div>

      {ventures === null ? (
        <p className="firm-app-picker-loading">Loading your ventures…</p>
      ) : ventures.length === 0 ? (
        <p className="firm-app-picker-empty">No ventures yet — start the first one below.</p>
      ) : (
        <ul className="firm-app-picker-list">
          {ventures.map((venture) => (
            <li key={venture.id}>
              <button type="button" onClick={() => onOpen(venture.id)}>
                <strong>{venture.name}</strong>
                <span>Started {new Date(venture.createdAt).toLocaleDateString()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="firm-app-picker-create" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name a new venture"
          aria-label="New venture name"
        />
        <Input
          value={repository}
          onChange={(event) => setRepository(event.target.value)}
          placeholder="Product repository path"
          aria-label="Product repository path"
        />
        <Button type="submit" disabled={busy || !name.trim() || !repository.trim()}>{busy ? "Starting…" : "Start venture"}</Button>
      </form>
      {error ? <p role="alert" className="firm-app-picker-error">{error}</p> : null}
    </div>
  );
}

// The minimum honest drive affordance: name a teammate, state a goal, POST it. driveTeammate() itself
// ensures the teammate's soul exists (work-loop.mjs) — there is no separate "hire" step to build here.
function DriveForm({ ventureId, onDriven }: { ventureId: string; onDriven: () => void }) {
  const [teammateRef, setTeammateRef] = useState("");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const submit = async () => {
    const ref = teammateRef.trim();
    const trimmedGoal = goal.trim();
    if (!ref || !trimmedGoal || busy) return;
    setBusy(true);
    setError(null);
    try {
      await driveTeammate(ventureId, { teammateRef: ref, goal: trimmedGoal });
      setGoal("");
      setOpen(false);
      onDriven();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That drive did not start.");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className="firm-app-drive-toggle" onClick={() => setOpen(true)}>
        <CrewFace agentRef={teammateRef || "new-teammate"} size={20} />
        Give the crew a goal
      </button>
    );
  }

  return (
    <form className="firm-app-drive-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <Input
        value={teammateRef}
        onChange={(event) => setTeammateRef(event.target.value)}
        placeholder="Teammate (e.g. outreach-writer)"
        aria-label="Teammate ref"
        autoFocus
      />
      <Textarea
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        placeholder="What should they try?"
        aria-label="Goal"
        rows={3}
      />
      <div className="firm-app-drive-actions">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
        <Button type="submit" disabled={busy || !teammateRef.trim() || !goal.trim()}>{busy ? "Starting…" : "Drive"}</Button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}

// A per-bet event feed, read straight from bet.events — the honest minimum conversation surface for
// tonight (the full Firm input re-point onto the F2 event vocabulary is separate work). No speaker
// segmentation, no crew beats: just the flat log, newest last, grouped by which bet it happened on.
function EventFeed({ lens }: { lens: FirmLensPayload }) {
  const withEvents = lens.bets.filter((bet) => (bet.events?.length ?? 0) > 0);
  if (withEvents.length === 0) {
    return <p className="firm-app-feed-empty">Nothing has happened yet — give the crew a goal to start the loop.</p>;
  }
  return (
    <div className="firm-app-feed">
      {withEvents.map((bet) => (
        <div key={bet.id} className="firm-app-feed-bet">
          <strong>{bet.intent}</strong>
          <ul>
            {(bet.events ?? []).slice(-8).map((event, index) => (
              <li key={`${bet.id}-${index}`}>
                <span className="firm-app-feed-type">{event.type}</span>
                {event.detail ? <span>{event.detail}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function FirmApp() {
  const [ventureId, setVentureId] = useState<string | null>(null);
  const [lens, setLens] = useState<FirmLensPayload | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [founderAuthenticated, setFounderAuthenticated] = useState<boolean | null>(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let live = true;
    getFounderSession().then((session) => { if (live) setFounderAuthenticated(session.authenticated); }).catch(() => { if (live) setFounderAuthenticated(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (founderAuthenticated !== true) return;
    const heartbeat = () => { void markFounderPresent(); };
    heartbeat();
    const timer = window.setInterval(heartbeat, 15_000);
    const markAway = () => { void markFounderAway(); };
    window.addEventListener("pagehide", markAway);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", markAway);
      markAway();
    };
  }, [founderAuthenticated]);

  // A founder-controlled action (starting a venture) either runs immediately when already authenticated, or
  // parks itself to re-run the moment the unlock prompt succeeds — mirrors Firm shell's own
  // requestFounderAction pattern, trimmed to this shell's one use.
  const requestFounderAction = useCallback((run: () => Promise<void>): Promise<void> => {
    if (founderAuthenticated === true) return run();
    setPendingAction(() => run);
    setUnlockOpen(true);
    return Promise.resolve();
  }, [founderAuthenticated]);

  const handleUnlocked = useCallback(() => {
    setFounderAuthenticated(true);
    setUnlockOpen(false);
    const run = pendingAction;
    setPendingAction(null);
    if (run) void run();
  }, [pendingAction]);

  // Refresh the lens once, right after a drive starts — FirmLens's own poll otherwise carries it, this
  // just avoids waiting out a full idle tick to see the first fork/event land.
  const refreshLens = useCallback(() => {
    if (!ventureId) return;
    void getLens(ventureId).then((res) => setLens(res.lens));
  }, [ventureId]);

  useEffect(() => {
    if (!ventureId) return;
    void getLens(ventureId).then((res) => setLens(res.lens));
  }, [ventureId]);

  if (!ventureId) {
    return (
      <div className="firm-app">
        <VenturePicker onOpen={setVentureId} requestFounderAction={requestFounderAction} />
        {unlockOpen ? (
          <div className="firm-app-unlock-scrim">
            <FounderSessionUnlock onUnlocked={handleUnlocked} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="firm-app firm-app-open">
      <header className="firm-app-header">
        <button type="button" className="firm-app-back" onClick={() => { setVentureId(null); setLens(null); }}>
          ← Ventures
        </button>
        <DriveForm ventureId={ventureId} onDriven={refreshLens} />
        <FirmHeatControl ventureId={ventureId} requestFounderAction={requestFounderAction} />
        <button type="button" className="firm-app-feed-toggle" onClick={() => setFeedOpen((value) => !value)} aria-expanded={feedOpen}>
          {feedOpen ? "Hide activity" : "Show activity"}
        </button>
      </header>

      <div className="firm-app-body">
        <FirmLens ventureId={ventureId} />
        {feedOpen && lens ? (
          <aside className="firm-app-feed-panel" aria-label="Bet activity">
            <EventFeed lens={lens} />
          </aside>
        ) : null}
      </div>

      {unlockOpen ? (
        <div className="firm-app-unlock-scrim">
          <FounderSessionUnlock onUnlocked={handleUnlocked} />
        </div>
      ) : null}
    </div>
  );
}
