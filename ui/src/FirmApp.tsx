// Firm shell: pick or start a venture, then open the venture workspace — the Cursor-like frame around
// the venture canvas (left index + canvas plane + selection-scoped dock composer). This is the sole
// render root and it is deliberately small: a venture picker and VentureWorkspace.
//
// Desktop only, no mobile layout (AGENTS.md). VentureWorkspace owns its own lens connection; this shell
// holds only the founder-presence heartbeat and the picker/open state.

import { useCallback, useEffect, useState } from "react";
import { markFounderAway, markFounderPresent } from "@/api";
import type { FirmVenture } from "@/api";
import { VenturePicker } from "@/components/firm/VenturePicker";
import { VentureWorkspace } from "@/components/workspace/VentureWorkspace";

export default function FirmApp() {
  const [venture, setVenture] = useState<FirmVenture | null>(null);

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
    setVenture(nextVenture);
  }, []);

  if (!venture) {
    return (
      <div className="firm-app">
        <VenturePicker onOpen={openVenture} />
      </div>
    );
  }

  // `key={venture.id}` forces a full remount on venture switch, so no prior venture's selection, composer
  // draft, or wall queue survives — a stale draft can never submit against the new venture (venture
  // isolation + founder authority).
  return <VentureWorkspace key={venture.id} venture={venture} onOpenVenture={openVenture} />;
}
