// A research browser as a first-class canvas node — pulled onto the board while you work.
//
// Unlike the terminal (the one dark object), this is a light, warm card like the rest of the
// canvas: a URL bar you drive by hand and an embedded page you read alongside the graph. It's a
// workbench surface, not an executed step — you look things up here, then wire what you learned
// downstream. Seeded from config.url so a remount keeps the page you were on.

import { useState } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Globe, ArrowRight, ExternalLink } from "lucide-react";
import type { GTMNode } from "../types";
import "./WebNode.css";

type WebNodeData = { node: GTMNode };

// No scheme → assume https, so "stripe.com" navigates instead of resolving to a dead relative URL.
function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export default function WebNode({ data }: NodeProps<Node<WebNodeData>>) {
  const seed = (data.node.config?.url as string | undefined) || "";
  // `url` is the committed page (drives the iframe); `draft` is the in-progress bar text.
  const [url, setUrl] = useState(normalizeUrl(seed));
  const [draft, setDraft] = useState(seed);

  const go = () => setUrl(normalizeUrl(draft));

  return (
    <div className="web-node" style={{ width: 560, height: 420 }}>
      <div className="web-node-head">{/* the drag handle — bar + body below are nodrag */}
        <Globe size={13} />
        {/* nodrag so typing/selecting in the bar doesn't pan the node out from under you. */}
        <input
          className="web-node-url nodrag"
          value={draft}
          placeholder="Enter a URL…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") go(); }}
        />
        <button className="web-node-go nodrag" onClick={go} title="Go" aria-label="Go">
          <ArrowRight size={13} />
        </button>
        {url && (
          // Escape hatch: many sites send X-Frame-Options / CSP that block embedding, so the
          // iframe goes blank. This always opens the real page in a full browser tab.
          <a className="web-node-pop nodrag" href={url} target="_blank" rel="noreferrer" title="Open in browser">
            <ExternalLink size={13} />
          </a>
        )}
      </div>
      {/* nowheel lets the page scroll itself instead of zooming the canvas. In the Electron build a
          <webview> would embed more sites; an iframe works in both the dev browser and desktop for v1. */}
      {url ? (
        <iframe
          className="web-node-body nodrag nowheel"
          src={url}
          title={data.node.label || "Web"}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="web-node-empty nodrag nowheel">
          <Globe size={22} />
          <p>Enter a URL to load a page here.</p>
        </div>
      )}
      <Handle type="target" position={Position.Left} className="web-node-handle" />
      <Handle type="source" position={Position.Right} className="web-node-handle" />
    </div>
  );
}
