// The @-mention popover — the Notion-style menu that opens when the founder types "@" in the composer. It
// renders a ranked roster split into two sections, Teammates (crew faces) and Capabilities (brand marks,
// with a GATED tag on the ones that reach the outside world), and it is keyboard-driven: arrow keys move
// the highlight, Enter picks, Escape closes. The parent owns detection and ranking (see lib/mention.ts) and
// hands this component the already-ranked results; this component owns only selection + navigation, and
// calls back onPick / onClose. It renders inside a positioned wrapper the parent supplies — see the mock's
// `.mention` popover, anchored above the input.

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Wrench } from "lucide-react";
import { CrewFace } from "@/components/crew/CrewFace";
import { CapabilityGlyph } from "@/components/CapabilityGlyph";
import type { MentionEntity } from "@/lib/mention";
import "@/styles/composer-mention.css";

export function MentionMenu({
  query,
  results,
  onPick,
  onClose,
  className,
  style,
}: {
  query: string;
  results: MentionEntity[];
  onPick: (entity: MentionEntity) => void;
  onClose: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  // Render order = Teammates section, then Capabilities section — and keyboard nav walks that same flat
  // order, so the highlight never jumps between what the eye sees and what Enter picks.
  const { teammates, capabilities, ordered } = useMemo(() => {
    const teammates = results.filter((e) => e.kind === "agent");
    const capabilities = results.filter((e) => e.kind === "capability");
    return { teammates, capabilities, ordered: [...teammates, ...capabilities] };
  }, [results]);

  const [active, setActive] = useState(0);

  // Reset the highlight to the top whenever the result set changes (the founder typed another character),
  // so the strongest match is always pre-selected. Keying on the first id + length catches both a reorder
  // and a resize of the list. Done during render by comparing the key held in state — the pattern React
  // endorses for deriving state from props — so there is no extra paint of a stale highlight.
  const resultKey = `${ordered.length}:${ordered[0]?.kind ?? ""}:${ordered[0]?.id ?? ""}`;
  const [seenKey, setSeenKey] = useState(resultKey);
  if (seenKey !== resultKey) {
    setSeenKey(resultKey);
    setActive(0);
  }

  // Keyboard navigation. A capture-phase listener on the document lets the popover intercept the arrow keys
  // before the textarea moves its caret, so navigating the menu never scrolls the text. It re-binds when
  // `active` changes so Enter always reads the current selection — no stale closure, no ref during render.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (ordered.length === 0) return;
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActive((i) => (i + 1) % ordered.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setActive((i) => (i - 1 + ordered.length) % ordered.length);
          break;
        case "Enter":
        case "Tab": {
          e.preventDefault();
          const picked = ordered[active];
          if (picked) onPick(picked);
          break;
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [ordered, active, onPick, onClose]);

  // Keep the highlighted row scrolled into view as the highlight moves.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    row?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const indexOf = (entity: MentionEntity) => ordered.indexOf(entity);

  return (
    <div className={className ? `mention ${className}` : "mention"} style={style} role="listbox" aria-label="Mention a teammate or capability">
      <div className="mention-q">
        <span className="at">@</span>
        <span className="q">{query}</span>
      </div>

      {ordered.length === 0 ? (
        <div className="mention-empty">No teammate or capability matches “{query}”.</div>
      ) : (
        <div className="mention-list" ref={listRef}>
          {teammates.length > 0 && (
            <>
              <div className="mention-sec">Teammates</div>
              {teammates.map((entity) => (
                <MentionRow
                  key={`a:${entity.id}`}
                  entity={entity}
                  active={indexOf(entity) === active}
                  onPick={onPick}
                  onHover={() => setActive(indexOf(entity))}
                />
              ))}
            </>
          )}
          {capabilities.length > 0 && (
            <>
              <div className="mention-sec">Capabilities</div>
              {capabilities.map((entity) => (
                <MentionRow
                  key={`c:${entity.id}`}
                  entity={entity}
                  active={indexOf(entity) === active}
                  onPick={onPick}
                  onHover={() => setActive(indexOf(entity))}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MentionRow({
  entity,
  active,
  onPick,
  onHover,
}: {
  entity: MentionEntity;
  active: boolean;
  onPick: (entity: MentionEntity) => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "mention-row on" : "mention-row"}
      role="option"
      aria-selected={active}
      data-active={active}
      onMouseMove={onHover}
      // onMouseDown, not onClick — the textarea keeps focus, and mousedown fires before the blur that a
      // click would trigger, so the pick lands without the input losing focus first.
      onMouseDown={(e) => {
        e.preventDefault();
        onPick(entity);
      }}
    >
      {entity.kind === "agent" ? (
        <CrewFace
          agentRef={entity.ref}
          family={entity.family}
          monogram={entity.monogram}
          size={26}
        />
      ) : (
        <span className="mention-mark">
          {/* A LIVE connected tool has no brand mark — it draws a generic tool glyph. A suggested brand
              capability draws its real logo. */}
          {entity.cap ? <CapabilityGlyph cap={entity.cap} size={15} /> : <Wrench size={14} aria-hidden />}
          {entity.gated && <span className="g" />}
        </span>
      )}
      <span className="rb">
        <span className="rn">{entity.label}</span>
        <span className="rr">{entity.blurb}</span>
      </span>
      {entity.kind === "capability" && entity.gated && <span className="tag">GATED</span>}
    </button>
  );
}
