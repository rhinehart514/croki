// Firm shell: return directly to the last active venture, with the first-venture connector as the only
// normal picker path. This is the sole render root and deliberately owns only launch selection and
// founder presence; venture switching and creation live inside VentureWorkspace.
//
// Desktop only, no mobile layout (AGENTS.md). VentureWorkspace owns its own lens connection; this shell
// holds only the founder-presence heartbeat and the picker/open state.

import { useCallback, useEffect, useState } from "react";
import { listVentures, markFounderAway, markFounderPresent } from "@/api";
import type { FirmVenture } from "@/api";
import { VenturePicker } from "@/components/firm/VenturePicker";
import { VentureWorkspace } from "@/components/workspace/VentureWorkspace";
import { readActiveVentureId, rememberActiveVenture } from "@/lib/venture-session";
import "@/styles/firm-app.css";

export default function FirmApp() {
  const [venture, setVenture] = useState<FirmVenture | null>(null);
  const [phase, setPhase] = useState<"opening" | "ready" | "failed">("opening");

  // Distinguish a failed venture read from a genuine first run. Both leave `venture` null; only a real
  // empty list should reach the first-connection picker. A backend hiccup gets its own retryable surface
  // so a transient failure never masquerades as "no ventures yet".
  const openLastVenture = useCallback(() => {
    let live = true;
    listVentures()
      .then(({ ventures }) => {
        if (!live) return;
        const rememberedId = readActiveVentureId();
        const nextVenture = ventures.find((candidate) => candidate.id === rememberedId)
          ?? ventures.at(-1)
          ?? null;
        if (nextVenture) rememberActiveVenture(nextVenture.id);
        setVenture(nextVenture);
        setPhase("ready");
      })
      .catch(() => {
        if (live) setPhase("failed");
      });
    return () => { live = false; };
  }, []);

  useEffect(() => openLastVenture(), [openLastVenture]);

  useEffect(() => {
    const heartbeat = () => { void markFounderPresent().catch(() => undefined); };
    heartbeat();
    const timer = window.setInterval(heartbeat, 15_000);
    const markAway = () => { void markFounderAway().catch(() => undefined); };
    window.addEventListener("pagehide", markAway);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", markAway);
      markAway();
    };
  }, []);

  // A portfolio wall item opens its owning venture; VentureWorkspace resolves the wall context from its
  // own lens poll, so this shell only needs the venture itself.
  const openVenture = useCallback((nextVenture: FirmVenture) => {
    rememberActiveVenture(nextVenture.id);
    setVenture(nextVenture);
  }, []);

  if (phase === "opening") {
    return (
      <div className="firm-app firm-app-opening" aria-busy="true">
        <span role="status">Opening your last venture…</span>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div className="firm-app firm-app-failed">
        <div role="alert">
          <span>Drover</span>
          <h1>Couldn’t reach your ventures</h1>
          <p>This is a local read from Drover that didn’t answer. Your products, work, and evidence are unchanged on this machine.</p>
          <button type="button" onClick={() => { setPhase("opening"); openLastVenture(); }}>Try again</button>
        </div>
      </div>
    );
  }

  if (!venture) {
    return (
      <div className="firm-app">
        <VenturePicker onOpen={openVenture} />
      </div>
    );
  }

  // `key={venture.id}` forces a full remount on venture switch. Each venture restores only its own saved
  // presentation session, so no selection, composer draft, or wall queue can cross the isolation boundary.
  return <VentureWorkspace key={venture.id} venture={venture} onOpenVenture={openVenture} />;
}
