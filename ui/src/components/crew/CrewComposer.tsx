// Build a teammate — the immersive "build beside you" flow. A full-height space on the right where a
// teammate assembles while you talk to it. You can start blank or from a teammate you already trust, then
// shape it live: rename it in place, tweak what it does, and tell Claude to change one thing and watch the
// card update (not regenerate). Nothing saves until you add it — the draft is Claude's, the decision is
// yours. The system prompt is machinery: it's saved into the teammate on add, never shown here.
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X, Wand2, Check, RotateCcw, CornerDownLeft, Upload } from "lucide-react";
import { agentPersona } from "@/lib/agentPersona";
import { composeCrewMember, addCrewMember, importOpenClawTeammate, type CrewDraft } from "@/api";
import type { AgentBenchRow } from "@/api";
import { CrewFace } from "./CrewFace";
import "./CrewComposer.css";

// Mounted only while open (the parent conditionally renders it), so every open starts fresh.
export function CrewComposer({
  projectId, bench, onClose, onAdded,
}: {
  projectId: string | null;
  bench: AgentBenchRow[] | null;
  onClose: () => void;
  onAdded: (ref: string) => void;
}) {
  const [draft, setDraft] = useState<CrewDraft | null>(null);
  const [input, setInput] = useState("");
  const [baseRef, setBaseRef] = useState<string | null>(null);
  // "build" = draft with Claude from a sentence; "import" = paste an OpenClaw agent's own files.
  const [mode, setMode] = useState<"build" | "import">("build");
  const [busy, setBusy] = useState<null | "composing" | "adding">(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 40);
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => { window.clearTimeout(t); document.removeEventListener("keydown", onKey, true); };
  }, [onClose]);

  const crew = bench ?? [];
  const crewName = (r: AgentBenchRow) => r.name?.trim() || agentPersona(r.ref, r.job).role;
  const baseRow = baseRef ? crew.find((r) => r.ref === baseRef) : null;
  const baseName = baseRow ? crewName(baseRow) : null;

  // Send the input: a first send drafts (fresh or forked from the chosen teammate); once a draft exists it
  // refines that same draft in place, keeping its identity so the face holds.
  const send = async () => {
    if (!projectId || !input.trim() || busy) return;
    const text = input.trim();
    setBusy("composing"); setError(null);
    try {
      if (mode === "import") {
        // Import reads the pasted OpenClaw files into a draft (re-paste replaces it). The founder edits
        // name/description inline on the card; refining via Claude would drop the earned lessons.
        const res = await importOpenClawTeammate(projectId, { text });
        setDraft(res.draft);
        setInput("");
        return;
      }
      const res = await composeCrewMember(
        projectId,
        draft
          ? { current: { ref: draft.ref, name: draft.name, description: draft.description, systemPrompt: draft.systemPrompt }, instruction: text }
          : baseRef
            ? { baseRef, instruction: text }
            : { description: text },
      );
      setDraft(res.draft);
      setInput("");
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
      await addCrewMember(projectId, {
        ref: draft.ref, name: draft.name, description: draft.description, systemPrompt: draft.systemPrompt,
        importedPromoted: draft.importedPromoted, importedScratch: draft.importedScratch,
      });
      onAdded(draft.ref);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const startOver = () => { setDraft(null); setInput(""); setError(null); setBaseRef(null); setMode("build"); window.setTimeout(() => inputRef.current?.focus(), 20); };

  const onInputKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
  };

  const persona = draft ? agentPersona(draft.ref, draft.description) : null;
  const composing = busy === "composing";

  return (
    <div className="crewc-scrim" role="dialog" aria-modal="true" aria-label="Build a teammate">
      <button type="button" className="crewc-scrim-close" aria-label="Close" onClick={onClose} />
      <aside className="crewc-drawer">
        <header className="crewc-head">
          <div>
            <h2 className="crewc-title">Build a teammate</h2>
            <p className="crewc-sub">Describe what you need and shape it with Claude. Add it when it feels right.</p>
          </div>
          <button type="button" className="crewc-close" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </header>

        {/* Start-from strip — blank, or an existing teammate to adapt. Hidden once a draft is in hand. */}
        {!draft ? (
          <div className="crewc-startfrom">
            <span className="crewc-startfrom-label">Start from</span>
            <div className="crewc-chips">
              <button type="button" className={`crewc-chip ${mode === "build" && baseRef === null ? "active" : ""}`} onClick={() => { setMode("build"); setBaseRef(null); }}>Blank</button>
              <button type="button" className={`crewc-chip ${mode === "import" ? "active" : ""}`} onClick={() => { setMode("import"); setBaseRef(null); }} title="Import an existing OpenClaw agent">
                <Upload size={14} /> Import from OpenClaw
              </button>
              {crew.map((r) => {
                const p = agentPersona(r.ref, r.job);
                return (
                  <button
                    key={r.ref}
                    type="button"
                    className={`crewc-chip crewc-chip-crew ${mode === "build" && baseRef === r.ref ? "active" : ""}`}
                    onClick={() => { setMode("build"); setBaseRef(r.ref); }}
                    title={`Start from ${crewName(r)}`}
                  >
                    <CrewFace variant="roundel" agentRef={r.ref} job={r.job} family={p.family} monogram={p.monogram} size={18} />
                    <span>{crewName(r)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="crewc-stage">
          {draft ? (
            <div className="crewc-card">
              <span className="crewc-face">
                <CrewFace variant="roundel" agentRef={draft.ref} job={draft.description} family={persona?.family} monogram={persona?.monogram} size={64} />
              </span>
              <input
                className="crewc-name-input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                aria-label="Teammate name"
                spellCheck={false}
              />
              {persona && persona.role !== draft.name ? <span className="crewc-role">{persona.role}</span> : null}
              <textarea
                className="crewc-desc-input"
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                aria-label="What this teammate does"
                rows={3}
              />
              {draft.source === "openclaw" && ((draft.importedPromoted?.length ?? 0) > 0 || (draft.importedScratch?.length ?? 0) > 0) ? (
                <p className="crewc-imported-note">
                  Brings {draft.importedPromoted?.length ?? 0} settled {(draft.importedPromoted?.length ?? 0) === 1 ? "lesson" : "lessons"}
                  {(draft.importedScratch?.length ?? 0) > 0 ? `, plus ${draft.importedScratch?.length} still on probation` : ""}. Read-only, like all your crew.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="crewc-empty">
              <span className="crewc-empty-face">{mode === "import" ? <Upload size={22} /> : <Wand2 size={22} />}</span>
              <p className="crewc-empty-copy">
                {mode === "import"
                  ? "Paste your OpenClaw agent — who it is, how it works, and what it has learned — and it joins your crew read-only."
                  : baseName ? `Tell Claude how this should differ from ${baseName}.` : "Tell Claude what you need this teammate to do."}
              </p>
            </div>
          )}
        </div>

        {error ? <p className="crewc-error">{error}</p> : null}

        <div className="crewc-composer">
          <div className="crewc-inputrow">
            <textarea
              ref={inputRef}
              className="crewc-input"
              placeholder={
                mode === "import"
                  ? "Paste SOUL.md (and AGENTS.md, MEMORY.md, TOOLS.md, LEARNINGS.md)…"
                  : draft ? "Tell Claude to change something…" : baseName ? `How should it differ from ${baseName}?` : "e.g. Finds real Buffalo dental practices and verifies the owner's email"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onInputKey}
              rows={2}
              disabled={composing}
            />
            <button type="button" className="crewc-send" onClick={() => void send()} disabled={!input.trim() || composing} title={mode === "import" ? "Read the pasted agent" : draft ? "Refine" : "Draft with Claude"}>
              {composing ? <Wand2 size={15} className="crewc-spin" /> : <CornerDownLeft size={15} />}
            </button>
          </div>
          <div className="crewc-actions">
            {draft ? (
              <>
                <button type="button" className="crewc-secondary" onClick={startOver} disabled={busy === "adding"}>
                  <RotateCcw size={13} /> Start over
                </button>
                <button type="button" className="crewc-primary" onClick={() => void add()} disabled={busy === "adding"}>
                  <Check size={14} /> {busy === "adding" ? "Adding…" : "Add to crew"}
                </button>
              </>
            ) : (
              <span className="crewc-hint">{composing ? (mode === "import" ? "Reading your agent…" : "Claude is building your teammate…") : "Enter to send · Shift+Enter for a new line"}</span>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
