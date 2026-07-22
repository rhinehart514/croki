# Agent picker — the value of the pick lives at pick-time

> **ARCHIVED DESIGN RECEIPT.** This picker belongs to the superseded workflow-builder interface.
> Current participant and teammate UX is governed by [FIRM-SPEC.md](../FIRM-SPEC.md),
> [STATE.md](../STATE.md), and the root [DESIGN.md](../../DESIGN.md).

Status: BUILT (Refinement arc → shipped). The "+ Add step" picker, summoned from the command
dock's `+` → **Browse the library**. Live render: `.design-shots/picker-05-clean.png`.
Date: 2026-06-27.

## The problem (before)
`LibraryPalette` was a flat 320px list of names: monogram, role, a version chip, a +Add button.
Everything that actually decides a pick — what a teammate accepts and delivers, whether it's
proven, whether it learns from your taste, whether it fits *this* spot in the flow — sat one click
away in `AgentProfile`, behind a commit. You picked a name, dropped it, then found out if it fit.

## The decision
The pick is the decision, so the evidence lives **in** the picker. A two-pane glass peek panel,
summoned from the dock `+` and floated above the composer (centered, opening upward, sharing the
add-menu's origin):

- **Left — the roster.** Personalized agents born for this outcome first, then on-disk agents, then
  skills. Each row is a family-tinted monogram + role name + a scannable **fit dot**.
- **Right — the peek.** A live dossier that tracks the highlighted row (hover / arrow / click),
  default-selected on open so value shows the instant it opens.

### The microfeatures (all real data; nothing invented)
1. **Fit-at-this-slot** — the hero line. Compares the teammate's declared `inputContract` against the
   union of `emits` the open graph already produces. States: `start` (self-sourcing, can begin the
   flow), `fits` (all inputs satisfied), `partial` ("N of M ready"), `needs` (none yet), `unknown`
   (stock agent, contract unread). The one signal the picker uniquely *can* show — it already
   receives the graph.
2. **Accepts → Delivers** — the I/O contract as mono chips.
3. **Proven** — real `agentEvaluations` count for the instance ("24 runs" / "fresh — no runs yet").
4. **Tuned to your taste** — personalized instance + version + "learns at your gate" (the wedge).
5. **Guardrail** — "Never sends. Stops at your gate." inline.

The **honest asymmetry is the point**: born teammates carry contracts/evals; stock agents read
"Contract unknown until opened." That shows *why* you'd reach for a personalized one — it is not
papered over.

## Fit matching — strict + graded (founder decision, 2026-06-27)
Fit matches input *tokens* against emit *tokens* exactly, and grades ("N of M ready"). It greens only
when inputs genuinely match upstream — which composed-graph agents do, since the composer's
accepts/emits share a token vocabulary. Legacy saved instances declare prose ("ICP definition from
shared context") and therefore read "needs" — truthful, never a false fit. The fix path is to give
saved agents token contracts at birth, NOT to loosen the check. (Founder rejected normalize/alias —
risks claiming a fit that isn't wired — and rejected dropping the verdict.)

## The hand (reuse, not invention)
Zero new color or type. The existing glass recipe (`library-palette.css` header comment), the
product `index.css` tokens, `agentPersona` + `FAMILY_TINT` for the role/monogram/family tint (the
one expressive color, by function, echoing `AgentProfile`). Fit colour: `--proven` green for
ready/partial, `--blind` grey for needs/unknown. **Amber is deliberately NOT used — the gate owns
amber, and a missing input is a wiring gap, not a safety wall.**

## Grounded in
Real RodentRadar data via `/api/projects/rodentradar/programs` — `foundry.instances`,
`foundry.evaluations`, `policies`, on the `program-trigger-based-outbound…` program (6 born
teammates, real eval counts). Proven live end-to-end through the real `+` → Browse the library path;
console clean. The master-detail / role-as-identity pattern is the same one `agent-profile.md`
grounds in Mobbin (Relevance AI "Competitor Intelligence Analyst" agent detail); this surface reuses
that grounded system rather than re-pulling, since it is an extension of an already-grounded family.

## Files
- `ui/src/components/LibraryPalette.tsx` — the two-pane rewrite + fit computation.
- `ui/src/styles/library-palette.css` — two-pane glass, peek, fit pill/dot styles.
- `ui/src/App.tsx` — threads `agentEvaluations` + `agentPolicies` into the picker.

## Bugs fixed in passing
- Duplicate React key when two foundry instances share an id (`outcome:${id}:${idx}`).
- Monogram/role divergence: the mark derived the persona without the job, so `gtm-find-prospects`
  showed mark "PR" with role "Qualification Analyst". The monogram is now derived from the same
  persona call as the role.

## Not yet built (follow-ups)
- Give saved agent instances token-shaped input contracts at birth so fit greens on real teammates
  (the strict-matching payoff). Today only composed-graph agents satisfy it.
- Open the picker from a canvas node action, not only the dock `+`.
- The picker is absent in the portfolio "All workflows" view (no `activeProgram`/`graph`) — correct
  today (you don't add steps to the union), but a portfolio-level add is a possible future.
