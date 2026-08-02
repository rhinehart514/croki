# OpenClaw

OpenClaw is the coordinator in this setup. It is not the model.

Croki gives OpenClaw one fixed job profile:

- the main thread uses `openai/gpt-5.6-sol` with medium thinking
- useful, self-contained pieces of work are delegated with `sessions_spawn`
- every delegated worker explicitly requests `openai/gpt-5.6-luna` with max thinking
- Croki shows the delegated work in the thread and combines the results into the main answer

Croki does not silently replace Luna Max with another model. If that model is unavailable,
OpenClaw should report the problem clearly.

## Before Adding OpenClaw To Croki

Install OpenClaw and make sure its Gateway is running. In OpenClaw, create an agent named `croki`
whose main model is `openai/gpt-5.6-sol`.

The OpenClaw account or model provider behind that agent must also be able to run
`openai/gpt-5.6-luna`, and the agent's tool policy must allow `sessions_spawn`.

You can confirm the configured agent with:

```bash
openclaw agents list --json
```

## Add It In Croki

Open Settings, add a provider, and choose OpenClaw.

Recommended values:

```text
Display name: OpenClaw
Binary path: openclaw
Agent ID: croki
Launch arguments: empty
```

Use the provider's Environment variables section for tokens or model-provider secrets. Do not put
secrets in Launch arguments.

Croki checks that:

- the OpenClaw command is installed
- the selected OpenClaw agent exists
- that agent's main model is GPT-5.6 Sol
- Croki can connect to the OpenClaw Gateway through ACP

After the provider shows as ready, start a new thread and choose **Sol Medium + Luna Max**.

## What You Will See

Sol remains responsible for the thread and the final response. When it delegates suitable work, the
thread shows a **Luna Max worker** activity row with its running or completed state.

OpenClaw keeps each Croki thread in its own OpenClaw session. Returning to a thread continues the
same coordinated work instead of starting over.

## Troubleshooting

If the provider says the agent is missing, check that Agent ID matches the OpenClaw agent exactly.

If it says the main model is wrong, configure that agent to use `openai/gpt-5.6-sol`.

If a delegated task fails, verify that Luna is available to OpenClaw and that `sessions_spawn` is
allowed. Croki intentionally does not hide this by switching to a different worker model.

OpenClaw's ACP bridge does not accept Croki's own MCP server list. Browser and other tools needed by
workers must therefore be made available through OpenClaw itself.
