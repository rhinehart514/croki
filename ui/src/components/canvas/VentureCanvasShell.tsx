// VentureCanvasShell — the bare venture canvas plane plus a docked composer (Phase 4/5 Slice 1). The
// canvas IS the venture (Exp Principle 1). This shell is the standalone plane: it owns one lens
// connection, renders the extracted VentureCanvasStage, and docks a scoped composer.
//
// The framed workspace (VentureWorkspace, mounted at ?shell=canvas) wraps the same VentureCanvasStage
// with a left workspace index and the venture conversation. This shell survives as the minimal
// stage+composer composition its Slice-1 acceptance test asserts.

import { useCallback, useMemo, useState } from "react";
import type { FirmVenture } from "@/api";
import type { FirmLens } from "@/types";
import { useFirmConnection } from "@/hooks/use-firm-connection";
import { type CanvasSelection } from "@/components/firm/directionTarget";
import { NowComposer } from "@/components/now/NowComposer";
import { VentureCanvasStage } from "./VentureCanvasStage";
import "./venture-canvas.css";

export function VentureCanvasShell({ venture }: { venture: FirmVenture }) {
  const { lens, connection, refresh, setLens } = useFirmConnection(venture.id);
  const readOnly = connection.phase === "stale" || connection.phase === "offline";
  const [selection, setSelection] = useState<CanvasSelection>(null);

  const onLensChange = useCallback((next: FirmLens) => { setLens(next); }, [setLens]);

  const scopeLabel = useMemo(() => {
    if (!selection?.betId || !lens) return null;
    const bet = lens.bets.find((candidate) => candidate.id === selection.betId);
    return bet ? bet.intent : null;
  }, [lens, selection]);

  return (
    <div className="venture-canvas" key={venture.id}>
      <VentureCanvasStage
        venture={venture}
        lens={lens}
        readOnly={readOnly}
        selection={selection}
        onSelect={setSelection}
        onLensChange={onLensChange}
        refresh={refresh}
      />
      {lens ? (
        <div className="venture-canvas-composer">
          <NowComposer
            ventureId={venture.id}
            ventureName={venture.name}
            selection={selection}
            scopeLabel={scopeLabel}
            hasWork={lens.bets.length > 0}
            variant="dock"
            readOnly={readOnly}
            autoFocus
            placeholder={scopeLabel ? undefined : "Direct the venture"}
            onClearScope={() => setSelection(null)}
            onDriven={() => refresh()}
          />
        </div>
      ) : null}
    </div>
  );
}
