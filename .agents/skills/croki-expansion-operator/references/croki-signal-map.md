# Croki signal map

Last inspected: 2026-08-12

## Observed sources

| Source               | What it establishes                                                                                                                                                                                         | What it does not establish                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Relay Axiom traces   | First-party relay, mobile, and relay-client spans share a 30-day Axiom trace dataset. Authenticated client spans carry pseudonymous user ID. Environment-authenticated spans carry environment ID.          | A working query credential, company identity, buyer, relationship, revenue intent, or outreach authority.               |
| Relay persistence    | User-scoped mobile devices, environment links, managed endpoint allocations, per-user tunnel limits, delivery attempts, and limited agent-activity state exist.                                             | Permission to query production, a commercial account model, or an outbound contact.                                     |
| Managed-tunnel limit | The default is three active managed tunnels. An attempted fourth link raises ManagedTunnelLimitExceeded with user, environment, active count, and maximum.                                                  | That the user wants to pay, that capacity is the correct offer, or that the limit should be sold rather than changed.   |
| Marketing and terms  | Croki is positioned as a free, open-source control plane for coding agents. The terms say there is currently no T3 Tools subscription fee unless clearly stated for a feature.                              | A paid expansion offer or pricing authority.                                                                            |
| Privacy policy       | Croki describes collecting account, environment, device, connection, latency, error, and diagnostic information; it also describes service communications and aggregated or de-identified product analysis. | A legal conclusion that personalized usage-based sales outreach is permitted.                                           |
| Local state.sqlite   | Durable local projects, threads, turns, activities, checkpoints, approvals, and runtime state exist for Jacob's installation.                                                                               | External account behavior. Do not use local prompts, source code, thread content, titles, or responses for prospecting. |

Repository evidence:

- infra/relay/src/observability.ts
- infra/relay/src/http/Api.ts
- infra/relay/src/persistence/schema.ts
- infra/relay/src/environments/ManagedTunnelLimits.ts
- packages/contracts/src/relay.ts
- apps/marketing/src/pages/index.astro
- apps/marketing/src/pages/terms-of-service.astro
- apps/marketing/src/pages/privacy-policy.astro

## Normalized event contract

Each usage event is one NDJSON object:

    {
      "event_id": "source-stable-id",
      "occurred_at": "2026-08-12T12:00:00.000Z",
      "source": "axiom",
      "account_id": "pseudonymous-clerk-user-id",
      "event_name": "environment.connected",
      "object_id": "environment-id",
      "properties": {
        "path": "/v1/environments/example/connect",
        "status_code": 200
      }
    }

Allowed event names in the provisional adapter:

- mobile.device.registered
- mobile.live_activity.registered
- mobile.agent_activity.read
- environment.listed
- environment.linked
- environment.connected
- environment.status_checked
- managed_tunnel.limit_reached

The adapter stores only bounded normalized properties plus a hash of the source row. It does not store raw spans, IP addresses, tokens, push tokens, environment labels, thread IDs, titles, prompts, source code, agent responses, or error stacks.

## Current access boundary

Observed in this runtime:

- repository and local filesystem access;
- Node 24 with built-in SQLite;
- one Croki MCP bearer environment variable name, without inspecting its value.

Not observed:

- authenticated Axiom query access;
- authenticated Clerk directory access;
- CRM, billing, company-resolution, or outbound-channel access;
- a confirmed Croki offer;
- production-query authority.

The available-but-uninstalled plugin list includes systems that could cover analytics, CRM, enrichment, billing, or communication, but no plugin is installed or authorized by this harness.
