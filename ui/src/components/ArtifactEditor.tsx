import { useEffect, useState } from "react";
import { Bot, Check, FileWarning, LoaderCircle, Wand2, X } from "lucide-react";
import { getArtifact, saveArtifact, type ArtifactType } from "@/api";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

// Live, client-side frontmatter read — mirrors brain/src/artifact-store.mjs parseFrontmatter.
// Used only to render the legible summary as you type; the raw markdown stays the source
// of truth (we never re-serialize from these fields).
function readFrontmatter(content: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!m) return {};
  const meta: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([a-zA-Z][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    meta[kv[1]] = v;
  }
  return meta;
}

// What the frontmatter fields mean — the prompt-engineering guidance, surfaced where you
// edit rather than hidden in docs.
const FIELD_HELP: Record<string, string> = {
  description: "The model reads this to decide WHEN to invoke. Be specific about the trigger, not just the capability.",
  tools: "Comma-separated tools this subagent may use (e.g. Read, WebSearch, WebFetch). No send/publish here — the gate owns that.",
  model: "sonnet · opus · haiku. Lower for scoped work, higher for judgment.",
};

export function ArtifactEditor({
  type, refName, open, onClose, onSaved,
}: {
  type: ArtifactType;
  refName: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [content, setContent] = useState("");
  const [exists, setExists] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !refName) return;
    let live = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const a = await getArtifact(type, refName);
        if (!live) return;
        setContent(a.content);
        setExists(a.exists);
        setDirty(false);
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (live) setLoading(false);
      }
    };
    void load();
    return () => { live = false; };
  }, [open, type, refName]);

  const meta = readFrontmatter(content);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveArtifact(type, refName, content);
      setExists(true);
      setDirty(false);
      setSavedAt(true);
      setTimeout(() => setSavedAt(false), 1600);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const Icon = type === "agent" ? Bot : Wand2;
  const filePath = type === "agent" ? `~/.claude/agents/${refName}.md` : `~/.claude/skills/${refName}/SKILL.md`;

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <SheetContent
        side="right"
        className="artifact-editor open !max-w-none !gap-0 !p-0"
        overlayClassName="pointer-events-none !bg-transparent !backdrop-blur-none"
        showCloseButton={false}
      >
      <header className="artifact-editor-head">
        <div className="artifact-editor-title">
          <Icon className="artifact-editor-kind-icon" />
          <div>
            <SheetTitle className="artifact-editor-name">{meta.name || refName}</SheetTitle>
            <code className="artifact-editor-path">{filePath}</code>
          </div>
        </div>
        <Button className="artifact-editor-close" variant="ghost" size="icon" onClick={onClose} type="button" aria-label="Close"><X /></Button>
      </header>

      {!exists && !loading && (
        <div className="artifact-editor-newbanner">
          <FileWarning />
          <span>This {type} has no file yet. You're authoring it — save to create <code>{filePath}</code>.</span>
        </div>
      )}

      {/* Legible summary of the frontmatter — updates as you edit the raw file below. */}
      <div className="artifact-editor-summary">
        <div className="artifact-summary-row">
          <span className="artifact-summary-key">description</span>
          <span className="artifact-summary-val">{meta.description || <em>— set this; it's what the model triggers on</em>}</span>
        </div>
        {type === "agent" && (
          <>
            <div className="artifact-summary-row">
              <span className="artifact-summary-key">tools</span>
              <span className="artifact-summary-val">{meta.tools || <em>— none declared</em>}</span>
            </div>
            <div className="artifact-summary-row">
              <span className="artifact-summary-key">model</span>
              <span className="artifact-summary-val">{meta.model || <em>— default</em>}</span>
            </div>
          </>
        )}
      </div>

      <div className="artifact-editor-body">
        <div className="artifact-editor-label-row">
          <label className="node-overview-label" style={{ marginBottom: 0 }}>FULL MARKDOWN — frontmatter + instructions</label>
          {dirty && <span className="artifact-dirty-dot" title="Unsaved changes" />}
        </div>
        {loading ? (
          <div className="artifact-editor-loading"><LoaderCircle className="spin" /> Loading {refName}…</div>
        ) : (
          <Textarea
            className="artifact-editor-textarea !field-sizing-fixed"
            value={content}
            spellCheck={false}
            onChange={(e) => { setContent(e.target.value); setDirty(true); }}
            aria-label={`${type} markdown for ${refName}`}
          />
        )}
        <p className="artifact-editor-help">
          {FIELD_HELP.description} <strong>tools:</strong> {FIELD_HELP.tools}
        </p>
      </div>

      {error && <div className="error-message artifact-editor-error" role="alert">{error}</div>}

      <footer className="artifact-editor-foot">
        <span className="artifact-editor-hint">The raw file is the source of truth — edit anything, including the frontmatter.</span>
        <Button disabled={saving || loading || !dirty} onClick={() => void save()} type="button">
          {saving ? <LoaderCircle className="spin" /> : savedAt ? <Check /> : null}
          {saving ? "Saving…" : savedAt ? "Saved" : exists ? "Save file" : "Create file"}
        </Button>
      </footer>
      </SheetContent>
    </Sheet>
  );
}
