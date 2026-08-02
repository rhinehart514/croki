# Provider architecture

Croki routes every Thread through a configured provider instance. The provider
does the agent work; Croki preserves the Thread, permissions, workspace,
runtime events, checkpoints, and user-visible state around it.

## Supported drivers

| Driver     | Native integration                                 | Product status |
| ---------- | -------------------------------------------------- | -------------- |
| Codex      | Codex app-server protocol                          | Supported      |
| Claude     | Anthropic Claude Agent SDK                         | Supported      |
| OpenCode   | OpenCode SDK and local server                      | Supported      |
| Cursor     | Agent Client Protocol (ACP)                        | Early access   |
| Grok Build | Agent Client Protocol (ACP)                        | Early access   |
| OpenClaw   | Agent Client Protocol through the OpenClaw Gateway | Supported      |

Support means the adapter, settings, health check, model discovery, and Thread
surface exist. Runtime readiness still depends on the local CLI, account,
model access, and provider-specific supporting processes. OpenClaw additionally
requires a running Gateway and configured agent.

## Instances and adapters

A driver describes an integration kind. An instance is one configured copy of
that driver, such as personal and work Codex accounts. Instances have stable
IDs, settings, health state, model discovery, and their own adapter sessions.

`ProviderService` resolves the selected instance through
`ProviderInstanceRegistry`. Its adapter implements the common session boundary:

- start or resume a session;
- send and interrupt turns;
- answer approvals and structured user questions;
- read, roll back, or fork provider conversations when supported;
- stream provider-native events into Croki orchestration;
- stop one session or all sessions owned by the instance.

Adapters translate protocol and lifecycle differences. They should not impose
cross-provider strategy or make providers behave identically.

## Native behavior and harnesses

The selected Croki rule is native provider behavior by default. Native means
Croki does not silently add a persona, planning loop, delegation policy,
workflow, or behavioral prompt. Provider defaults can still differ because the
providers themselves differ.

Keep these concepts separate:

- **Runtime**: the provider SDK, app-server, CLI, or ACP process doing the work.
- **Context**: visible user or repository material attached to a turn.
- **Tools**: actions available to the runtime.
- **Harness**: an explicit policy that changes how the agent approaches a task.

The web composer ships `Native` and `GTM v1`. Native is the default and adds no
Croki behavior prompt. GTM v1 is named, visible, scoped to one turn, resets to
Native after a successful send, and cannot silently modify founder-approved
Canvas truth.

The old Canvas-triggered preamble and fixed OpenClaw Sol/Luna policy have been
removed. Canvas context and tools are available for project turns without
changing behavior when the panel opens or closes. OpenClaw uses the selected
agent's native configuration through ACP.

## Transport boundary

The web and mobile clients communicate with the server over authenticated HTTP
and WebSocket APIs. Typed requests start, resume, interrupt, approve, and stop
provider work. Typed push envelopes carry ordered terminal and orchestration
events back to clients. Payloads are schema-validated at the transport boundary;
decode failures produce structured diagnostics instead of leaking provider
protocol details into UI state.

Provider runtime events then flow through queue-backed ingestion, command, and
checkpoint workers. Completion receipts let tests and orchestration wait for
stable milestones without polling internal state.

## Configuration and secrets

Provider settings are stored per environment. Sensitive environment values are
write-only from the client after save. Put API keys and tokens in the provider
instance's environment settings, not in launch arguments. Health checks should
distinguish an installed adapter from a locally runnable provider.

See [Codex](../providers/codex.md), [Claude](../providers/claude.md), and
[OpenClaw](../providers/openclaw.md) for provider-specific setup.
