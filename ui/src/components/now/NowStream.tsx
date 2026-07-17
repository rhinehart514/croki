// The recent-work list beneath the home composer — a compact index of the founder's living
// directions. One row per direction (the founder's sentence), its latest understanding, whether it
// needs you, and its age. Separators, not cards; amber marks attention as a dot, never a fill.
import { relativeAge, type Direction } from "./directionModel";

function stateLabel(direction: Direction): string {
  if (direction.state === "needs-you") return "Needs you";
  if (direction.state === "from-market") return "Replied";
  if (direction.state === "working") return "Working";
  return "Changed";
}

export function NowStream({
  directions,
  now,
  onSelect,
}: {
  directions: Direction[];
  now: number;
  onSelect: (direction: Direction) => void;
}) {
  if (directions.length === 0) {
    return (
      <div className="now-empty" role="status">
        <strong>This is your venture. Tell it what to do.</strong>
        <span>Nothing needs you and nothing is moving yet. Say one sentence above to begin.</span>
      </div>
    );
  }

  return (
    <div className="now-home-recent">
      <span className="now-home-recent-label">Recent directions</span>
      <div className="now-list">
        {directions.map((direction) => (
          <button
            key={direction.id}
            type="button"
            className="now-item"
            data-state={direction.state}
            onClick={() => onSelect(direction)}
          >
            <span className="now-item-mark" aria-hidden="true" />
            <span className="now-item-body">
              <span className="now-item-title">{direction.sentence}</span>
              <span className="now-item-sub">{direction.understanding}</span>
            </span>
            <span className="now-item-aside">
              <span className="now-item-state">{stateLabel(direction)}</span>
              {relativeAge(direction.updatedAt, now) ? <span className="now-item-age">{relativeAge(direction.updatedAt, now)}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
