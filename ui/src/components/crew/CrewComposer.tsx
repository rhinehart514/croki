// Build a teammate with Claude — the "+" on your crew. You say what you need in a sentence; Claude drafts
// a real teammate (a face, a name, a one-line job, and how it works), shown as a card you can add or
// redraft. Nothing is saved until you add it — the draft is Claude's, the decision is yours. Add persists
// it as a real agent and it joins your crew immediately, draggable onto the canvas like the rest.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X, Wand2, ArrowLeft, Check } from "lucide-react";
import { agentPersona } from "@/lib/agentPersona";
import { composeCrewMember, addCrewMember, type CrewDraft } from "@/api";
import { CrewFace } from "./CrewFace";
import "./CrewComposer.css";

// Mounted only while open (the parent conditionally renders it), so every open starts with fresh state —
// no state-resetting effect needed.
export function CrewComposer({
  projectId, onClose, onAdded,
}: {
  projectId: string | null;
  onClose: () => void;
  onAdded: (ref: string) => void;
}) {
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<CrewDraft | null>(null);
  const [busy, setBusy] = useState<null | "composing" | "adding">(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Escape closes; the input takes focus so you can just start typing.
  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => { window.clearTimeout(t); document.removeEventListener("keydown", onKey, true); };
  }, [onClose]);

  const compose = async () => {
    if (!projectId || !description.trim() || busy) return;
    setBusy("composing"); setError(null);
    try {
      const res = await composeCrewMember(projectId, description.trim());
      setDraft(res.draft);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy((b) => (b === "composing" ? null : b));
    }
  };

  const add = async () => {
    if (!projectId || !draft || busy) return;
    setBusy("adding"); setError(null);
    try {
      await addCrewMember(projectId, { ref: draft.ref, description: draft.description, markdown: draft.markdown });
      onAdded(draft.ref);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const onInputKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void compose(); }
  };

  const persona = draft ? agentPersona(draft.ref, draft.description) : null;

  return (
    <div className="crewc-scrim" role="dialog" aria-modal="true" aria-label="Build a teammate">
      <button type="button" className="crewc-scrim-close" aria-label="Close" onClick={onClose} />
      <div className="crewc-sheet">
        <header className="crewc-head">
          <div>
            <h2 className="crewc-title">Build a teammate</h2>
            <p className="crewc-sub">Say what you need in a sentence. Claude drafts a teammate you can add to your crew.</p>
          </div>
          <button type="button" className="crewc-close" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </header>

        {!draft ? (
          <div className="crewc-body">
            <textarea
              ref={inputRef}
              className="crewc-input"
              placeholder="e.g. Finds real Buffalo dental practices and verifies the owner's name and email"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={onInputKey}
              rows={3}
              disabled={busy === "composing"}
            />
            {error ? <p className="crewc-error">{error}</p> : null}
            <div className="crewc-actions">
              <button type="button" className="crewc-primary" onClick={() => void compose()} disabled={!description.trim() || busy === "composing"}>
                <Wand2 size={14} />
                {busy === "composing" ? "Claude is building your teammate…" : "Draft with Claude"}
              </button>
            </div>
          </div>
        ) : (
          <div className="crewc-body">
            <div className="crewc-preview">
              <span className="crewc-face">
                <CrewFace agentRef={draft.ref} job={draft.description} family={persona?.family} monogram={persona?.monogram} size={56} />
              </span>
              <div className="crewc-preview-main">
                <span className="crewc-name">{draft.name}</span>
                {persona && persona.role !== draft.name ? <span className="crewc-role">{persona.role}</span> : null}
                <p className="crewc-desc">{draft.description}</p>
              </div>
            </div>
            {/* The founder sees what the teammate DOES (its face, name, and plain-words job) and decides —
                never its raw operating instructions. The system prompt is saved to the teammate's file on
                add; it's machinery, not a founder surface. */}
            {error ? <p className="crewc-error">{error}</p> : null}
            <div className="crewc-actions">
              <button type="button" className="crewc-secondary" onClick={() => { setDraft(null); setError(null); }} disabled={busy === "adding"}>
                <ArrowLeft size={14} /> Try again
              </button>
              <button type="button" className="crewc-primary" onClick={() => void add()} disabled={busy === "adding"}>
                <Check size={14} /> {busy === "adding" ? "Adding…" : "Add to crew"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
