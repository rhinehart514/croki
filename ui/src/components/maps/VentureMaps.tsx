import { useMemo, useState } from "react";
import type { WorkIndexOutline, WorkIndexOutlineObject } from "@/api";
import type { Direction } from "@/components/now/directionModel";
import { objectMapFacts, objectMapTypeLabel, ventureGraph, type VentureMapView } from "./ventureMapModel";
import { VentureSystemGraph } from "./VentureSystemGraph";
import "./venture-maps.css";

const VIEW_LABEL: Record<VentureMapView, string> = {
  system: "Whole system",
  product: "Product",
  gtm: "Go-to-market",
};

export function VentureMaps({
  outline,
  directions,
  onOpenDirection,
  onOpenObject,
}: {
  outline: WorkIndexOutline | null | undefined;
  directions: Direction[];
  onOpenDirection: (direction: Direction) => void;
  onOpenObject: (object: WorkIndexOutlineObject) => void;
}) {
  const [view, setView] = useState<VentureMapView>("system");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const directionByRef = useMemo(() => new Map(directions.map((direction) => [direction.id, direction])), [directions]);
  const graph = useMemo(() => ventureGraph(outline, view), [outline, view]);
  const outlineObjects = outline?.objects ?? [];
  const visibleSelectedId = selectedId && graph.nodes.some((node) => node.object.id === selectedId) ? selectedId : null;
  const selected = visibleSelectedId ? outlineObjects.find((object) => object.id === visibleSelectedId) ?? null : null;
  const facts = selected ? objectMapFacts(selected) : [];
  const connections = selected ? graph.links.filter((link) => link.source === selected.id || link.target === selected.id) : [];

  const open = (object: WorkIndexOutlineObject) => {
    const direction = object.threadRefs.map((ref) => directionByRef.get(ref)).find(Boolean);
    if (direction) onOpenDirection(direction);
    else onOpenObject(object);
  };

  return (
    <section className="venture-maps" aria-label="Venture system map" data-view={view}>
      <header className="venture-maps-head">
        <div>
          <span>Generated from venture truth</span>
          <h1>{VIEW_LABEL[view]}</h1>
          <p>{view === "system" ? "Product capability → people reached → evidence returned" : view === "gtm" ? "Every path to market and the Product systems behind it" : "How the product creates and delivers value"}</p>
        </div>
        <div className="venture-map-tabs" role="tablist" aria-label="Map view">
          {(Object.keys(VIEW_LABEL) as VentureMapView[]).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => {
                setView(id);
                setSelectedId(null);
              }}
            >
              {VIEW_LABEL[id]}
            </button>
          ))}
        </div>
      </header>

      {!outline || graph.nodes.length === 0 ? (
        <div className="venture-map-empty" role="status">
          <strong>No connected system yet</strong>
          <p>Direct Product or market work. Drover will place real nodes and links here automatically.</p>
        </div>
      ) : (
        <VentureSystemGraph
          outline={outline}
          view={view}
          selectedId={visibleSelectedId}
          onSelect={setSelectedId}
        />
      )}

      {selected ? (
        <aside className="venture-map-inspector" aria-label={`${selected.name} route`}>
          <header>
            <span>{objectMapTypeLabel(selected)}</span>
            <button type="button" aria-label="Close route" onClick={() => setSelectedId(null)}>×</button>
          </header>
          <h2>{selected.name}</h2>
          {facts.length ? (
            <dl>
              {facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
            </dl>
          ) : selected.statement ? <p>{selected.statement}</p> : null}
          <section>
            <h3>{connections.length ? `Connected to ${connections.length}` : "Missing connection"}</h3>
            {connections.length ? (
              <ul>
                {connections.map((link) => {
                  const otherId = link.source === selected.id ? link.target : link.source;
                  const other = outlineObjects.find((object) => object.id === otherId);
                  return <li key={link.id}><span>{link.label}</span><strong>{other?.name ?? otherId}</strong></li>;
                })}
              </ul>
            ) : <p>This node is visible, but it is not part of an operating path yet.</p>}
          </section>
          <button type="button" className="venture-map-open" onClick={() => open(selected)}>
            {selected.threadRefs.length ? "Open work" : "Open context"}
          </button>
        </aside>
      ) : (
        <div className="venture-map-hint">Select a path to see every system and piece of market work it uses.</div>
      )}
    </section>
  );
}
