import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapse } from "@/lib/motion";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

function ModelRow({ model, selected, withLogo }: { model: Model; selected: boolean; withLogo?: boolean }) {
  return (
    <DropdownMenuRadioItem
      value={model.id}
      closeOnClick
      className={`agent-picker-model ${withLogo ? "with-logo" : ""} ${selected ? "selected" : ""}`}
    >
      {withLogo ? <span className="agent-picker-rowlogo"><Logo engine={ENGINES[model.agent]} brand size={12} /></span> : null}
      <span className="agent-picker-model-label">{model.label}</span>
      <span className="agent-picker-model-note">{model.note}</span>
      {model.preview ? <span className="agent-picker-preview">Preview</span> : null}
    </DropdownMenuRadioItem>
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
  const currentEngine = ENGINES[current.agent];
  const moreModels = MODELS.filter((m) => m.tier === "more");

  return (
    <div className="agent-picker">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          className={`agent-picker-trigger ${open ? "open" : ""}`}
          title={`${currentEngine.name} · ${current.label} — ${currentEngine.meta}`}
        >
          <Logo engine={currentEngine} />
          <span className="agent-picker-name">{current.label}</span>
          <ChevronDown size={12} className="agent-picker-chev" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={8} className="menu agent-picker-menu w-auto">
          <DropdownMenuRadioGroup value={value} onValueChange={(id) => onChange(String(id))}>
            {(Object.values(ENGINES)).map((engine) => (
              <div className="agent-picker-group" key={engine.id}>
                <div className="agent-picker-group-head">
                  <span className="agent-picker-logo"><Logo engine={engine} brand size={13} /></span>
                  <span className="agent-picker-group-name">{engine.name}</span>
                  <span className="agent-picker-group-meta">{engine.meta}</span>
                </div>
                {MODELS.filter((m) => m.agent === engine.id && m.tier === "primary").map((m) => (
                  <ModelRow key={m.id} model={m} selected={m.id === value} />
                ))}
              </div>
            ))}
            {/* More models — a disclosure, so the default menu never needs to scroll */}
            <div className="agent-picker-more-wrap">
              <DropdownMenuItem
                className={`agent-picker-more-toggle ${moreOpen ? "open" : ""}`}
                closeOnClick={false}
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
              >
                <ChevronDown size={13} className="agent-picker-more-chev" aria-hidden="true" />
                {moreOpen ? "Fewer models" : "More models"}
              </DropdownMenuItem>
              <Collapse open={moreOpen}>
                <div className="agent-picker-more">
                  {moreModels.map((m) => (
                    <ModelRow key={m.id} model={m} selected={m.id === value} withLogo />
                  ))}
                </div>
              </Collapse>
            </div>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
