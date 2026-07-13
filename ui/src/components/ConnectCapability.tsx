import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, Ban, Check, CheckCheck, Clock, Info, Lock,
  ShieldCheck, Trash2,
} from "lucide-react";
import {
  connectCapability, getCapabilities, getCapabilityInventory, reclassifyCapabilityTool, removeCapability,
} from "@/api";
import type { CapabilityInventory, CapabilityServer, CapabilityTool } from "@/types";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import "@/styles/connect-capability.css";

// The only capability wired to genuinely connect today: the bundled local demo MCP server. It is a
// REAL stdio connection to a shipped fixture (not seeded data), so the founder can watch the wall
// sort a live server's tools end-to-end. There is no external MCP registry connected yet, so nothing
// else is offered here — a real server appears once its own connection is actually configured, never
// as a placeholder row wearing a "Verified" badge it has not earned.
type CatalogEntry = {
  id: string; name: string; url: string;
  trust: "verified" | "community"; demo?: boolean; logo: string;
};
const DEMO_CAPABILITY: CatalogEntry = {
  id: "clay-demo", name: "Clay (local demo)", url: "fixture · clay-demo", trust: "verified", demo: true, logo: "C",
};

type ConfirmState = { server: CapabilityServer; tool: CapabilityTool } | null;

export function ConnectCapability({ onChange }: { onChange?: () => void } = {}) {
  const [servers, setServers] = useState<CapabilityServer[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [confirmPending, setConfirmPending] = useState(false);
  const confirmPendingRef = useRef(false);
  const [loaded, setLoaded] = useState(false);
  // The live inventory — its distinct serverIds are the founder's already-configured MCP servers, which
  // seed the add-a-server form (one tap to connect a server they've already wired elsewhere). null when
  // the backend hasn't produced it yet — the form still works, just without the seeded suggestions.
  const [inventory, setInventory] = useState<CapabilityInventory | null>(null);

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
  // The founder's configured servers (from the live inventory) — used to seed the add-server form.
  useEffect(() => {
    let live = true;
    void getCapabilityInventory().then((inv) => { if (live) setInventory(inv); });
    return () => { live = false; };
  }, []);

  const connectedIds = useMemo(() => new Set(servers.map((s) => s.id)), [servers]);
  const demoConnected = connectedIds.has(DEMO_CAPABILITY.id);
  // Distinct serverIds the founder already has wired (from the inventory) that aren't yet connected here —
  // the one-tap seeds for the add-server form.
  const seededServers = useMemo(() => {
    const ids = new Set<string>();
    for (const t of inventory?.tools ?? []) if (!connectedIds.has(t.serverId)) ids.add(t.serverId);
    return [...ids];
  }, [inventory, connectedIds]);

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

  // Connect an ARBITRARY server the founder names — a real add action, not just the demo. The backend
  // already supports connecting any server (name + url, or a command). We hand it what the founder typed
  // (or a one-tapped seed from their configured servers) and refresh.
  const connectServer = useCallback(async (input: { name: string; url?: string; command?: string }) => {
    const name = input.name.trim();
    if (!name) return;
    setBusyId(`form:${name}`);
    setError(null);
    try {
      await connectCapability({
        name,
        ...(input.url?.trim() ? { url: input.url.trim() } : {}),
        ...(input.command?.trim() ? { command: input.command.trim() } : {}),
        trust: "community",
      });
      await refresh();
    } catch (err) {
      setError(`${name}: ${err instanceof Error ? err.message : String(err)}`);
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

  const confirmMove = useCallback(async (server: CapabilityServer, tool: CapabilityTool) => {
    if (confirmPendingRef.current) return;
    confirmPendingRef.current = true;
    setConfirmPending(true);
    try {
      await move(server, tool, "read", true);
    } finally {
      confirmPendingRef.current = false;
      setConfirmPending(false);
    }
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

      {/* Connect a real server — name it and give it a URL (or a launch command). The backend connects
          any server, sorts its tools across the wall, and it appears below. The bundled demo stays as one
          quick option; servers you've already configured elsewhere seed as one-tap connects. */}
      <div className="cc-add">
        <div className="cc-add-lead">Add a server</div>
        <AddServerForm onConnect={connectServer} busy={busyId?.startsWith("form:") ?? false} />
        {seededServers.length > 0 && (
          <div className="cc-seeded">
            <div className="cc-seeded-lead">From servers you&apos;ve already configured</div>
            <div className="cc-seeded-chips">
              {seededServers.map((id) => (
                <Button
                  key={id}
                  type="button"
                  className="cc-btn sm"
                  variant="outline"
                  size="sm"
                  disabled={busyId === `form:${id}`}
                  onClick={() => void connectServer({ name: id })}
                  title={`Connect ${id}`}
                >
                  {busyId === `form:${id}` ? "Connecting…" : `+ ${id}`}
                </Button>
              ))}
            </div>
          </div>
        )}
        {!demoConnected && (
          <div className="cc-results">
            <div className="cc-result">
              <div className="cc-logo">{DEMO_CAPABILITY.logo}</div>
              <div className="cc-result-body">
                <div className="cc-result-name">
                  {DEMO_CAPABILITY.name}
                  <span className="cc-trust demo">Bundled demo</span>
                </div>
                <div className="cc-result-url">{DEMO_CAPABILITY.url}</div>
              </div>
              <Button
                className="cc-btn primary"
                disabled={busyId === DEMO_CAPABILITY.id}
                onClick={() => void connect(DEMO_CAPABILITY)}
                type="button"
              >
                {busyId === DEMO_CAPABILITY.id ? "Connecting…" : "Connect"}
              </Button>
            </div>
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
          pending={confirmPending}
          onCancel={() => { if (!confirmPendingRef.current) setConfirm(null); }}
          onConfirm={() => void confirmMove(confirm.server, confirm.tool)}
        />
      )}
    </div>
  );
}

// The real add-a-server form: a name, plus either a URL (a hosted MCP server) or a launch command (a
// local one). One is enough. On connect the backend links it and sorts its tools across the wall.
function AddServerForm({ onConnect, busy }: {
  onConnect: (input: { name: string; url?: string; command?: string }) => void | Promise<void>;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const canSubmit = name.trim() !== "" && (url.trim() !== "" || command.trim() !== "") && !busy;
  const submit = () => {
    if (!canSubmit) return;
    void onConnect({ name, url, command });
    setName(""); setUrl(""); setCommand("");
  };
  return (
    <div className="cc-form">
      <div className="cc-form-row">
        <Input
          className="cc-form-in"
          value={name}
          placeholder="Name (e.g. Linear)"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
      </div>
      <div className="cc-form-row">
        <Input
          className="cc-form-in"
          value={url}
          placeholder="Server URL (https://…)"
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
      </div>
      <div className="cc-form-row">
        <Input
          className="cc-form-in"
          value={command}
          placeholder="or a launch command (npx …)"
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <Button className="cc-btn primary" type="button" disabled={!canSubmit} onClick={submit}>
          {busy ? "Connecting…" : "Connect"}
        </Button>
      </div>
      <div className="cc-form-hint">Give it a URL or a command — either one connects the server. Every tool it brings is sorted read (runs free) or write (behind your gate).</div>
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
        <Button className="cc-btn sm danger" variant="destructive" size="sm" onClick={() => onRemove(server.id)} type="button" title="Disconnect">
          <Trash2 size={13} />
        </Button>
      </div>

      {untrusted ? (
        <>
          <div className="cc-state-msg danger">
            <AlertTriangle />
            <span>Community server, unverified auth. Quarantined — runs isolated, sees none of your product, all writes hard-blocked.</span>
          </div>
          <div className="cc-state-act">
            <Button className="cc-btn sm danger" variant="destructive" size="sm" onClick={() => onRemove(server.id)} type="button">Remove</Button>
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

function LoosenConfirm({ tool, server, pending, onCancel, onConfirm }: {
  tool: CapabilityTool; server: CapabilityServer; pending: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <AlertDialog defaultOpen onOpenChange={(nextOpen) => { if (!nextOpen && !pending) onCancel(); }}>
      <AlertDialogContent
        className="cc-confirm-scrim"
        overlayClassName="!bg-transparent !backdrop-blur-none"
        style={{ transform: "none", maxWidth: "none", borderRadius: 0, background: "transparent", boxShadow: "none", padding: 0 }}
      >
      <div className="cc-confirm">
        <div className="cc-confirm-top">
          <div className="cc-confirm-ic"><AlertTriangle /></div>
          <div>
            <AlertDialogTitle className="cc-confirm-h">Let <code>{tool.name}</code> run without you?</AlertDialogTitle>
            <AlertDialogDescription className="cc-confirm-p">
              This tool can act on the world through <b>{server.name}</b>. Move it to <b>Runs free</b> and
              workflows can call it on their own — no gate, no review.
            </AlertDialogDescription>
          </div>
        </div>
        <div className="cc-confirm-move">
          <span className="from"><Lock /> Behind your gate</span>
          <span className="arr"><ArrowRight size={14} /></span>
          <span className="to"><CheckCheck /> Runs free</span>
        </div>
        <AlertDialogFooter className="cc-confirm-foot !mx-0 !mb-0 !flex-row !rounded-none !bg-transparent">
          <span className="cc-spacer" />
          <AlertDialogCancel className="cc-btn sm" disabled={pending} onClick={onCancel}>Keep gated</AlertDialogCancel>
          <AlertDialogAction className="cc-btn primary sm" disabled={pending} onClick={onConfirm} type="button">
            {pending ? "Loosening…" : "Loosen the wall"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
