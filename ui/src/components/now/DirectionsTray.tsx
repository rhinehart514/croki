import type { DirectionOption } from "@/api";

// The clickable intent options a founder summoned. Each pill names the candidate intent; its full direction
// is the title and what loads into the composer on click. While the grounded call runs, a quiet pending line
// stands in — the founder asked for this, so the wait is honest, not a frozen field.
export function DirectionsTray({ options, loading, onPick }: {
  options: DirectionOption[];
  loading: boolean;
  onPick: (direction: string) => void;
}) {
  if (!loading && options.length === 0) return null;
  return (
    <div className="now-directions" role="group" aria-label="Suggested directions">
      {loading ? (
        <span className="now-directions-pending" role="status">
          <i className="now-intent-orb now-intent-orb--pending now-intent-spinner" aria-hidden="true" />
          Reading your intent…
        </span>
      ) : (
        options.map((option) => (
          <button
            key={option.label}
            type="button"
            className="now-direction"
            title={option.direction}
            onClick={() => onPick(option.direction)}
          >
            <i className="now-direction-orb" aria-hidden="true" />
            <span>{option.label}</span>
          </button>
        ))
      )}
    </div>
  );
}
