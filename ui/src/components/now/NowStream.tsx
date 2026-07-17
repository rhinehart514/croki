// The consequence stream — an index of living founder directions and meaningful returns. Each row is
// one direction (the founder's sentence), its latest understanding, whether it needs you, and how many
// approaches are running underneath — never one row per internal record. Quiet when the venture is quiet.
import type { Direction, DirectionSection } from "./directionModel";

function elapsed(since: string | null, now: number): string | null {
  if (!since) return null;
  const started = Date.parse(since);
  if (!Number.isFinite(started)) return null;
  const mins = Math.max(0, Math.round((now - started) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function NowStream({
  sections,
  now,
  onSelect,
}: {
  sections: DirectionSection[];
  now: number;
  onSelect: (direction: Direction) => void;
}) {
  if (sections.length === 0) {
    return (
      <div className="now-empty" role="status">
        <strong>This is your venture. Tell it what to do.</strong>
        <span>Nothing needs you and nothing is moving yet. Say one sentence above to begin.</span>
      </div>
    );
  }

  return (
    <>
      {sections.map((section) => (
        <section className="now-section" data-tone={section.tone} key={section.key} aria-label={section.label}>
          <header className="now-section-head">
            <span>{section.label}</span>
            <span className="now-section-count">{section.directions.length}</span>
          </header>
          {section.directions.map((direction) => {
            const time = elapsed(direction.updatedAt, now);
            return (
              <button key={direction.id} type="button" className="now-row" data-tone={direction.state} onClick={() => onSelect(direction)}>
                <span className="now-row-dot" aria-hidden="true" />
                <span className="now-row-body">
                  <span className="now-row-title">{direction.sentence}</span>
                  <span className="now-row-detail">{direction.understanding}</span>
                </span>
                <span className="now-row-aside">
                  <span className="now-row-state">{sectionState(section.tone, direction)}</span>
                  {time ? <span className="now-row-state">{time}</span> : null}
                </span>
              </button>
            );
          })}
        </section>
      ))}
    </>
  );
}

function sectionState(tone: Direction["state"], direction: Direction): string {
  if (tone === "needs-you") return "Needs you";
  if (tone === "from-market") return "Replied";
  if (tone === "working") return "Working";
  void direction;
  return "Changed";
}
