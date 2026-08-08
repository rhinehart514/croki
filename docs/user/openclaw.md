# OpenClaw

OpenClaw is a user-owned agent runtime. Croki connects to the user's Gateway
through ACP and preserves the selected agent's own model, reasoning,
delegation, tools, instructions, workspace, memory, and skills.

Croki never provisions a special agent, replaces an existing agent, or copies
an agent's workspace or memory into Croki. The Gateway remains the authority
for agent identity and native behavior.

Croki does not prepend an OpenClaw persona or delegation policy. The composer
shows `Agent default` because model choice belongs to the selected OpenClaw
agent, not to a fake Croki model profile. If that agent delegates work, Croki
projects the resulting tool activity without requiring a particular parent or
worker model.

## Before Adding OpenClaw To Croki

Install OpenClaw and make sure its Gateway is running. Create or choose the
agent Croki should use. Any agent already configured in the Gateway is valid;
Croki does not require an agent named `croki`.

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
Agent ID: leave blank to use the discovered native default
Launch arguments: empty
```

Use the provider's Environment variables section for tokens or model-provider secrets. Do not put
secrets in Launch arguments.

Croki discovers and checks that:

- the OpenClaw command is installed
- the selected OpenClaw agent exists
- Croki can connect to the OpenClaw Gateway through ACP

Agent discovery and selection only choose which existing Gateway agent owns the
Croki Thread. They do not change that agent's workspace, memory, skills, model,
or delegation configuration.

After the provider shows as ready, start a new thread and leave **Agent
default** selected to use the Gateway's native default. If discovery is
unavailable, or the Gateway is remote or custom, enter that agent's exact ID
manually as a fallback.

Adding the provider does not guarantee runtime readiness. The OpenClaw CLI,
Gateway, selected agent, model access, and ACP connection must all be available
on the machine running the Croki server.

## What You Will See

The configured OpenClaw agent remains responsible for the thread and final
response. Delegated work appears as ordinary tool activity and a compact
Workstreams projection in the Thread. If a delegated run explicitly identifies
itself as Luna Max, Croki may use that precise label, but Croki does not request
it or replace the agent's delegation policy.

OpenClaw keeps each Croki thread in its own OpenClaw session. Returning to a thread continues the
same coordinated work instead of starting over.

## Troubleshooting

If the provider says the agent is missing, check that Agent ID matches the OpenClaw agent exactly.

Model, reasoning, delegation, and tool-policy failures belong to the configured
OpenClaw agent. Inspect that agent's native configuration and Gateway logs;
Croki does not override them.

OpenClaw's ACP bridge does not accept Croki's own MCP server list. Browser and other tools needed by
workers must therefore be made available through OpenClaw itself.
