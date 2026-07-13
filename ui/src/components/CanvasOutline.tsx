import { Fragment, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ListTree, X } from "lucide-react";
import type { WovenCanvas, WovenRef } from "@/types";
import { buildCanvasOutline, canvasOutlineRefKey, type CanvasOutlineRow } from "@/lib/canvasOutline";
import "@/styles/canvas-outline.css";

function relationshipSummary(row: CanvasOutlineRow): string {
  const parts: string[] = [];
  if (row.incoming) parts.push(`${row.incoming} in`);
  if (row.outgoing) parts.push(`${row.outgoing} out`);
  return parts.join(", ") || "Independent on this canvas";
}

function founderKind(row: CanvasOutlineRow): string {
  if (row.anchor.ref.type === "goal" || row.anchor.kind === "goal") return "Founder goal";
  if (row.anchor.ref.type === "work-artifact") return "Crew work";
  if (row.anchor.ref.type === "product-change") return "Product change";
  if (row.anchor.kind === "outcome") return "What came back";
  if (row.anchor.kind === "question") return "Open question";
  return row.anchor.kind.replace(/[-_]/g, " ");
}

export function CanvasOutline({
  canvas,
  selectedRef,
  onSelect,
  onInspect,
}: {
  canvas: WovenCanvas | null | undefined;
  selectedRef?: WovenRef | null;
  onSelect: (ref: WovenRef) => void;
  onInspect: (ref: WovenRef) => void;
}) {
  const rows = useMemo(() => buildCanvasOutline(canvas), [canvas]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rowRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedKey = selectedRef ? canvasOutlineRefKey(selectedRef) : null;
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, rows.length - 1));

  const focusRow = (index: number) => {
    if (!rows.length) return;
    const next = (index + rows.length) % rows.length;
    setActiveIndex(next);
    rowRefs.current[next]?.focus();
  };

  const onRowKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number, ref: WovenRef) => {
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
      onInspect(ref);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <section className={`canvas-outline ${open ? "open" : ""}`} aria-label="Canvas outline">
      <button
        type="button"
        className="canvas-outline-toggle"
        aria-expanded={open}
        aria-controls="canvas-linear-outline"
        onClick={() => {
          if (!open && selectedKey) {
            const selectedIndex = rows.findIndex((row) => canvasOutlineRefKey(row.anchor.ref) === selectedKey);
            if (selectedIndex >= 0) setActiveIndex(selectedIndex);
          }
          setOpen((value) => !value);
        }}
      >
        <ListTree size={15} aria-hidden="true" />
        Outline
        {rows.length ? <span>{rows.length}</span> : null}
      </button>

      {open ? (
        <div className="canvas-outline-panel" id="canvas-linear-outline">
          <header>
            <div>
              <strong>Canvas outline</strong>
              <span>Linear access to the same canvas</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close canvas outline"><X size={15} /></button>
          </header>
          {rows.length ? (
            <ol aria-label="Canvas items">
              {rows.map((row, index) => {
                const key = canvasOutlineRefKey(row.anchor.ref);
                const selected = key === selectedKey;
                // The kind is a property of the GROUP, not each row. Rows arrive sorted by kind, so we
                // print the label once as a section header when it changes and let every row beneath it
                // inherit it — instead of stamping the same eyebrow on seven identical rows.
                const kind = founderKind(row);
                const startsGroup = index === 0 || founderKind(rows[index - 1]) !== kind;
                const groupCount = startsGroup
                  ? rows.filter((r) => founderKind(r) === kind).length
                  : 0;
                return (
                  <Fragment key={key}>
                    {startsGroup ? (
                      <li className="canvas-outline-group" aria-hidden="true">
                        {kind}
                        {groupCount > 1 ? <span>{groupCount}</span> : null}
                      </li>
                    ) : null}
                    <li>
                      <button
                        type="button"
                        ref={(node) => { rowRefs.current[index] = node; }}
                        tabIndex={index === safeActiveIndex ? 0 : -1}
                        aria-current={selected ? "true" : undefined}
                        aria-label={`${kind}: ${row.anchor.label}`}
                        onFocus={() => setActiveIndex(index)}
                        onClick={() => {
                          setOpen(false);
                          onSelect(row.anchor.ref);
                        }}
                        onDoubleClick={() => {
                          setOpen(false);
                          onInspect(row.anchor.ref);
                        }}
                        onKeyDown={(event) => onRowKeyDown(event, index, row.anchor.ref)}
                      >
                        <strong>{row.anchor.label}</strong>
                        <span>{row.regionTitles.length ? `${row.regionTitles.join(", ")} · ` : ""}{relationshipSummary(row)}</span>
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ol>
          ) : <p className="canvas-outline-empty">Grounded product material will appear here as the canvas fills.</p>}
        </div>
      ) : null}
    </section>
  );
}
