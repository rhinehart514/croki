// The Query console — a workbench surface for interrogating the project's own People in canvas space.
//
// This replaces the old passive "People" Summon view: instead of a static list you can't ask anything,
// you get presets + free-text filter that run client-side over the durable People already loaded into
// node data. Read-only, no fetch — all querying is local.
//
// v1 queries People only: the experiment-matrix data isn't threaded into node data yet, so an
// "Experiments" preset folds in once that data is reachable here.

import { useMemo, useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Database, Search } from "lucide-react";
import type { GTMNode, Person, PersonAppearance } from "../types";
import "./QueryNode.css";

type Preset = "all" | "fit" | "recent";

// Latest appearance by timestamp — the "where they last surfaced" the row sub-line and Recent sort read.
function latestAppearance(p: Person): PersonAppearance | null {
  if (!p.appearances.length) return null;
  return [...p.appearances].sort((a, b) => (b.at || "").localeCompare(a.at || ""))[0];
}

// The Person type carries no numeric fit/score, so the one real engagement signal we have is how many
// appearances a person accumulated across channels — more presence = stronger fit. "By fit" ranks on it,
// and it's what the row badge shows.
function fitSignal(p: Person): number {
  return p.appearances.length;
}

function displayName(p: Person): string {
  return p.name || p.handle || p.email || p.org || p.identityKey;
}

export default function QueryNode({ data }: NodeProps<Node<{ node: GTMNode; people?: Person[] }>>) {
  const people = useMemo(() => data.people ?? [], [data.people]);
  const [preset, setPreset] = useState<Preset>("all");
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matched = people.filter((p) => {
      if (!q) return true;
      // Substring across identity strings + every appearance trigger, so you can search by who they are
      // OR by the why-now that found them.
      const hay = [p.name, p.org, p.handle, p.email, p.domain, p.identityKey]
        .concat(p.appearances.map((a) => a.trigger))
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    if (preset === "fit") {
      return [...matched].sort((a, b) => fitSignal(b) - fitSignal(a));
    }
    if (preset === "recent") {
      return [...matched].sort((a, b) => (b.lastSeenAt || "").localeCompare(a.lastSeenAt || ""));
    }
    return matched;
  }, [people, preset, query]);

  return (
    <div className="q-node" style={{ width: 380, height: 340 }}>
      <div className="q-node-head">{/* the drag handle — body below is nodrag/nowheel */}
        <Database size={13} />
        <span className="q-node-title">{data.node.label || "Query"}</span>
        <span className="q-node-count">{results.length}</span>
      </div>

      <div className="q-node-chips">
        {([["all", "All"], ["fit", "By fit"], ["recent", "Recent"]] as [Preset, string][]).map(
          ([key, label]) => (
            <button
              key={key}
              className={`q-chip${preset === key ? " q-chip-on" : ""}`}
              onClick={() => setPreset(key)}
            >
              {label}
            </button>
          ),
        )}
      </div>

      <div className="q-node-filter">
        <Search size={12} />
        <input
          className="q-node-input"
          placeholder="Filter people, orgs, triggers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* nodrag/nowheel so typing and scrolling the results don't pan or zoom the canvas. */}
      <div className="q-node-body nodrag nowheel">
        {people.length === 0 ? (
          <div className="q-node-empty">No people yet — your channels haven't promoted anyone.</div>
        ) : results.length === 0 ? (
          <div className="q-node-empty">No matches.</div>
        ) : (
          results.map((p) => {
            const last = latestAppearance(p);
            const sub = last?.trigger || p.org || p.email || "";
            const count = fitSignal(p);
            return (
              <div key={p.id} className="q-row">
                <div className="q-row-main">
                  <span className="q-row-title">{displayName(p)}</span>
                  {count > 0 && <span className="q-row-badge">{count}</span>}
                </div>
                {sub && <div className="q-row-sub">{sub}</div>}
              </div>
            );
          })
        )}
      </div>

      <Handle type="target" position={Position.Left} className="q-node-handle" />
      <Handle type="source" position={Position.Right} className="q-node-handle" />
    </div>
  );
}
