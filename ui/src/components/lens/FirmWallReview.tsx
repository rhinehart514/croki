import { useState } from "react";
import { AlertTriangle, Check, MessageSquare, ShieldCheck, X } from "lucide-react";
import type { WallDecision, WallQueueItemView } from "@/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const HIDDEN_FIELDS = new Set(["runtime", "effects"]);

function labelFor(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function textFor(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const values = value.map(textFor).filter((entry): entry is string => Boolean(entry));
    return values.length ? values.join(", ") : null;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !HIDDEN_FIELDS.has(key))
      .map(([key, entry]) => {
        const rendered = textFor(entry);
        return rendered ? `${labelFor(key)}: ${rendered}` : null;
      })
      .filter((entry): entry is string => Boolean(entry));
    return entries.length ? entries.join("\n") : null;
  }
  return null;
}

function titleFor(item: WallQueueItemView): string {
  const effect = item.effect;
  for (const key of ["title", "subject", "question", "intent", "kind"]) {
    const value = effect[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "Founder decision";
}

function effectRows(effect: Record<string, unknown>) {
  return Object.entries(effect)
    .filter(([key, value]) => !HIDDEN_FIELDS.has(key) && value != null && key !== "title")
    .map(([key, value]) => ({ key, label: labelFor(key), value: textFor(value) }))
    .filter((row): row is { key: string; label: string; value: string } => Boolean(row.value));
}

export function FirmWallReview({
  items,
  onDecide,
}: {
  items: WallQueueItemView[];
  onDecide: (item: WallQueueItemView, decision: WallDecision, note?: string) => Promise<void>;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (item: WallQueueItemView, decision: WallDecision) => {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      await onDecide(item, decision, notes[item.id]?.trim() || undefined);
      setNotes((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That decision could not be recorded.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="firm-wall-review" aria-label="Founder wall decisions">
      <header className="firm-wall-review-head">
        <AlertTriangle size={16} aria-hidden="true" />
        <div>
          <strong>The wall</strong>
          <span>Nothing here reaches the world without your decision.</span>
        </div>
      </header>

      <div className="firm-wall-review-list">
        {items.map((item) => {
          const kind = typeof item.effect.kind === "string" ? item.effect.kind : null;
          const isDeploy = kind === "deploy";
          const needsAnswer = item.purpose === "answer";
          return (
            <article key={item.id} className="firm-wall-review-item">
              <div className="firm-wall-review-title">
                <strong>{titleFor(item)}</strong>
                <time>{new Date(item.parkedAt).toLocaleString()}</time>
              </div>
              <dl>
                {effectRows(item.effect).map((row) => (
                  <div key={row.key}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              <Textarea
                value={notes[item.id] ?? ""}
                onChange={(event) => setNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                placeholder={needsAnswer ? "Your answer" : "Optional note"}
                aria-label={`Note for ${titleFor(item)}`}
                rows={2}
              />
              <div className="firm-wall-review-actions">
                {item.purpose === "release" ? <>
                  <Button disabled={Boolean(busyId)} onClick={() => void decide(item, "release")}>
                    <Check size={14} aria-hidden="true" /> Release
                  </Button>
                  {isDeploy && !item.deployAuthorizedAt ? (
                    <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => void decide(item, "authorize-deploy")}>
                      <ShieldCheck size={14} aria-hidden="true" /> Authorize deploy
                    </Button>
                  ) : null}
                  <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => void decide(item, "reject")}>
                    <X size={14} aria-hidden="true" /> Reject
                  </Button>
                </> : null}
                {needsAnswer ? <>
                  <Button disabled={Boolean(busyId) || !(notes[item.id]?.trim())} onClick={() => void decide(item, "answer")}>
                    <MessageSquare size={14} aria-hidden="true" /> Answer
                  </Button>
                  <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => void decide(item, "dismiss")}>Dismiss</Button>
                </> : null}
                {item.purpose === "review-outcome" ? (
                  <Button disabled={Boolean(busyId)} onClick={() => void decide(item, "acknowledge")}>
                    <Check size={14} aria-hidden="true" /> Acknowledge
                  </Button>
                ) : null}
                {item.purpose === "end-bet" ? <>
                  <Button disabled={Boolean(busyId)} onClick={() => void decide(item, "kill")}>Kill bet</Button>
                  <Button variant="secondary" disabled={Boolean(busyId)} onClick={() => void decide(item, "keep")}>Keep bet</Button>
                </> : null}
              </div>
            </article>
          );
        })}
      </div>
      {error ? <p className="firm-wall-review-error" role="alert">{error}</p> : null}
    </section>
  );
}
