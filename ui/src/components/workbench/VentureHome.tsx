// VentureHome — the DEFAULT center of the workbench, shown when nothing is selected. It is the venture's
// operating picture, not a node map: what needs the founder, what the market returned, what is moving, what
// recently changed — the same directionModel fold the left rail computes, read here as a reading surface
// rather than a compact navigator. Selecting a row scopes the workbench, which then opens the best
// representation for that work (consequence gate / product diff / approaches / result). The graph is one
// action away via "Open the map", never the resting center.
//
// Presentation only. Every row is a Direction the frame already folded; Home derives nothing new.
import { ArrowRight, CirclePause, Compass, MessageSquareText, Sparkles, Square, Waves } from "lucide-react";
import {
  relativeAge,
  type Direction,
  type DirectionSection,
  type DirectionSectionKey,
} from "@/components/now/directionModel";
import "./workbench.css";

const SECTION_ICON: Record<DirectionSectionKey, typeof Compass> = {
  "needs-you": CirclePause,
  market: MessageSquareText,
  working: Waves,
  changed: Sparkles,
};

// The primary verb a row offers, by state — the founder reads what the row will do before clicking.
function actionLabel(direction: Direction): string {
  if (direction.state === "needs-you") return "Make the decision";
  if (direction.state === "from-market") return "See what came back";
  if (direction.state === "working") return "Watch it work";
  return "Open";
}

function metaLine(direction: Direction, now: number): string {
  const parts: string[] = [];
  const age = relativeAge(direction.updatedAt, now);
  if (age) parts.push(age);
  if (direction.approaches > 1) parts.push(`${direction.approaches} approaches`);
  if (direction.proofCount > 0) parts.push(`${direction.proofCount} ${direction.proofCount === 1 ? "artifact" : "artifacts"}`);
  return parts.join(" · ");
}

export function VentureHome({
  venture,
  sections,
  now,
  onSelectDirection,
  onStop,
  onSummonMap,
}: {
  venture: { name: string };
  sections: DirectionSection[];
  now: number;
  onSelectDirection: (direction: Direction) => void;
  onStop?: (driveId: string) => void;
  onSummonMap: () => void;
}) {
  const total = sections.reduce((sum, section) => sum + section.directions.length, 0);
  const needsYou = sections.find((section) => section.key === "needs-you")?.directions.length ?? 0;
  const working = sections.find((section) => section.key === "working")?.directions.length ?? 0;

  // A summary line the founder reads on return: what is theirs to move, what is moving on its own.
  const summary = total === 0
    ? null
    : [
        needsYou ? `${needsYou} ${needsYou === 1 ? "decision needs" : "decisions need"} you` : null,
        working ? `${working} moving` : null,
      ].filter(Boolean).join(" · ") || "All quiet — nothing waiting on you";

  return (
    <div className="vh" role="region" aria-label={`${venture.name} — where things stand`}>
      <header className="vh-head">
        <div>
          <span className="vh-eyebrow">Where things stand</span>
          <h1 className="vh-title">{venture.name}</h1>
          {summary ? <p className="vh-summary">{summary}</p> : null}
        </div>
        <button type="button" className="vh-map" onClick={onSummonMap}>
          <Compass aria-hidden="true" /> Open the map
        </button>
      </header>

      {total === 0 ? (
        <div className="vh-empty" role="status">
          <Compass aria-hidden="true" className="vh-empty-mark" />
          <p className="vh-empty-title">No directed work yet</p>
          <p className="vh-empty-body">
            Say what Drover should accomplish for {venture.name} in the field below, and the work opens here.
          </p>
        </div>
      ) : (
        <div className="vh-sections">
          {sections.map((section) => {
            const Icon = SECTION_ICON[section.key];
            return (
              <section key={section.key} className="vh-section" data-tone={section.tone}>
                <h2 className="vh-section-head">
                  <Icon aria-hidden="true" />
                  {section.label}
                  <span className="vh-section-count">{section.directions.length}</span>
                </h2>
                <ul className="vh-list">
                  {section.directions.map((direction) => {
                    const driveId = direction.activeDriveIds[0];
                    const stoppable = direction.state === "working" && driveId && onStop;
                    return (
                      <li key={direction.id}>
                        <button
                          type="button"
                          className="vh-row"
                          data-state={direction.state}
                          onClick={() => onSelectDirection(direction)}
                        >
                          <span className="vh-row-dot" aria-hidden="true" />
                          <span className="vh-row-main">
                            <span className="vh-row-sentence">{direction.sentence}</span>
                            {direction.understanding ? (
                              <span className="vh-row-understanding">{direction.understanding}</span>
                            ) : null}
                            <span className="vh-row-meta">{metaLine(direction, now)}</span>
                          </span>
                          <span className="vh-row-action">
                            {actionLabel(direction)} <ArrowRight aria-hidden="true" />
                          </span>
                        </button>
                        {stoppable ? (
                          <button
                            type="button"
                            className="vh-row-stop"
                            onClick={() => onStop?.(driveId)}
                            aria-label={`Stop work on ${direction.sentence}`}
                          >
                            <Square aria-hidden="true" /> Stop
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
