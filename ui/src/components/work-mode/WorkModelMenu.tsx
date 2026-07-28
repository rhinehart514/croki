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

export function WorkModelMenu({ selectedId, effort, disabled, connected, available = true, models = WORK_MODELS, onSelectModel, onSelectEffort }: {
  selectedId: string;
  effort: WorkEffort | null;
  disabled: boolean;
  connected: (runtime: WorkRuntime) => boolean;
  available?: boolean;
  models?: WorkModelOption[];
  onSelectModel: (option: WorkModelOption) => void;
  onSelectEffort: (effort: WorkEffort) => void;
}) {
  const modelRef = useRef<HTMLDetailsElement | null>(null);
  const effortRef = useRef<HTMLDetailsElement | null>(null);
  useDismiss(modelRef);
  useDismiss(effortRef);

  const model = modelById(selectedId, models);
  const efforts = effortsForModel(model.id, models);
  const meta = effort ? EFFORT_META[effort] : null;
  // The closed face carries one line — the participant's name; detail lives in the open menu. The
  // second line appears only for the state that must interrupt: the chosen runtime being offline.
  const selectedRuntimeOnline = connected(model.runtime);

  return (
    <div className="work-picks">
      <details ref={modelRef} className="work-pick work-pick-model" data-runtime={model.runtime}>
        <summary aria-label="SDK model" aria-disabled={disabled || undefined} onClick={(event) => { if (disabled) event.preventDefault(); }}>
          <img src={runtimeLogo(model.runtime)} alt="" aria-hidden="true" />
          <span className="work-pick-face">
            <strong>{model.label}</strong>
            {!selectedRuntimeOnline
              ? <small className="work-pick-face-offline">Not connected</small>
              : !available ? <small className="work-pick-face-offline">Model unavailable</small> : null}
          </span>
          <ChevronDown className="work-pick-caret" aria-hidden="true" />
        </summary>
        <div className="work-pick-menu" role="menu">
          {RUNTIME_ORDER.map((runtime) => {
            const options = models.filter((entry) => entry.runtime === runtime);
            const online = connected(runtime);
            const selectedUnavailable = runtime === model.runtime
              && !available
              && !options.some((option) => option.id === model.id);
            return (
              <div className="work-pick-group" key={runtime}>
                <p className="work-pick-group-head"><img src={runtimeLogo(runtime)} alt="" aria-hidden="true" />{RUNTIME_LABEL[runtime]}{online ? null : <span className="work-pick-offline">Not connected</span>}</p>
                {selectedUnavailable ? <button type="button" role="menuitemradio" aria-checked="true" className="work-pick-option" disabled data-current>
                  <span className="work-pick-face"><strong>{model.label}</strong><small>Unavailable in the current provider inventory</small></span>
                  <Check aria-hidden="true" />
                </button> : null}
                {options.map((option) => (
                  <button key={option.id} type="button" role="menuitemradio" aria-checked={option.id === model.id} className="work-pick-option" disabled={!online} data-current={option.id === model.id || undefined} onClick={() => { modelRef.current?.removeAttribute("open"); onSelectModel(option); }}>
                    <span className="work-pick-face"><strong>{option.label}</strong><small>{option.sublabel}{option.contextWindow ? ` · ${Math.round(option.contextWindow / 1_000)}k context` : " · Context not advertised"}</small></span>
                    {option.id === model.id ? <Check aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </details>

      {available && meta ? <details ref={effortRef} className="work-pick work-pick-effort" title="How hard the model reasons before it acts">
        <summary aria-label="Reasoning effort" aria-disabled={disabled || undefined} onClick={(event) => { if (disabled) event.preventDefault(); }}>
          <span className="work-effort-bars" data-bars={meta.bars} aria-hidden="true">{[1, 2, 3, 4, 5, 6].map((step) => <i key={step} data-on={step <= meta.bars || undefined} />)}</span>
          <span className="work-pick-face"><strong>{meta.label}</strong></span>
          <ChevronDown className="work-pick-caret" aria-hidden="true" />
        </summary>
        <div className="work-pick-menu" role="menu">
          <p className="work-pick-group-head">Reasoning effort</p>
          {efforts.map((level) => {
            const info = EFFORT_META[level];
            return (
              <button key={level} type="button" role="menuitemradio" aria-checked={level === effort} className="work-pick-option" data-current={level === effort || undefined} onClick={() => { effortRef.current?.removeAttribute("open"); onSelectEffort(level); }}>
                <span className="work-effort-bars" data-bars={info.bars} aria-hidden="true">{[1, 2, 3, 4, 5, 6].map((step) => <i key={step} data-on={step <= info.bars || undefined} />)}</span>
                <span className="work-pick-face"><strong>{info.label}</strong><small>{info.hint}</small></span>
                {level === effort ? <Check aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      </details> : available ? <span className="work-pick work-pick-effort" aria-label="Reasoning effort is chosen by this model">
        <span className="work-pick-face"><strong>Provider default</strong></span>
      </span> : null}
    </div>
  );
}
