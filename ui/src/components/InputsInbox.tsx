// InputsInbox — the ambient world-signal inbox. The durable, append-only log of "something happened
// out there": a commit, a signup, a reply, a star, a demo visit, a CSV row. Each record was captured
// with its PROVENANCE (the webhook / connector / file that carried it) and landed 'unrouted' — nobody
// has decided what it means yet. THE POINT this surface must make legible: nothing here ran on its own.
// A captured signal just sits until the founder (or the router) routes it into a channel/flow or sets
// it aside, and any run a routed signal later feeds STILL hits the founder gate. Ingestion never runs,
// sends, or auto-approves.
//
// Read mostly; the one write per item is the founder's per-input decision (POST .../inputs/route with
// { inputId, routedTo } to route, or { inputId, ignore:true } to set aside). Lives inside an opaque
// CanvasCard (summoned like People). All color from the shared tokens — green = a routed
// decision, amber = the gate reminder, nothing decorative.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Inbox, Radio, Check, Ban, CornerUpRight, ShieldCheck } from "lucide-react";
import { getInputs, routeInput } from "@/api";
import type { Input, ChannelMeta } from "@/types";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import "@/styles/inputs-inbox.css";

type InputsInboxProps = {
  projectId: string;
  channels?: ChannelMeta[];
};

// A short, human label for when a signal arrived. Inputs carry an ISO receivedAt.
function relativeWhen(iso: string | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

// Where we know this signal from — the connector/webhook/file that carried it. Provenance is a small
// free-form object on the record; surface its source (and via, when present) without asserting a shape.
function provenanceLabel(input: Input): string {
  const p = (input.provenance ?? {}) as Record<string, unknown>;
  const source = typeof p.source === "string" && p.source.trim() ? p.source : input.source;
  return source || "unknown";
}

// A compact, read-only preview of the raw event body so the founder sees what they're routing without
// a wall of JSON. Pull the first couple of scalar fields; fall back to a one-line stringify.
function payloadPreview(input: Input): string {
  const payload = input.payload;
  if (!payload || typeof payload !== "object") return "";
  const entries = Object.entries(payload as Record<string, unknown>)
    .filter(([, v]) => v != null && typeof v !== "object")
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${typeof v === "boolean" ? (v ? "yes" : "no") : String(v)}`);
  if (entries.length) return entries.join(" · ");
  try { return JSON.stringify(payload).slice(0, 160); } catch { return ""; }
}

type RowState = { routing: boolean; target: string; busy: boolean; error: string | null };
const BLANK_ROW: RowState = { routing: false, target: "", busy: false, error: null };

export function InputsInbox({ projectId, channels = [] }: InputsInboxProps) {
  const [inputs, setInputs] = useState<Input[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  // Mount-time fetch — the canonical "subscribe to an external system" effect.
  // setState lands in load's async continuation, not synchronously in the effect body.
  const load = useCallback(async () => {
    try {
      const data = await getInputs(projectId);
      setInputs(data.inputs ?? []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const rowFor = useCallback((id: string): RowState => rows[id] ?? BLANK_ROW, [rows]);
  const patchRow = useCallback((id: string, patch: Partial<RowState>) => {
    setRows((cur) => ({ ...cur, [id]: { ...BLANK_ROW, ...cur[id], ...patch } }));
  }, []);

  // The one write: record a per-input decision. routedTo names a channel/flow; ignore sets it aside.
  // The server only marks the record — it never runs, sends, or auto-approves.
  const decide = useCallback(async (input: Input, decision: { routedTo: string } | { ignore: true }) => {
    patchRow(input.id, { busy: true, error: null });
    try {
      const { input: updated } = await routeInput(projectId, { inputId: input.id, ...decision });
      setInputs((cur) => cur.map((i) => (i.id === input.id ? updated : i)));
      setRows((cur) => ({ ...cur, [input.id]: BLANK_ROW }));
    } catch (err) {
      patchRow(input.id, { busy: false, error: err instanceof Error ? err.message : String(err) });
    }
  }, [projectId, patchRow]);

  const { unrouted, decided } = useMemo(() => {
    const sorted = [...inputs].sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""));
    return {
      unrouted: sorted.filter((i) => i.status === "unrouted"),
      decided: sorted.filter((i) => i.status !== "unrouted"),
    };
  }, [inputs]);

  if (loading) {
    return (
      <div className="inputs-inbox inputs-inbox-state">
        <p className="inputs-inbox-note">Reading the inbox…</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="inputs-inbox inputs-inbox-state">
        <p className="inputs-inbox-note">Couldn't load the inbox: {loadError}</p>
      </div>
    );
  }

  return (
    <div className="inputs-inbox">
      <header className="inputs-inbox-head">
        <span className="inputs-inbox-glyph"><Inbox size={15} /></span>
        <div className="inputs-inbox-head-text">
          <span className="inputs-inbox-eyebrow">Inbox</span>
          <p className="inputs-inbox-lede">
            Every signal that entered from the outside — a commit, a signup, a reply, a star, a CSV row —
            captured with where it came from. Nothing here ran on its own.
          </p>
        </div>
      </header>

      <div className="inputs-inbox-wall">
        <ShieldCheck size={13} />
        <span>
          A captured signal just sits until you route it into a pipeline, or set it aside. Routing only
          records the decision — any run it later feeds still stops at the founder gate.
        </span>
      </div>

      {inputs.length === 0 && (
        <p className="inputs-inbox-empty">
          Nothing has come in yet. Webhooks, CSV drops, and GitHub signals land here as they arrive.
        </p>
      )}

      {unrouted.length > 0 && (
        <section className="inputs-inbox-section">
          <h4 className="inputs-inbox-section-title">Needs a decision · {unrouted.length}</h4>
          <ul className="inputs-inbox-list">
            {unrouted.map((input) => {
              const row = rowFor(input.id);
              const preview = payloadPreview(input);
              return (
                <li key={input.id} className="inputs-inbox-item">
                  <div className="inputs-inbox-item-head">
                    <span className="inputs-inbox-kind">{input.kind}</span>
                    <span className="inputs-inbox-source">{input.source}</span>
                    <span className="inputs-inbox-when">{relativeWhen(input.receivedAt)}</span>
                  </div>
                  <span className="inputs-inbox-provenance">
                    <Radio size={10} /> {provenanceLabel(input)}
                  </span>
                  {preview && <p className="inputs-inbox-payload">{preview}</p>}

                  {row.routing ? (
                    <div className="inputs-inbox-route-row">
                      <Select
                        value={row.target}
                        onValueChange={(target) => patchRow(input.id, { target: String(target ?? "") })}
                      >
                        <SelectTrigger className="inputs-inbox-select" aria-label={`Route ${input.kind} to a pipeline`}>
                          <SelectValue placeholder="Choose a pipeline…" />
                        </SelectTrigger>
                        <SelectContent>
                          {channels.map((ch) => (
                            <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        className="inputs-inbox-btn inputs-inbox-btn-primary"
                        disabled={row.busy || !row.target}
                        onClick={() => void decide(input, { routedTo: row.target })}
                      >
                        <CornerUpRight /> {row.busy ? "Routing…" : "Route here"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="inputs-inbox-btn"
                        disabled={row.busy}
                        onClick={() => patchRow(input.id, { routing: false, target: "" })}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="inputs-inbox-actions">
                      <Button
                        type="button"
                        variant="outline"
                        className="inputs-inbox-btn"
                        disabled={row.busy || channels.length === 0}
                        onClick={() => patchRow(input.id, { routing: true })}
                      >
                        <CornerUpRight /> Route
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="inputs-inbox-btn"
                        disabled={row.busy}
                        onClick={() => void decide(input, { ignore: true })}
                      >
                        <Ban /> Ignore
                      </Button>
                      {channels.length === 0 && (
                        <span className="inputs-inbox-source">No pipelines yet to route into</span>
                      )}
                    </div>
                  )}
                  {row.error && <p className="inputs-inbox-error">{row.error}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {decided.length > 0 && (
        <section className="inputs-inbox-section">
          <h4 className="inputs-inbox-section-title">Decided · {decided.length}</h4>
          <ul className="inputs-inbox-list">
            {decided.map((input) => (
              <li key={input.id} className="inputs-inbox-item is-decided">
                <div className="inputs-inbox-item-head">
                  <span className="inputs-inbox-kind">{input.kind}</span>
                  <span className="inputs-inbox-source">{input.source}</span>
                  <span className="inputs-inbox-when">{relativeWhen(input.receivedAt)}</span>
                </div>
                <span className="inputs-inbox-provenance">
                  <Radio size={10} /> {provenanceLabel(input)}
                </span>
                {input.status === "routed" ? (
                  <span className="inputs-inbox-decided is-routed">
                    <Check size={12} /> Routed to <code>{input.routedTo}</code>
                  </span>
                ) : (
                  <span className="inputs-inbox-decided is-ignored">
                    <Ban size={12} /> Set aside
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
