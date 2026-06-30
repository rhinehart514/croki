// PlaysStrip — the Plays & Assets band (layer "artifacts"): what the runs have built and staged behind
// the founder gate. The band's belief already tallies the staged gate items and artifacts; this lists
// the real assets behind that count — the project's stored artifacts — as a strip of cards, with the
// staged-item summary carried as a chip. Read-only; nothing here sends. Honest-blank when no play or
// asset exists yet.

import { useEffect, useState } from "react";
import type { LayerDiagramProps } from "@/components/lenses/LayerDiagramProps";
import { getProject } from "@/api";
import "./BandDiagrams.css";

type Asset = { name: string; kind: string; sub?: string };

// Pull a readable card out of a loosely-typed artifact bag — assets vary in shape across runs.
function readAsset(value: unknown): Asset | null {
  if (typeof value === "string") {
    const s = value.trim();
    return s ? { name: s, kind: "asset" } : null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = obj[k];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
      return undefined;
    };
    const name = pick("title", "name", "label", "headline", "subject", "ref");
    const kind = pick("kind", "type", "category", "channel") ?? "asset";
    const sub = pick("summary", "description", "preview", "body", "status");
    if (name) return { name, kind, sub };
  }
  return null;
}

export function PlaysStrip({ belief }: LayerDiagramProps) {
  const [assets, setAssets] = useState<Asset[] | null>(null);

  useEffect(() => {
    let live = true;
    getProject()
      .then(({ project }) => {
        if (!live) return;
        const raw = Array.isArray(project.sharedContext?.artifacts) ? project.sharedContext.artifacts : [];
        setAssets(raw.map(readAsset).filter((a): a is Asset => a !== null));
      })
      .catch(() => { if (live) setAssets([]); });
    return () => { live = false; };
  }, []);

  if (assets === null) {
    return <div className="band-diagram-load"><span className="band-diagram-spin" />Reading the staged work…</div>;
  }

  const hasStaged = Boolean(belief.belief) || belief.evidence.length > 0;
  if (assets.length === 0 && !hasStaged) {
    return (
      <div className="band-diagram-empty" role="region" aria-label="Plays & Assets — nothing staged yet">
        <strong>Nothing staged yet</strong>
        <span>
          When a run drafts a play or builds an asset, it stages here behind the founder gate — drafts,
          one-pagers, sequences — waiting for your review. Nothing sends until you release it.
        </span>
      </div>
    );
  }

  return (
    <div className="band-diagram" role="region" aria-label="Plays and assets strip">
      <div className="band-diagram-head">
        <span className="band-diagram-kicker">plays & assets · staged behind the gate</span>
        {belief.evidence.length > 0 && (
          <div className="ledger-summary">
            {belief.evidence.map((e, i) => <span key={i} className="ledger-chip">{e}</span>)}
          </div>
        )}
      </div>

      {assets.length === 0 ? (
        <p className="band-diagram-sub">
          {belief.belief || "Items are staged behind the gate."} The individual assets show here as the
          runs persist them.
        </p>
      ) : (
        <div className="plays-grid">
          {assets.map((a, i) => (
            <div key={i} className="play-card">
              <span className="play-kind">{a.kind}</span>
              <span className="play-name">{a.name}</span>
              {a.sub && <span className="play-sub">{a.sub}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
