import { useState } from "react";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { getConnection, type ConnectionStatus, type RuntimeReadiness } from "@/api";

// The cold-start runtime gate. Every act of intelligence in Drover — reading your market, shaping
// pipelines, drafting, running a goal to your gate — runs on the founder's OWN local AI subscription.
// Drover is provider-neutral: it works with either Codex (a ChatGPT login) or Claude (an Anthropic
// login), whichever the founder already has. With neither signed in, none of that can run, so instead
// of failing silently we stop here and offer both paths as equals.
//
// The parent lifts this gate off the top-level `connected` flag (any ready runtime). We also guard
// here: whenever a runtime is connected this component renders nothing, so a connected Codex OR a
// connected Claude both drop the gate on their own. The filename stays ConnectClaude for continuity;
// the surface itself is no longer Claude-specific.

// The providers we always present as equal choices when nothing is connected. Each carries the exact
// minimal command, verified against the installed CLIs (codex-cli `codex login`, Claude Code
// `claude auth login`), and a matcher that binds it to a backend readiness row when one is reported.
type Provider = {
  key: string;
  label: string;
  provider: string; // the vendor line under the name
  command: string;
  hint: string;
  matches: (runtime: RuntimeReadiness) => boolean;
};

const PROVIDERS: Provider[] = [
  {
    key: "codex",
    label: "Codex",
    provider: "OpenAI · ChatGPT subscription",
    command: "codex login",
    hint: "Signs in with your existing ChatGPT subscription. No API key.",
    matches: (r) => /codex/i.test(r.id) || r.provider === "codex",
  },
  {
    key: "claude",
    label: "Claude",
    provider: "Anthropic · Claude subscription",
    command: "claude auth login",
    hint: "Signs in with your existing Claude subscription. No API key.",
    matches: (r) => /claude/i.test(r.id) || r.provider === "claude",
  },
];

// Normalize a provider's backend readiness into a SHORT, redacted status — never the raw reason string.
// Provider-specific because it rides that provider's own row; redacted because we map to a fixed phrase
// instead of surfacing any backend error text, env var, or stack.
type ProviderView = { status: "connected" | "disabled" | "off"; note: string };
function viewFor(runtime: RuntimeReadiness | undefined): ProviderView {
  if (!runtime) return { status: "off", note: "Not detected yet" };
  if (runtime.connected) return { status: "connected", note: "Connected" };
  if (/disabl/i.test(runtime.reason ?? "")) return { status: "disabled", note: "Turned off for this install" };
  return { status: "off", note: "Not signed in" };
}

export function ConnectClaude({ connection, onResult }: {
  connection: ConnectionStatus;
  onResult: (status: ConnectionStatus) => void;
}) {
  const [checking, setChecking] = useState(false);
  const [stillOff, setStillOff] = useState<string | null>(null);

  // A ready runtime means the gate is done — render nothing, regardless of which provider it was. This
  // mirrors the parent's own check so a connected Codex OR Claude both lift the gate.
  if (connection.connected) return null;

  const runtimes = connection.runtimes ?? [];
  // The Anthropic API key is only ever a quiet fallback, and only when the backend actually reports it.
  const anthropicApi = runtimes.find((r) => r.id === "anthropic" || r.provider === "anthropic");

  // Re-check on demand: the founder signs in from their terminal, comes back, and confirms. A ready
  // result flows up and the parent drops this gate; a still-unready one gets a concise, non-raw note.
  const recheck = async () => {
    setChecking(true);
    setStillOff(null);
    try {
      const fresh = await getConnection();
      onResult(fresh);
      if (!fresh.connected) setStillOff("Still no AI runtime signed in. Run one of the commands above, then re-check.");
    } catch {
      // Redacted on purpose — a concise, actionable line rather than a raw transport error.
      setStillOff("Couldn't reach the connection check. Try again in a moment.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="product-entry">
      <div className="product-entry-inner">
        <span className="product-entry-eyebrow">Drover</span>
        <h1 className="product-entry-title">Connect an AI runtime.</h1>
        <p className="product-entry-sub">
          Drover reads your market, shapes your pipelines, drafts, and runs a goal to your gate — all on
          your own AI subscription, right here on this machine. Connect Codex or Claude to begin. Either
          one works, and neither needs an API key.
        </p>

        <ul className="connect-runtimes" aria-label="Connect a runtime">
          {PROVIDERS.map((p) => {
            const runtime = runtimes.find((r) => p.matches(r));
            const view = viewFor(runtime);
            return (
              <li key={p.key} className="connect-runtime">
                <div className="connect-runtime-main">
                  <div className="connect-runtime-head">
                    <span className="connect-runtime-name">{p.label}</span>
                    <span className="connect-runtime-provider">{p.provider}</span>
                  </div>
                  {view.status === "disabled" ? (
                    <span className="connect-runtime-hint">Use the other runtime to continue.</span>
                  ) : (
                    <span className="connect-runtime-hint">
                      Run <code className="connect-runtime-cmd">{p.command}</code> in your terminal. {p.hint}
                    </span>
                  )}
                </div>
                <span className="connect-runtime-status" data-status={view.status}>
                  <span className={`connect-runtime-dot ${view.status === "connected" ? "on" : ""}`} aria-hidden="true" />
                  {view.note}
                </span>
              </li>
            );
          })}
        </ul>

        {anthropicApi ? (
          <p className="connect-fallback">
            An <code className="connect-runtime-cmd">ANTHROPIC_API_KEY</code> also works as a fallback if you'd rather not use a subscription login.
          </p>
        ) : null}

        <button className="product-entry-go" onClick={recheck} disabled={checking} type="button">
          {checking
            ? <><LoaderCircle className="spin" size={16} /> Checking…</>
            : <>Re-check connection <ArrowRight size={16} /></>}
        </button>

        {stillOff ? <p className="product-entry-error" role="alert">{stillOff}</p> : null}

        <p className="product-entry-foot">
          Nothing runs on your subscription until you approve it at the gate.
        </p>
      </div>
    </div>
  );
}
