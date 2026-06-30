// ReferencesPanel — the canvas moat made reachable: "where does this person / claim / experiment /
// ICP appear across the whole go-to-market?"
//
// PeopleLens and ExperimentMatrixLens hand up a selected object id; the host resolves it through the
// cross-reference query (findReferences, plus getPerson for a person) and renders the answer here. It
// is the dedup / fatigue / "who is this and where have we touched them" surface: the entity's
// identity up top, then every place it surfaced — grouped by the channel it appears in, so a person
// who shows up in three channels reads as a fatigue risk at a glance. Read-only: this answers a
// question, it never edits and never sends. It renders the REAL returned CrossReferenceResult /
// Person — never a placeholder.
//
// Designed to drop into a CanvasCard body (opaque, read-in surface). The card supplies the title
// chrome; this component owns the body.

import { useMemo } from "react";
import { User, Target, FlaskConical, Quote, Radio } from "lucide-react";
import type { ChannelMeta, CrossReference, CrossReferenceResult, Person } from "@/types";
import "@/styles/references-panel.css";

export type ReferenceKind = "person" | "icp" | "claim" | "experiment";

export type ReferencesPanelProps = {
  kind: ReferenceKind;
  // The resolved cross-reference answer. Null while the host is still fetching (with loading) or when
  // nothing resolved.
  result: CrossReferenceResult | null;
  // The fuller Person record (identity fields + appearances), fetched alongside the references for a
  // person so the panel can show org / email / handle, not just the appearances.
  person?: Person | null;
  loading?: boolean;
  // Channels to resolve a channelId → human name (person / experiment references carry only the id).
  channels?: ChannelMeta[];
  // Optional — when wired, a channel header becomes a button that opens that channel's flow, so the
  // eye routes straight to where the entity appears.
  onOpenChannel?: (channelId: string) => void;
};

// A short, stable day label — no relative-time machinery, just the day (mirrors PeopleLens).
function dayLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Pull a readable line out of the loosely-typed shared ICP bag (mirrors GtmCanvas.readable).
function readable(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    for (const k of ["query", "industry", "segment", "description", "label", "name", "summary"]) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return null;
}

const KIND_META: Record<ReferenceKind, { icon: typeof User; eyebrow: string; noun: string }> = {
  person: { icon: User, eyebrow: "Person", noun: "appearance" },
  icp: { icon: Target, eyebrow: "ICP", noun: "mention" },
  claim: { icon: Quote, eyebrow: "Claim", noun: "mention" },
  experiment: { icon: FlaskConical, eyebrow: "Experiment", noun: "run" },
};

// The headline name for the selected entity, per kind. Always derived from the REAL returned object.
function headline(props: ReferencesPanelProps): string {
  const { kind, result, person } = props;
  if (kind === "person") {
    const p = person ?? result?.person ?? null;
    if (!p) return "Unknown person";
    return (p.name || p.org || p.handle || p.email || p.domain || p.identityKey || "Unknown person").trim();
  }
  if (kind === "claim") return (result?.claim || "Untitled claim").trim();
  if (kind === "experiment") {
    const e = result?.experiment ?? null;
    return (e?.hypothesis || e?.variable || result?.id || "Untitled experiment").toString().trim();
  }
  return readable(result?.icp) || "Shared ICP";
}

// The quiet identity sub-line for a person — the strongest identifier not already in the headline.
function personSubline(p: Person, name: string): string | undefined {
  const candidates = [p.org, p.email, p.domain, p.handle ? `@${p.handle}` : null];
  return candidates.find((c) => c && c.trim() && c.trim() !== name)?.trim() || undefined;
}

// The primary descriptor for one reference row, by kind.
function refPrimary(ref: CrossReference, kind: ReferenceKind): string {
  if (kind === "person") return ref.role?.trim() || "Appeared in a run";
  if (kind === "experiment") return ref.variable?.trim() || "Tested in this pipeline";
  if (kind === "claim") return "Carried in this pipeline's positioning";
  return "Named in this pipeline";
}

type ChannelGroup = { channelId: string | null; name: string; refs: CrossReference[] };

export function ReferencesPanel(props: ReferencesPanelProps) {
  const { kind, result, person, loading, channels, onOpenChannel } = props;

  const channelName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of channels ?? []) map.set(c.id, c.name);
    return map;
  }, [channels]);

  // Group the references by the channel they appear in, preserving first-seen channel order. This is
  // the load-bearing view: it turns "12 appearances" into "across these 3 channels", which is the
  // dedup / fatigue read.
  const groups = useMemo<ChannelGroup[]>(() => {
    const order: string[] = [];
    const byChannel = new Map<string, ChannelGroup>();
    for (const ref of result?.references ?? []) {
      const key = ref.channelId || "__unattributed__";
      let group = byChannel.get(key);
      if (!group) {
        const resolved = ref.channelId
          ? ref.channelName || channelName.get(ref.channelId) || ref.channelId
          : "Unattributed";
        group = { channelId: ref.channelId ?? null, name: resolved, refs: [] };
        byChannel.set(key, group);
        order.push(key);
      }
      group.refs.push(ref);
    }
    return order.map((k) => byChannel.get(k)!);
  }, [result, channelName]);

  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const name = headline(props);
  const p = kind === "person" ? person ?? result?.person ?? null : null;
  const subline = p ? personSubline(p, name) : undefined;

  const refCount = result?.referenceCount ?? 0;
  const channelCount = result?.channelCount ?? 0;

  if (loading && !result) {
    return (
      <div className="references-panel references-panel-state">
        <p className="references-state-note">Finding where this {meta.eyebrow.toLowerCase()} appears…</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="references-panel references-panel-state">
        <p className="references-state-note">Select an object to trace where it appears across pipelines.</p>
      </div>
    );
  }

  return (
    <div className="references-panel">
      {/* Identity — what this object IS. */}
      <header className="references-head">
        <span className="references-head-icon" aria-hidden><Icon size={16} /></span>
        <div className="references-head-text">
          <span className="references-eyebrow">{meta.eyebrow}</span>
          <span className="references-name">{name}</span>
          {subline && <span className="references-subline">{subline}</span>}
        </div>
      </header>

      {/* The dedup / fatigue read-out — how many surfacings, across how many channels. */}
      <div className="references-stat">
        <span className="references-stat-figure">{refCount}</span>
        <span className="references-stat-label">
          {meta.noun}{refCount === 1 ? "" : "s"} across {channelCount} pipeline{channelCount === 1 ? "" : "s"}
        </span>
      </div>

      {/* Person identity block — the fuller "who is this" detail. Only the fields that are actually
          known render; nothing is faked. */}
      {p && (
        <dl className="references-identity">
          {p.org && (<><dt>Org</dt><dd>{p.org}</dd></>)}
          {p.email && (<><dt>Email</dt><dd>{p.email}</dd></>)}
          {p.handle && (<><dt>Handle</dt><dd>@{p.handle}</dd></>)}
          {p.domain && (<><dt>Domain</dt><dd>{p.domain}</dd></>)}
          <dt>First seen</dt><dd>{dayLabel(p.firstSeenAt)}</dd>
          <dt>Last touch</dt><dd>{dayLabel(p.lastSeenAt)}</dd>
        </dl>
      )}

      {/* Where it appears, grouped by channel — each block routes the eye to one channel. */}
      <div className="references-where">
        <div className="references-where-title">Where it appears</div>
        {groups.length === 0 ? (
          <p className="references-empty">
            No cross-pipeline appearances yet. When a run surfaces this {meta.eyebrow.toLowerCase()} in a
            pipeline, it shows here — derived from real runs, never seeded.
          </p>
        ) : (
          <ul className="references-channel-list">
            {groups.map((group) => {
              const clickable = !!(group.channelId && onOpenChannel);
              const Head = clickable ? "button" : "div";
              return (
                <li key={group.channelId ?? "__unattributed__"} className="references-channel">
                  <Head
                    type={clickable ? "button" : undefined}
                    className={`references-channel-head${clickable ? " is-clickable" : ""}`}
                    onClick={clickable ? () => onOpenChannel!(group.channelId!) : undefined}
                  >
                    <span className="references-channel-glyph" aria-hidden><Radio size={12} /></span>
                    <span className="references-channel-name">{group.name}</span>
                    <span className="references-channel-count">
                      {group.refs.length} {meta.noun}{group.refs.length === 1 ? "" : "s"}
                    </span>
                  </Head>
                  <ul className="references-ref-list">
                    {group.refs.map((ref, i) => (
                      <li key={`${ref.runId ?? ref.experimentId ?? ref.where}-${i}`} className="references-ref">
                        <div className="references-ref-primary">{refPrimary(ref, kind)}</div>
                        {ref.trigger && <div className="references-ref-trigger">{ref.trigger}</div>}
                        {ref.at && <div className="references-ref-when">{dayLabel(ref.at)}</div>}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
