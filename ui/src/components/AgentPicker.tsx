import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { siClaude } from "simple-icons";
import { Collapse, Reveal } from "@/lib/motion";

// The two engines the operator can run on, and the model within each. Claude is the founder's
// subscription (claude-code runtime); Codex is OpenAI's coding agent (the runtime's reserved slot).
// The Claude mark is the canonical simple-icons brand path; OpenAI is trademark-excluded from
// simple-icons, so its official mark is inlined here.
const OPENAI_PATH =
  "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.6069 1.4997-2.602-1.4997z";

export type AgentId = "claude" | "codex";

type Engine = { id: AgentId; name: string; meta: string; path: string; brand: string };

export const ENGINES: Record<AgentId, Engine> = {
  claude: { id: "claude", name: "Claude", meta: "Your subscription", path: siClaude.path, brand: `#${siClaude.hex}` },
  codex: { id: "codex", name: "Codex", meta: "OpenAI", path: OPENAI_PATH, brand: "#0B0B0C" },
};

export type Model = { id: string; agent: AgentId; label: string; note: string; tier: "primary" | "more"; preview?: boolean };

// Current models (June 2026). Claude: Opus 4.8 / Sonnet 4.6 / Haiku 4.5, Fable 5 under More.
// Codex (OpenAI): GPT-5.5 is the recommended Codex model; GPT-5.4 / 5.4 mini current; the GPT-5.6
// Sol/Terra/Luna family is limited-preview, so it lives under More. (5.3-Codex / 5.2 are deprecated.)
export const MODELS: Model[] = [
  { id: "claude-opus-4-8", agent: "claude", label: "Opus 4.8", note: "Most capable", tier: "primary" },
  { id: "claude-sonnet-4-6", agent: "claude", label: "Sonnet 4.6", note: "Fast, balanced", tier: "primary" },
  { id: "claude-haiku-4-5", agent: "claude", label: "Haiku 4.5", note: "Fastest", tier: "primary" },
  { id: "claude-fable-5", agent: "claude", label: "Fable 5", note: "Most creative", tier: "more" },
  { id: "gpt-5.5-codex", agent: "codex", label: "GPT-5.5", note: "Recommended", tier: "primary" },
  { id: "gpt-5.4", agent: "codex", label: "GPT-5.4", note: "Balanced", tier: "primary" },
  { id: "gpt-5.4-mini", agent: "codex", label: "GPT-5.4 mini", note: "Fast", tier: "primary" },
  { id: "gpt-5.6-sol", agent: "codex", label: "GPT-5.6 Sol", note: "Flagship", tier: "more", preview: true },
  { id: "gpt-5.6-terra", agent: "codex", label: "GPT-5.6 Terra", note: "Balanced", tier: "more", preview: true },
  { id: "gpt-5.6-luna", agent: "codex", label: "GPT-5.6 Luna", note: "Fast", tier: "more", preview: true },
];

export const DEFAULT_MODEL = "claude-opus-4-8";
export const modelById = (id: string): Model => MODELS.find((m) => m.id === id) ?? MODELS[0];

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
