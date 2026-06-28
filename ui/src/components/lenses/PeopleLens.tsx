// PeopleLens — the shared People object, drawn as the find-references / dedup surface.
//
// People are the keystone GTM object: one durable identity per human, promoted from real run
// entrants, shared across channels. This lens answers "who has this go-to-market actually touched,
// and where?" Each person is one ObjectCard (the same card every lens uses, with the person→User
// glyph from kindVisual); selecting a person is FOCUS-TO-TRACE — the panel lists exactly where they
// appear across channels, the per-appearance why-now trigger that found them there, and the last
// touch. Read-only: People are real state derived from runs, never edited here, and nothing sends.

import { useMemo } from "react";
import type { ChannelMeta, Person, PersonAppearance } from "@/types";
import { ObjectCard, LensPanel } from "@/components/lenses/shared";
import "./PeopleLens.css";

export type PeopleLensProps = {
  people: Person[];
  channels: ChannelMeta[];
  selected: string | null;
  onSelect: (id: string) => void;
};

// The human-readable display name for a person, strongest identifier first so a card never reads as
// blank when only an org or handle is known.
function displayName(p: Person): string {
  return (p.name || p.org || p.handle || p.email || p.domain || p.identityKey || "Unknown").trim();
}

// The quiet secondary line — where they're from, without repeating the headline.
function subline(p: Person): string | undefined {
  const name = displayName(p);
  const candidates = [p.org, p.email, p.domain, p.handle ? `@${p.handle}` : null];
  return candidates.find((c) => c && c.trim() && c.trim() !== name)?.trim() || undefined;
}

// A short, stable date label for the last touch — no relative-time machinery, just the day.
function dayLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function PeopleLens({ people, channels, selected, onSelect }: PeopleLensProps) {
  const channelName = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of channels) map.set(c.id, c.name);
    return map;
  }, [channels]);

  const selectedPerson = useMemo(
    () => people.find((p) => p.id === selected) ?? null,
    [people, selected],
  );

  const totalAppearances = useMemo(
    () => people.reduce((sum, p) => sum + (p.appearances?.length ?? 0), 0),
    [people],
  );

  if (people.length === 0) {
    return (
      <div className="people-lens people-lens-empty" role="region" aria-label="People lens">
        <p className="people-empty-note">
          No people yet. When a run surfaces a real person or org, they're promoted to a durable
          identity here — one card per human, with every channel they appear in and the why-now that
          found them. People are derived from real runs; nothing is seeded.
        </p>
      </div>
    );
  }

  return (
    <div className="people-lens" role="region" aria-label="People lens">
      <div className="people-grid">
        {people.map((p) => {
          const channelCount = new Set(
            (p.appearances ?? []).map((a) => a.channelId).filter(Boolean),
          ).size;
          const states = [
            { id: "channels", label: `${channelCount} channel${channelCount === 1 ? "" : "s"}` },
            { id: "appearances", label: `${p.appearances?.length ?? 0} appearance${(p.appearances?.length ?? 0) === 1 ? "" : "s"}` },
          ];
          return (
            <ObjectCard
              key={p.id}
              kind="person"
              name={displayName(p)}
              summary={subline(p)}
              provenance="derived"
              states={states}
              hasSignal={(p.appearances?.length ?? 0) > 0}
              selected={selected === p.id}
              onSelect={() => onSelect(p.id)}
              footer={
                <div className="people-card-foot">
                  <span>Last touch {dayLabel(p.lastSeenAt)}</span>
                </div>
              }
            />
          );
        })}
      </div>

      {/* Focus-to-trace — where the selected person appears across channels. The appearances are
          authoritative state already on the Person (the same data the references endpoint derives
          from), so the trace needs no extra fetch. */}
      {selectedPerson && (
        <LensPanel title="Where they appear" className="people-trace lens-panel-dock">
          <div className="people-trace-head">
            <span className="people-trace-name">{displayName(selectedPerson)}</span>
            <span className="people-trace-sub">
              {selectedPerson.appearances?.length ?? 0} appearance
              {(selectedPerson.appearances?.length ?? 0) === 1 ? "" : "s"}
            </span>
          </div>
          {(selectedPerson.appearances ?? []).length === 0 ? (
            <p className="people-trace-blank">No recorded appearances yet.</p>
          ) : (
            <ul className="people-trace-list">
              {(selectedPerson.appearances ?? []).map((a: PersonAppearance, i) => (
                <li key={`${a.channelId}-${a.runId}-${i}`} className="people-trace-row">
                  <div className="people-trace-row-top">
                    <span className="people-trace-channel">
                      {(a.channelId && channelName.get(a.channelId)) || a.channelId || "Unattributed"}
                    </span>
                    <span className="people-trace-role">{a.role}</span>
                  </div>
                  {a.trigger && <div className="people-trace-trigger">{a.trigger}</div>}
                  <div className="people-trace-when">{dayLabel(a.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </LensPanel>
      )}

      {/* The count read-out — how many people, how many touches, mirrors the jobs legend idiom. */}
      <LensPanel title="People" className="people-legend lens-panel-dock">
        <div className="people-legend-counts">
          <span className="product-count product-count-cited">
            {people.length} {people.length === 1 ? "person" : "people"}
          </span>
          <span className="product-count">{totalAppearances} appearance{totalAppearances === 1 ? "" : "s"}</span>
        </div>
        <div className="people-legend-note">Promoted from real runs · select to trace where they appear</div>
      </LensPanel>
    </div>
  );
}
