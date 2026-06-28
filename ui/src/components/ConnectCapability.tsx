import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowRight, Ban, Check, CheckCheck, Clock, Info, Lock,
  Search, ShieldCheck, Trash2,
} from "lucide-react";
import {
  connectCapability, getCapabilities, reclassifyCapabilityTool, removeCapability,
} from "@/api";
import type { CapabilityServer, CapabilityTool } from "@/types";
import "@/styles/connect-capability.css";

// Known servers offered in the add field. The local demo is a REAL stdio connection
// to the bundled fixture (not seeded data) so the wall can be seen end-to-end; the
// others are real registry targets that connect once their MCP command/auth is set up.
type CatalogEntry = {
  id: string; name: string; url: string;
  trust: "verified" | "community"; demo?: boolean; logo: string;
};
const CATALOG: CatalogEntry[] = [
  { id: "clay-demo", name: "Clay (local demo)", url: "fixture · clay-demo", trust: "verified", demo: true, logo: "C" },
  { id: "clay", name: "Clay", url: "mcp.clay.com", trust: "verified", logo: "C" },
  { id: "google-drive", name: "Google Drive", url: "mcp.google.com/drive", trust: "verified", logo: "▦" },
  { id: "gmail", name: "Gmail", url: "mcp.google.com/gmail", trust: "verified", logo: "✉" },
  { id: "salesforce", name: "Salesforce", url: "mcp.salesforce.com", trust: "verified", logo: "S" },
  { id: "zapier", name: "Zapier", url: "mcp.zapier.com", trust: "verified", logo: "⚡" },
];

type ConfirmState = { server: CapabilityServer; tool: CapabilityTool } | null;

export function ConnectCapability({ onChange }: { onChange?: () => void } = {}) {
  const [servers, setServers] = useState<CapabilityServer[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { servers } = await getCapabilities();
      setServers(servers);
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoaded(true);
    }
  }, [onChange]);

  // Mount-time fetch of connected capabilities — the canonical "subscribe to an external system"
  // effect. setState lands inside refresh's async callback, not synchronously in the effect body, so
  // the cascading-render concern the rule guards against does not apply here.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void refresh(); }, [refresh]);

  const connectedIds = useMemo(() => new Set(servers.map((s) => s.id)), [servers]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATALOG.filter((c) => !q || c.name.toLowerCase().includes(q) || c.url.toLowerCase().includes(q));
  }, [query]);

  const connect = useCallback(async (entry: CatalogEntry) => {
    setBusyId(entry.id);
    setError(null);
    try {
      await connectCapability({ id: entry.id, name: entry.name, url: entry.url, trust: entry.trust, demo: entry.demo });
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`${entry.name}: ${message}`);
    } finally {
      setBusyId(null);
    }
  }, [refresh]);

  const move = useCallback(async (server: CapabilityServer, tool: CapabilityTool, lane: "read" | "write", confirmed: boolean) => {
    setError(null);
    try {
      await reclassifyCapabilityTool(server.id, tool.name, lane, confirmed);
      setConfirm(null);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 409 → the server is asking us to confirm loosening the wall
      if (/confirm/i.test(message)) { setConfirm({ server, tool }); return; }
      setError(message);
    }
  }, [refresh]);

  const onMove = useCallback((server: CapabilityServer, tool: CapabilityTool) => {
    const target = tool.effectiveClass === "read" ? "write" : "read";
    // tightening (→gate) is free; loosening (→free) goes through the confirm
    if (target === "read") void move(server, tool, "read", false);
    else void move(server, tool, "write", true);
  }, [move]);

  const remove = useCallback(async (id: string) => {
    try { await removeCapability(id); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }, [refresh]);

  return (
    <div className="cc">
      <div className="cc-eyebrow">Capabilities</div>
      <h1 className="cc-title">Connect a capability</h1>
      <p className="cc-sub">
        Every tool a server brings is sorted into two lanes: ones that only <b>read</b> run on
        their own, ones that <b>act on the world</b> wait for you. Anything we can&apos;t classify waits too.
      </p>

      {/* add field + catalog */}
      <div className="cc-add">
        <div className="cc-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the MCP registry — Clay, Google Drive, Gmail, Salesforce, Zapier…"
          />
        </div>
        {matches.length > 0 && (
          <div className="cc-results">
            {matches.map((entry) => {
              const already = connectedIds.has(entry.id);
              return (
                <div className="cc-result" key={entry.id}>
                  <div className="cc-logo">{entry.logo}</div>
                  <div className="cc-result-body">
                    <div className="cc-result-name">
                      {entry.name}
                      <span className={`cc-trust ${entry.trust}`}>
                        {entry.trust === "verified" ? <ShieldCheck /> : <AlertTriangle />}
                        {entry.trust === "verified" ? "Verified" : "Community"}
                      </span>
                    </div>
                    <div className="cc-result-url">{entry.url}</div>
                  </div>
                  <button
                    className={`cc-btn ${entry.demo ? "primary" : ""}`}
                    disabled={busyId === entry.id || already}
                    onClick={() => void connect(entry)}
                    type="button"
                  >
                    {already ? "Connected" : busyId === entry.id ? "Connecting…" : "Connect"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {error && <div className="cc-error">{error}</div>}

      {loaded && servers.length === 0 && (
        <div className="cc-empty">
          No capabilities connected yet. Connect the <b>local demo</b> above to see the wall sort a
          server&apos;s tools into Runs free and Behind your gate.
        </div>
      )}

      {servers.map((server) => (
        <ServerCard key={server.id} server={server} onMove={onMove} onRemove={remove} />
      ))}

      {confirm && (
        <LoosenConfirm
          tool={confirm.tool}
          server={confirm.server}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void move(confirm.server, confirm.tool, "read", true)}
        />
      )}
    </div>
  );
}

function authBadge(auth: CapabilityServer["auth"]) {
  if (auth.status === "authed") return <span className="cc-authed ok"><ShieldCheck /> Authed{auth.method ? ` · ${auth.method}` : ""}</span>;
  if (auth.status === "expired") return <span className="cc-authed expired"><Clock /> Auth expired</span>;
  return <span className="cc-authed none"><Info /> Not authed</span>;
}

function ServerCard({ server, onMove, onRemove }: {
  server: CapabilityServer;
  onMove: (s: CapabilityServer, t: CapabilityTool) => void;
  onRemove: (id: string) => void;
}) {
  const untrusted = server.trust === "untrusted";
  const empty = server.toolCount === 0;
  return (
    <div className="cc-server">
      <div className="cc-server-head">
        <div className="cc-logo lg">{server.name.charAt(0).toUpperCase()}</div>
        <div className="cc-server-id">
          <div className="cc-server-name">
            {server.name}
            <span className={`cc-trust ${server.trust}`}>
              {server.trust === "verified" ? <ShieldCheck /> : <AlertTriangle />}
              {server.trust[0].toUpperCase() + server.trust.slice(1)}
            </span>
          </div>
          <div className="cc-server-meta">
            <span className="cc-server-url">{server.url}</span><span className="cc-dot" />
            <span>{server.toolCount} tools</span><span className="cc-dot" />
            {authBadge(server.auth)}
          </div>
        </div>
        <button className="cc-btn sm danger" onClick={() => onRemove(server.id)} type="button" title="Disconnect">
          <Trash2 size={13} />
        </button>
      </div>

      {untrusted ? (
        <>
          <div className="cc-state-msg danger">
            <AlertTriangle />
            <span>Community server, unverified auth. Quarantined — runs isolated, sees none of your product, all writes hard-blocked.</span>
          </div>
          <div className="cc-state-act">
            <button className="cc-btn sm danger" onClick={() => onRemove(server.id)} type="button">Remove</button>
          </div>
        </>
      ) : empty ? (
        <div className="cc-state-msg blind">
          <Ban />
          <span>Connected, but the server exposed no tools. Nothing to classify — check its scopes.</span>
        </div>
      ) : (
        <>
          {/* tally bar with the wall */}
          <div className="cc-tally">
            <div className="cc-tally-side left">
              <div className="cc-tally-num">{server.read.length}</div>
              <div className="cc-tally-lab"><b>Run free</b>read only</div>
            </div>
            <div className="cc-wall"><div className="cc-wall-badge"><Lock /></div></div>
            <div className="cc-tally-side right">
              <div className="cc-tally-lab"><b>Behind your gate</b>can act on the world</div>
              <div className="cc-tally-num">{server.write.length}</div>
            </div>
          </div>

          {/* the two lanes */}
          <div className="cc-cols">
            <div className="cc-col free">
              <div className="cc-col-head"><CheckCheck /> Runs free</div>
              <div className="cc-col-note">Called whenever a workflow needs them. Nothing leaves the building.</div>
              {server.read.map((tool) => (
                <div className={`cc-tool r${tool.override ? " overridden" : ""}`} key={tool.name}>
                  <span className="cc-tool-mark"><Check size={15} /></span>
                  <span className="cc-tool-name" title={tool.reason}>{tool.name}</span>
                  {tool.override && <span className="cc-tool-tag cc-overridden">moved by you</span>}
                  <button className="cc-tool-move" onClick={() => onMove(server, tool)} type="button">Gate it</button>
                </div>
              ))}
              {server.read.length === 0 && <div className="cc-col-note">Nothing runs free yet.</div>}
            </div>

            <div className="cc-wall"><div className="cc-wall-badge"><Lock /></div></div>

            <div className="cc-col gated">
              <div className="cc-col-head"><Lock /> Behind your gate</div>
              <div className="cc-col-note">Staged for your review. You approve each before it acts.</div>
              {server.write.map((tool) => {
                const defaulted = tool.source === "default";
                return (
                  <div className={`cc-tool w${defaulted ? " defaulted" : ""}`} key={tool.name}>
                    <span className="cc-tool-mark">{defaulted ? <AlertTriangle size={14} /> : <Lock size={14} />}</span>
                    <span className="cc-tool-name" title={tool.reason}>{tool.name}</span>
                    <span className="cc-tool-tag">{defaulted ? "unclassified" : tool.override ? "kept gated" : "you approve"}</span>
                    <button className="cc-tool-move" onClick={() => onMove(server, tool)} type="button">Run free</button>
                  </div>
                );
              })}
              {server.defaultedCount > 0 && (
                <div className="cc-defaulted-note">
                  <AlertTriangle />
                  <span><b>{server.defaultedCount} tool{server.defaultedCount > 1 ? "s" : ""} we couldn&apos;t read</b> defaulted behind the gate. Unknown means gated — never the other way.</span>
                </div>
              )}
            </div>
          </div>

          <div className="cc-server-foot">
            <ShieldCheck />
            <span>Reads run on their own. Writes always stop at your gate.</span>
            <span className="cc-spacer" />
            <span>Hover a tool to move it across the wall</span>
          </div>
        </>
      )}
    </div>
  );
}

function LoosenConfirm({ tool, server, onCancel, onConfirm }: {
  tool: CapabilityTool; server: CapabilityServer; onCancel: () => void; onConfirm: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
  return (
    <div className="cc-confirm-scrim" role="dialog" aria-modal="true" aria-label="Loosen the wall">
      {/* a real control for click-outside-to-cancel — sits behind the dialog */}
      <button type="button" className="cc-confirm-backdrop" aria-label="Cancel" onClick={onCancel} />
      <div className="cc-confirm">
        <div className="cc-confirm-top">
          <div className="cc-confirm-ic"><AlertTriangle /></div>
          <div>
            <div className="cc-confirm-h">Let <code>{tool.name}</code> run without you?</div>
            <div className="cc-confirm-p">
              This tool can act on the world through <b>{server.name}</b>. Move it to <b>Runs free</b> and
              workflows can call it on their own — no gate, no review.
            </div>
          </div>
        </div>
        <div className="cc-confirm-move">
          <span className="from"><Lock /> Behind your gate</span>
          <span className="arr"><ArrowRight size={14} /></span>
          <span className="to"><CheckCheck /> Runs free</span>
        </div>
        <div className="cc-confirm-foot">
          <span className="cc-spacer" />
          <button className="cc-btn sm" onClick={onCancel} type="button">Keep gated</button>
          <button className="cc-btn primary sm" onClick={onConfirm} type="button">Loosen the wall</button>
        </div>
      </div>
    </div>
  );
}
