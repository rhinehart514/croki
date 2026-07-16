// FirmLensOutline.tsx — keyboard + outline access for the lens, over crew/bet anchors instead of the
// woven canvas's closed vocabulary. Reuses CanvasOutline.tsx's roving-tabindex interaction pattern
// (arrow/home/end/enter/escape); desktop-only, so no mobile branch (AGENTS.md: Drover judges desktop
// only).

import { Fragment, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ListTree, X } from "lucide-react";
import { buildLensOutline, type LensOutlineRow } from "./lensOutline";
import type { FirmBet, FirmConfiguration, FirmCrewMember } from "@/types";
import type { LensAnchorKey } from "@/lib/lensLayout";
import type { WorkyardCard } from "./workyardProjection";
import "@/styles/firm-lens-outline.css";

export function FirmLensOutline({
  crew,
  bets,
  configuration,
  selectedKey,
  selectedWorkRef,
  workByBet,
  onInspect,
  onSelectWork,
}: {
  crew: FirmCrewMember[];
  bets: FirmBet[];
  configuration?: FirmConfiguration;
  selectedKey?: LensAnchorKey | null;
  selectedWorkRef?: string | null;
  workByBet?: ReadonlyMap<string, WorkyardCard[]>;
  onInspect: (anchorKey: LensAnchorKey) => void;
  onSelectWork?: (betId: string, workRef: string) => void;
}) {
  const rows = useMemo(() => buildLensOutline(crew, bets, configuration, workByBet), [crew, bets, configuration, workByBet]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, rows.length - 1));

  const focusRow = (index: number) => {
    if (!rows.length) return;
    const next = (index + rows.length) % rows.length;
    setActiveIndex(next);
    rowRefs.current[next]?.focus();
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number, row: LensOutlineRow) => {
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      focusRow(index + 1);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      focusRow(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusRow(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusRow(rows.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      setOpen(false);
      if (row.betId && row.workRef) onSelectWork?.(row.betId, row.workRef);
      else onInspect(row.anchorKey);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <section className={`firm-lens-outline ${open ? "open" : ""}`} aria-label="Firm outline">
      <button
        type="button"
        className="firm-lens-outline-toggle"
        aria-expanded={open}
        aria-controls={open ? "firm-lens-outline-panel" : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <ListTree size={15} aria-hidden="true" />
        Outline
        {rows.length ? <span>{rows.length}</span> : null}
      </button>

      {open ? (
        <div className="firm-lens-outline-panel" id="firm-lens-outline-panel">
          <header>
            <div>
              <strong>Firm outline</strong>
              <span>Crew, current directions, exact work, and founder decisions</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close firm outline"><X size={15} /></button>
          </header>
          {rows.length ? (
            <ol aria-label="Crew, current directions, and exact work">
              {rows.map((row, index) => {
                const selected = row.workRef ? row.workRef === selectedWorkRef : row.anchorKey === selectedKey && !selectedWorkRef;
                const startsGroup = index === 0 || rows[index - 1].group !== row.group;
                return (
                  <Fragment key={row.id}>
                    {startsGroup ? <li className="firm-lens-outline-group" aria-hidden="true">{row.group}</li> : null}
                    <li>
                      <button
                        type="button"
                        ref={(node) => { rowRefs.current[index] = node; }}
                        tabIndex={index === safeActiveIndex ? 0 : -1}
                        aria-current={selected ? "true" : undefined}
                        aria-label={`${row.group}: ${row.label}`}
                        data-depth={row.depth}
                        onFocus={() => setActiveIndex(index)}
                        onClick={() => {
                          setOpen(false);
                          if (row.betId && row.workRef) onSelectWork?.(row.betId, row.workRef);
                          else onInspect(row.anchorKey);
                        }}
                        onKeyDown={(event) => onRowKeyDown(event, index, row)}
                      >
                        <strong>{row.label}</strong>
                        <span>{row.detail}</span>
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ol>
          ) : <p className="firm-lens-outline-empty">The crew hasn't begun any work yet.</p>}
        </div>
      ) : null}
    </section>
  );
}
