import { Check, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";

import { sdkDetails, type CanvasMode, type CanvasSdk, type LabNode } from "./model";

interface SelectionInspectorProps {
  readonly mode: CanvasMode;
  readonly node: LabNode | null;
  readonly sdk: CanvasSdk;
  readonly onClose: () => void;
}

export function SelectionInspector(props: SelectionInspectorProps) {
  if (!props.node) {
    return (
      <aside className="inspector empty-inspector" aria-label="Selection inspector">
        <div>
          <span className="eyebrow">No selection</span>
          <h2>Select project truth, work, or evidence.</h2>
          <p>The surface stays quiet until the founder asks a specific question.</p>
        </div>
        <div className="empty-rules">
          <span>Click selects</span>
          <span>Escape clears</span>
          <span>Drag changes presentation only</span>
        </div>
      </aside>
    );
  }

  return <SelectedNodeInspector key={props.node.id} {...props} node={props.node} />;
}

function SelectedNodeInspector(props: SelectionInspectorProps & { readonly node: LabNode }) {
  const [title, setTitle] = useState(props.node.title);
  const [body, setBody] = useState(props.node.body);
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    setChanged(title !== props.node.title || body !== props.node.body);
  }, [body, props.node, title]);

  return (
    <aside className="inspector" aria-label="Selection inspector">
      <header className="inspector-header">
        <div>
          <span className="eyebrow">
            {props.mode} · {props.node.kind}
          </span>
          <strong className={`authority authority-${props.node.authority}`}>
            {props.node.authority}
          </strong>
        </div>
        <button type="button" aria-label="Close selection inspector" onClick={props.onClose}>
          <X size={15} />
        </button>
      </header>

      <label className="field">
        <span>Title</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Selected item title"
        />
      </label>
      <label className="field growing-field">
        <span>Details</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          aria-label="Selected item details"
        />
      </label>

      <section className="evidence-block">
        <span className="field-label">Context</span>
        <div>
          <span>{props.node.meta}</span>
          <button type="button" aria-label="Open supporting context">
            <ExternalLink size={13} />
          </button>
        </div>
      </section>

      <section className="inspector-readout">
        <span>Rendered through {sdkDetails[props.sdk].label}</span>
        <span>Semantic record remains external</span>
      </section>

      <footer className="inspector-actions">
        {props.node.authority === "provisional" ? (
          <>
            <button type="button" className="secondary-action">
              Reject
            </button>
            <button type="button" className="primary-action">
              <Check size={14} /> Adopt
            </button>
          </>
        ) : (
          <>
            <button type="button" className="secondary-action">
              Open Thread
            </button>
            <button type="button" className="primary-action" disabled={!changed}>
              Save suggestion
            </button>
          </>
        )}
      </footer>
    </aside>
  );
}
