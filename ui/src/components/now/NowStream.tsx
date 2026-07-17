// The consequence stream — a live account of what needs the founder, what is moving, what the market
// said, and what changed. Not a chat log and not a dashboard: every row answers what/why/state and
// whether it needs you. Selecting a row opens its detail. Quiet when the venture is quiet.
import type { NowRow, NowSection } from "./nowModel";

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
  onSelectRow,
}: {
  sections: NowSection[];
  now: number;
  onSelectRow: (row: NowRow) => void;
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
            <span className="now-section-count">{section.rows.length}</span>
          </header>
          {section.rows.map((row) => {
            const time = elapsed(row.startedAt ?? row.occurredAt, now);
            return (
              <button
                key={row.id}
                type="button"
                className="now-row"
                data-tone={row.state}
                onClick={() => onSelectRow(row)}
              >
                <span className="now-row-dot" aria-hidden="true" />
                <span className="now-row-body">
                  <span className="now-row-title">{row.title}</span>
                  {row.detail ? <span className="now-row-detail">{row.detail}</span> : null}
                  {row.attribution ? <span className="now-row-meta">{row.attribution}</span> : null}
                </span>
                <span className="now-row-aside">
                  <span className="now-row-state">{row.stateLabel}</span>
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
