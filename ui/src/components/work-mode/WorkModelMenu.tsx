import { useEffect, useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import claudeLogo from "@lobehub/icons-static-svg/icons/claude-color.svg";
import codexLogo from "@lobehub/icons-static-svg/icons/codex-color.svg";
import {
  EFFORT_META,
  effortsForModel,
  modelById,
  RUNTIME_LABEL,
  WORK_MODELS,
  type WorkEffort,
  type WorkModelOption,
  type WorkRuntime,
} from "./work-models";

const runtimeLogo = (runtime: WorkRuntime) => (runtime === "codex" ? codexLogo : claudeLogo);
const RUNTIME_ORDER: WorkRuntime[] = ["claude-code", "codex"];

// A dismissable `<details>` disclosure — the house dropdown pattern (see VentureSwitcher), with Escape and
// outside-click close added so the two Work pickers feel like one deliberate control rather than a raw select.
function useDismiss(ref: React.RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const close = () => ref.current?.removeAttribute("open");
    const onClick = (event: MouseEvent) => { if (ref.current?.open && !ref.current.contains(event.target as Node)) close(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && ref.current?.open) close(); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [ref]);
}

export function WorkModelMenu({ selectedId, effort, disabled, connected, onSelectModel, onSelectEffort }: {
  selectedId: string;
  effort: WorkEffort;
  disabled: boolean;
  connected: (runtime: WorkRuntime) => boolean;
  onSelectModel: (option: WorkModelOption) => void;
  onSelectEffort: (effort: WorkEffort) => void;
}) {
  const modelRef = useRef<HTMLDetailsElement | null>(null);
  const effortRef = useRef<HTMLDetailsElement | null>(null);
  useDismiss(modelRef);
  useDismiss(effortRef);

  const model = modelById(selectedId);
  const efforts = effortsForModel(model.id);
  const meta = EFFORT_META[effort];
  // The closed face carries one line — the participant's name; detail lives in the open menu. The
  // second line appears only for the state that must interrupt: the chosen runtime being offline.
  const selectedOnline = connected(model.runtime);

  return (
    <div className="work-picks">
      <details ref={modelRef} className="work-pick work-pick-model" data-runtime={model.runtime}>
        <summary aria-label="SDK model" aria-disabled={disabled || undefined} onClick={(event) => { if (disabled) event.preventDefault(); }}>
          <img src={runtimeLogo(model.runtime)} alt="" aria-hidden="true" />
          <span className="work-pick-face"><strong>{model.label}</strong>{selectedOnline ? null : <small className="work-pick-face-offline">Not connected</small>}</span>
          <ChevronDown className="work-pick-caret" aria-hidden="true" />
        </summary>
        <div className="work-pick-menu" role="menu">
          {RUNTIME_ORDER.map((runtime) => {
            const options = WORK_MODELS.filter((entry) => entry.runtime === runtime);
            const online = connected(runtime);
            return (
              <div className="work-pick-group" key={runtime}>
                <p className="work-pick-group-head"><img src={runtimeLogo(runtime)} alt="" aria-hidden="true" />{RUNTIME_LABEL[runtime]}{online ? null : <span className="work-pick-offline">Not connected</span>}</p>
                {options.map((option) => (
                  <button key={option.id} type="button" role="menuitemradio" aria-checked={option.id === model.id} className="work-pick-option" disabled={!online} data-current={option.id === model.id || undefined} onClick={() => { modelRef.current?.removeAttribute("open"); onSelectModel(option); }}>
                    <span className="work-pick-face"><strong>{option.label}</strong><small>{option.sublabel}</small></span>
                    {option.id === model.id ? <Check aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </details>

      <details ref={effortRef} className="work-pick work-pick-effort" title="How hard the model reasons before it acts">
        <summary aria-label="Reasoning effort" aria-disabled={disabled || undefined} onClick={(event) => { if (disabled) event.preventDefault(); }}>
          <span className="work-effort-bars" data-bars={meta.bars} aria-hidden="true">{[1, 2, 3, 4, 5].map((step) => <i key={step} data-on={step <= meta.bars || undefined} />)}</span>
          <span className="work-pick-face"><strong>{meta.label}</strong></span>
          <ChevronDown className="work-pick-caret" aria-hidden="true" />
        </summary>
        <div className="work-pick-menu" role="menu">
          <p className="work-pick-group-head">Reasoning effort</p>
          {efforts.map((level) => {
            const info = EFFORT_META[level];
            return (
              <button key={level} type="button" role="menuitemradio" aria-checked={level === effort} className="work-pick-option" data-current={level === effort || undefined} onClick={() => { effortRef.current?.removeAttribute("open"); onSelectEffort(level); }}>
                <span className="work-effort-bars" data-bars={info.bars} aria-hidden="true">{[1, 2, 3, 4, 5].map((step) => <i key={step} data-on={step <= info.bars || undefined} />)}</span>
                <span className="work-pick-face"><strong>{info.label}</strong><small>{info.hint}</small></span>
                {level === effort ? <Check aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </details>
    </div>
  );
}
