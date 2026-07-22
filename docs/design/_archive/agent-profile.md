# Agent profile — meet the teammate, not the file

> **ARCHIVED DESIGN RECEIPT.** This profile surface belongs to an earlier interface. Current
> teammate UX is governed by [FIRM-SPEC.md](../FIRM-SPEC.md), [STATE.md](../STATE.md), and the root
> [DESIGN.md](../../DESIGN.md).

The surface you get when you open an agent. Replaces "open an agent = a raw markdown drawer titled
`gtm-pco-buyer-research-agent`" with "open an agent = meet a personalized GTM teammate."

## The problem (before)
Opening an agent dropped you into `ArtifactEditor` — a side drawer titled with the kebab ref, the file
path `~/.claude/agents/<ref>.md`, a thin description/tools/model summary, and a big raw-markdown
textarea. Agents also appeared as one-line debug rows (`gtm-operator-…-agent v1 · Accepts 3 · Emits 2`).
Machine-y, file-centric, and the names were auto-generated kebab refs. Nothing said "this is a
specialized teammate, personalized for your go-to-market." The rich data that proves it (job,
contract, creation policy, the gate-decision → policy-revision learning loop, 97 feedback signals)
was buried or unshown.

## The decision
Opening an agent feels like meeting a person. A centered sheet over the dimmed canvas: an identity
column (round family-tinted monogram, role name, status/version, one-line mission, two real stats,
"born from a creation policy you can revise — not a stock connector") next to a legible dossier —
**What I do · What I'm learning · What I accept & deliver · My guardrails · Track record** — and the
rest of the team below. The role name (`Prospect Researcher`) is the headline everywhere; the raw ref
is demoted to one mono line.

- **Name by role, not by ref or fake-human-name.** `agentPersona(ref, job)` (`ui/src/lib/agentPersona.ts`)
  is the single source of truth: it derives a role ("Prospect Researcher", "Qualification Analyst",
  "First-Contact Writer"), a function family (research / qualify / write), and a two-letter monogram —
  deterministically, so the reframe can never drift between the profile, the canvas node, and the
  library row. When the foundry later persists a model-given name on the `AgentInstance`, this becomes
  the fallback.
- **Rename everywhere.** Library rows, canvas agent nodes, and the contracts/debug rows all show the
  role + family-tinted monogram; the kebab ref survives only as demoted mono detail. An agent reads as
  a person across the whole app, not only when opened.
- **"What I'm learning" is the spine, not a footnote.** It states the gate-decision → policy-revision
  loop in the agent's own framing, with the real team-level signal/eval counts. This is the wedge made
  visible — the agent gets more like your taste each run.
- **Everything is real.** No field is invented. The person feeling comes from the role name, the
  layout, and the framing labels — never from rewriting the agent's own data into a fake voice. The
  founder gate is shown as the constant amber safety wall.

## Placement
A centered modal sheet (`.agentp-scrim` / `.agentp-sheet`) over the dimmed canvas — the founder chose
this over a right drawer or a full route. Opened from a library agent row and the in-sheet team rail;
"Edit the source file" inside the sheet still opens the raw `ArtifactEditor`.

## The hand
- **Color:** the real product tokens (`ui/src/index.css`) — warm `#fafafa` ground, white cards, ink
  `#18181b`, hairline `#ececec`, status green/amber/red by meaning. The one expressive color is the
  **function-family tint** on the identity mark (research green / qualify blue / write purple), used
  only on the round monogram — color earning its place by meaning, not decoration. Strip to monochrome
  by pointing every family at `general` in `FAMILY_TINT`.
- **Type:** existing scale; Geist + Geist Mono (the ref/file path is mono, demoted).
- **Composition:** a personnel dossier — identity column + sectioned body + team rail. One focal point
  (identity + mission), not a grid of equal cards.
- **Signature:** the round, family-tinted identity mark (the house-style circular focal form) + the
  learning timeline.

## Grounded in
Real RodentRadar data via `/api/projects/rodentradar/programs` — 6 unique agents, 18 instances, 45
policies, 27 evaluations, 97 feedback signals. The profile reads `AgentInstance` (job, input/output
contract, version, status), its `AgentCreationPolicy` (purpose, negative rules, evidence requirements,
revision reason), and the team-level evaluation/feedback totals.

## Shipped references (Mobbin)
- Relevance AI "Competitor Intelligence Analyst" — role-as-identity + mission + responsibilities + a
  side panel of what it produces. The core model. https://mobbin.com/screens/1638a37c-6ccd-419a-886c-3f6f53172e0f
- PlayAI agent detail — identity header (avatar, name, real activity stats). https://mobbin.com/screens/b7d14388-9e49-40ca-a2be-63c15fd4bd92
- Notion "Sidekick" — agent identity / persona voice page. https://mobbin.com/screens/ad22b91a-4ffd-4033-be3e-82146bf14cf5

## Files
- `ui/src/lib/agentPersona.ts` — role/family/monogram derivation (source of truth) + `FAMILY_TINT`.
- `ui/src/components/AgentProfile.tsx` + `ui/src/styles/agent-profile.css` — the sheet.
- Wiring in `ui/src/App.tsx` (`agentProfileView`, `agentTeam`, render, library routing).
- Rename applied in `LibraryPalette.tsx`, `GraphCanvas.tsx` (agent node), `ProgramCanvas.tsx`
  (ContractsPanel).
- Live HTML mockup (founder-validated): `~/design-showcase/agent-profile/index.html`.

## Not yet built (follow-ups)
- The role name is derived client-side; the right long-term home is the foundry persisting a
  model-given name + family on the `AgentInstance` at birth, with `agentPersona` as the fallback.
- Open the profile from a canvas agent-node action (today the node opens the inspector/editor).
- Track record is an honest empty state until per-run evaluations are wired in.
