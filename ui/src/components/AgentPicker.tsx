import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { Collapse, Reveal } from "@/lib/motion";
// The engine + model catalog lives in a non-component sibling module so this file only exports
// components (fast-refresh requires that). ComposerDock imports the model helpers from there too.
import { ENGINES, MODELS, modelById, type Engine, type Model } from "@/components/agent-picker-models";

function Logo({ engine, brand, size = 14 }: { engine: Engine; brand?: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={brand ? { color: engine.brand } : undefined}>
      <path d={engine.path} fill="currentColor" />
    </svg>
  );
}

function ModelRow({ model, selected, onPick, withLogo }: { model: Model; selected: boolean; onPick: () => void; withLogo?: boolean }) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      className={`agent-picker-model ${withLogo ? "with-logo" : ""} ${selected ? "selected" : ""}`}
      onClick={onPick}
    >
      {withLogo ? <span className="agent-picker-rowlogo"><Logo engine={ENGINES[model.agent]} brand size={12} /></span> : null}
      <span className="agent-picker-model-label">{model.label}</span>
      <span className="agent-picker-model-note">{model.note}</span>
      {model.preview ? <span className="agent-picker-preview">Preview</span> : null}
      {selected ? <Check size={14} className="agent-picker-check" aria-hidden="true" /> : null}
    </button>
  );
}

// The engine+model selector in the composer bar. The menu groups primary models under their engine
// (Claude / Codex), each headed by its brand mark; a "More models" disclosure springs open the
// preview/secondary models without scrolling. Motion uses the product primitives: Reveal (the menu,
// spring-from-origin) and Collapse (the More section, height spring).
export function AgentPicker({ value, onChange }: { value: string; onChange: (modelId: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = modelById(value);
  // open the More section by default when the current selection lives in it, so the check is visible
  const [moreOpen, setMoreOpen] = useState(current.tier === "more");
  // The menu renders in a body portal so the dock's overflow:hidden can't clip it, and is anchored
  // ABOVE the trigger (the composer sits low on screen) so it never opens off-screen or scrolls.
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const currentEngine = ENGINES[current.agent];
  const moreModels = MODELS.filter((m) => m.tier === "more");

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = triggerRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, bottom: window.innerHeight - r.top + 8 });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".agent-picker-portal") || t.closest(".agent-picker")) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  const pick = (id: string) => { onChange(id); setOpen(false); };

  return (
    <div className="agent-picker">
      <button
        ref={triggerRef}
        type="button"
        className={`agent-picker-trigger ${open ? "open" : ""}`}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${currentEngine.name} · ${current.label} — ${currentEngine.meta}`}
      >
        <Logo engine={currentEngine} />
        <span className="agent-picker-name">{current.label}</span>
        <ChevronDown size={12} className="agent-picker-chev" aria-hidden="true" />
      </button>
      {pos ? createPortal(
        <div className="agent-picker-portal" style={{ left: pos.left, bottom: pos.bottom }}>
          <Reveal open={open} className="menu agent-picker-menu" role="menu" origin="bottom-left">
            {(Object.values(ENGINES)).map((engine) => (
              <div className="agent-picker-group" key={engine.id}>
                <div className="agent-picker-group-head">
                  <span className="agent-picker-logo"><Logo engine={engine} brand size={13} /></span>
                  <span className="agent-picker-group-name">{engine.name}</span>
                  <span className="agent-picker-group-meta">{engine.meta}</span>
                </div>
                {MODELS.filter((m) => m.agent === engine.id && m.tier === "primary").map((m) => (
                  <ModelRow key={m.id} model={m} selected={m.id === value} onPick={() => pick(m.id)} />
                ))}
              </div>
            ))}
            {/* More models — a disclosure, so the default menu never needs to scroll */}
            <div className="agent-picker-more-wrap">
              <button
                type="button"
                className={`agent-picker-more-toggle ${moreOpen ? "open" : ""}`}
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
              >
                <ChevronDown size={13} className="agent-picker-more-chev" aria-hidden="true" />
                {moreOpen ? "Fewer models" : "More models"}
              </button>
              <Collapse open={moreOpen}>
                <div className="agent-picker-more">
                  {moreModels.map((m) => (
                    <ModelRow key={m.id} model={m} selected={m.id === value} onPick={() => pick(m.id)} withLogo />
                  ))}
                </div>
              </Collapse>
            </div>
          </Reveal>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
