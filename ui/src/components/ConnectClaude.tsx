import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { getConnection, type ConnectionStatus } from "@/api";

// Hard first-run gate. Every act of intelligence in Drover — reading your market, shaping pipelines,
// drafting, running a goal to your gate — runs on YOUR Claude subscription through the local Claude
// Code harness. With no Claude signed in, the honest truth is the product can do none of it, so instead
// of a silent no-op behind a dismissible banner we stop here and walk the founder through connecting.
// When Claude is signed in this screen never renders and the flow is byte-for-byte unchanged.
export function ConnectClaude({ connection, onResult }: {
  connection: ConnectionStatus;
  onResult: (status: ConnectionStatus) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [stillOff, setStillOff] = useState<string | null>(null);

  // Re-check on demand: the founder signs in from their terminal, comes back, and confirms. A connected
  // result flows up to the parent, which stops rendering this gate; a still-disconnected one reports the
  // precise reason here so they know what to fix.
  const recheck = async () => {
    setChecking(true);
    setStillOff(null);
    try {
      const fresh = await getConnection();
      onResult(fresh);
      if (!fresh.connected) setStillOff(fresh.reason ?? "Still not seeing a signed-in Claude.");
    } catch (err) {
      setStillOff(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  // An install that explicitly disabled Claude can't be fixed by signing in — name that plainly and drop
  // the walkthrough, which would only mislead.
  const disabled = /disabled/i.test(connection.reason ?? "");

  return (
    <div className="product-entry">
      <div className="product-entry-inner">
        <span className="product-entry-eyebrow">Drover</span>
        <h1 className="product-entry-title">Connect Claude to begin.</h1>
        <p className="product-entry-sub">
          Drover reads your market, shapes your pipelines, drafts, and runs a goal to your gate on your
          own Claude subscription. None of that runs until Claude is signed in on this machine — so this
          is the one thing to set up first.
        </p>

        {disabled ? (
          <p className="product-entry-error" role="alert">
            Claude is turned off for this install (GTM_IDE_DISABLE_CLAUDE_CODE). Remove that setting and
            restart Drover to use it.
          </p>
        ) : (
          <ol className="connect-steps">
            <li className="connect-step">
              <span className="connect-step-num">1</span>
              <div className="connect-step-body">
                <strong>Install Claude Code</strong>
                <span>The local harness Drover drives. Install it once: <code>npm install -g @anthropic-ai/claude-code</code></span>
              </div>
            </li>
            <li className="connect-step">
              <span className="connect-step-num">2</span>
              <div className="connect-step-body">
                <strong>Sign in with your subscription</strong>
                <span>
                  Run <code>claude</code> in your terminal and complete the login — a Claude subscription
                  needs no API key. (Or set <code>CLAUDE_CODE_OAUTH_TOKEN</code>, or an{" "}
                  <code>ANTHROPIC_API_KEY</code>.)
                </span>
              </div>
            </li>
            <li className="connect-step">
              <span className="connect-step-num">3</span>
              <div className="connect-step-body">
                <strong>Re-check</strong>
                <span>Come back here and confirm the connection — then point Drover at your product.</span>
              </div>
            </li>
          </ol>
        )}

        {!disabled && (
          <button className="product-entry-go" onClick={recheck} disabled={checking} type="button">
            {checking
              ? <><LoaderCircle className="spin" size={16} /> Checking…</>
              : <>Re-check connection <ArrowRight size={16} /></>}
          </button>
        )}

        {stillOff ? <p className="product-entry-error" role="alert">{stillOff}</p> : null}

        <p className="product-entry-foot">
          Nothing runs on your subscription until you approve it at the gate.
          {connection.reason ? <> Detected: {connection.reason}</> : null}
        </p>
      </div>
    </div>
  );
}
