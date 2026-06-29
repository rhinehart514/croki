// ToolForge — the founder's front door to the self-building loop. When the same DETERMINISTIC
// procedure recurs across runs, the engine crystallizes it into a PENDING tool-birth proposal
// (gated, never auto-born). This is where the founder sees those proposals and BIRTHS one into a
// registered, callable tool — by supplying its code and a test. The wall holds here exactly as it
// does in the engine: a tool is born only on an explicit founder approve that carries code AND a
// test (the server gate refuses anything else). Read mostly; the one write is the founder's approve.
//
// Lives inside an opaque CanvasCard (summoned like People / experiments). All color comes from the
// shared tokens — green = real/derived. No glass on this read-in surface.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Hammer, Wrench, ShieldCheck, ChevronRight } from "lucide-react";
import { getToolProposals, approveToolBirth } from "@/api";
import type { ToolBirthProposal, RegisteredTool } from "@/types";
import "@/styles/tool-forge.css";

export type ToolForgeProps = {
  projectId: string;
};

// A readable title for a proposal whose only stable handle is its signature (e.g. "code:dedupe").
function proposalTitle(p: ToolBirthProposal): string {
  const sig = String(p.signature || "").trim();
  if (!sig) return "Self-built tool";
  return sig.replace(/[:_-]+/g, " ").replace(/\s+/g, " ").trim();
}

// A minimal authoring scaffold so the founder edits a starting point instead of a blank box. It is
// NOT a working tool — it is a labeled stub that makes the code+test requirement concrete.
function scaffoldCode(p: ToolBirthProposal): string {
  const sig = String(p.signature || "tool").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "tool";
  return `// Deterministic tool crystallized from: ${p.signature || "a repeated procedure"}\n` +
    `export function ${sig}(items, config = {}) {\n  // Transform the run's items here. Deterministic only — no model calls.\n  return items;\n}\n`;
}
function scaffoldTest(p: ToolBirthProposal): string {
  const sig = String(p.signature || "tool").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") || "tool";
  return `import assert from "node:assert/strict";\n` +
    `import { ${sig} } from "./${sig}.mjs";\n\n` +
    `// Prove the transform does what the procedure did.\n` +
    `assert.deepEqual(${sig}([], {}), []);\n`;
}

type DraftState = { code: string; test: string; name: string; busy: boolean; error: string | null };

export function ToolForge({ projectId }: ToolForgeProps) {
  const [pending, setPending] = useState<ToolBirthProposal[]>([]);
  const [registered, setRegistered] = useState<RegisteredTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  // Fetch (and re-fetch after an approve). Awaits FIRST, so no state is set synchronously inside the
  // mount effect — every setState lands in an async continuation. Host guarantees a non-empty projectId.
  const load = useCallback(async () => {
    try {
      const data = await getToolProposals(projectId);
      setPending(data.pending ?? []);
      setRegistered(data.registered ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Mount-time fetch — the canonical "subscribe to an external system" effect (mirrors
  // ConnectCapability). setState lands in load's async continuation, not synchronously in the effect
  // body, so the cascading-render concern the rule guards does not apply.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const draftFor = useCallback((p: ToolBirthProposal): DraftState =>
    drafts[p.id] ?? { code: scaffoldCode(p), test: scaffoldTest(p), name: proposalTitle(p), busy: false, error: null },
    [drafts]);

  const patchDraft = useCallback((id: string, patch: Partial<DraftState>, base: DraftState) => {
    setDrafts((cur) => ({ ...cur, [id]: { ...base, ...cur[id], ...patch } }));
  }, []);

  const approve = useCallback(async (p: ToolBirthProposal) => {
    const draft = draftFor(p);
    if (!draft.code.trim() || !draft.test.trim()) {
      patchDraft(p.id, { error: "A tool is born only with code AND a test." }, draft);
      return;
    }
    patchDraft(p.id, { busy: true, error: null }, draft);
    try {
      await approveToolBirth(projectId, p.id, {
        code: draft.code, test: draft.test,
        name: draft.name.trim() || proposalTitle(p),
      });
      setOpenId(null);
      setDrafts((cur) => { const next = { ...cur }; delete next[p.id]; return next; });
      await load();
    } catch (err) {
      patchDraft(p.id, { busy: false, error: err instanceof Error ? err.message : String(err) }, draft);
    }
  }, [projectId, draftFor, patchDraft, load]);

  const total = useMemo(() => pending.length + registered.length, [pending, registered]);

  if (loading) {
    return (
      <div className="tool-forge tool-forge-state">
        <p className="tool-forge-note">Looking for procedures worth crystallizing…</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="tool-forge tool-forge-state">
        <p className="tool-forge-note">Couldn't load tools: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="tool-forge">
      <header className="tool-forge-head">
        <span className="tool-forge-glyph"><Hammer size={15} /></span>
        <div className="tool-forge-head-text">
          <span className="tool-forge-eyebrow">Self-built tools</span>
          <p className="tool-forge-lede">
            When the same deterministic step recurs across runs, it shows up here to crystallize into a
            tool. A tool is born only when you approve it with code and a test.
          </p>
        </div>
      </header>

      {total === 0 && (
        <p className="tool-forge-empty">
          No repeated procedures yet. Run a few flows — when a deterministic step keeps recurring, it'll
          surface here as a proposal you can turn into a reusable tool.
        </p>
      )}

      {pending.length > 0 && (
        <section className="tool-forge-section">
          <h4 className="tool-forge-section-title">Proposed · {pending.length}</h4>
          <ul className="tool-forge-list">
            {pending.map((p) => {
              const draft = draftFor(p);
              const open = openId === p.id;
              return (
                <li key={p.id} className={`tool-forge-proposal${open ? " is-open" : ""}`}>
                  <button
                    className="tool-forge-proposal-head"
                    onClick={() => setOpenId(open ? null : p.id)}
                    type="button"
                  >
                    <ChevronRight size={13} className="tool-forge-caret" />
                    <span className="tool-forge-proposal-name">{proposalTitle(p)}</span>
                    {typeof p.count === "number" && p.count > 0 && (
                      <span className="tool-forge-proposal-count">seen {p.count}×</span>
                    )}
                  </button>
                  {p.reason && <p className="tool-forge-proposal-reason">{p.reason}</p>}
                  {open && (
                    <div className="tool-forge-author">
                      <label className="tool-forge-field">
                        <span>Name</span>
                        <input
                          className="tool-forge-input"
                          value={draft.name}
                          onChange={(e) => patchDraft(p.id, { name: e.target.value }, draft)}
                        />
                      </label>
                      <label className="tool-forge-field">
                        <span>Code</span>
                        <textarea
                          className="tool-forge-code"
                          value={draft.code}
                          spellCheck={false}
                          rows={6}
                          onChange={(e) => patchDraft(p.id, { code: e.target.value }, draft)}
                        />
                      </label>
                      <label className="tool-forge-field">
                        <span>Test</span>
                        <textarea
                          className="tool-forge-code"
                          value={draft.test}
                          spellCheck={false}
                          rows={4}
                          onChange={(e) => patchDraft(p.id, { test: e.target.value }, draft)}
                        />
                      </label>
                      {draft.error && <p className="tool-forge-error">{draft.error}</p>}
                      <div className="tool-forge-actions">
                        <button
                          className="tool-forge-approve"
                          disabled={draft.busy || !draft.code.trim() || !draft.test.trim()}
                          onClick={() => void approve(p)}
                          type="button"
                        >
                          <ShieldCheck size={13} /> {draft.busy ? "Birthing…" : "Approve & register"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {registered.length > 0 && (
        <section className="tool-forge-section">
          <h4 className="tool-forge-section-title">Registered · {registered.length}</h4>
          <ul className="tool-forge-list">
            {registered.map((t) => (
              <li key={t.id} className="tool-forge-tool">
                <span className="tool-forge-tool-glyph"><Wrench size={13} /></span>
                <div className="tool-forge-tool-text">
                  <span className="tool-forge-tool-name">{t.name}</span>
                  {t.description && <span className="tool-forge-tool-desc">{t.description}</span>}
                </div>
                <span className="tool-forge-tool-badge">{t.provenance ?? "self-built"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
