# STATE — Drover

**Stage: alpha. Updated 2026-07-14.**

## Current direction

[FIRM-SPEC.md](FIRM-SPEC.md) is the single spec of record. Drover is the operating system for
one-person holding companies; the wedge is “vibe code your go-to-market” for one venture. The older
open-canvas and experiment-machine specs are historical inputs with supersession banners.

## What the current firm tree implements

- A local venture manifest binds each venture to one real product repository.
- Venture-owned readable records cover crew, bets, outcomes, founder decisions, heat/spend settings,
  product-change review history, and canvas placement.
- Teammates are summoned into a venture when driven and inherit matching reusable templates.
- The direct work loop can fork bets, consult taste, stage artifacts, ask the founder, and park
  outward effects without a second execution authority.
- Repository truth reads from the venture's bound product repository.
- Product bets cut isolated worktrees from that repository, retain exact diffs, and require founder
  review and explicit local apply.
- The founder wall uses non-forgeable release authority and typed attention: release, answer,
  outcome review, and bet ending. Away holds outward release; deploy keeps its second authorization.
- Outcomes are durable first-class records. Provider identity deduplicates joined and unattributed
  returns; joined bets hold references rather than a second outcome copy.
- The lens projects crew, bets, latest joined outcomes, wall weight, and placement. It owns only
  placement.
- One venture heat dial and daily spend rail govern the always-on inward loop.
- Portfolio wall reads and venture export/import exist. Export includes outcomes, heat, and portable
  product-change history while stripping machine-local repository/worktree paths.
- The browser shell can create a repository-bound venture, drive teammates, set heat, inspect the
  lens, and make purpose-appropriate wall decisions.

## Verification status

The cutover suites are green: 389 brain tests and 42 interface tests pass; interface lint and the
production build pass. The root `npm test` command reruns this same complete verification.

The deterministic desktop browser journey passes against the Firm shell: it binds a real product
repository, unlocks founder actions through the interface, renders purpose-correct wall decisions,
and persists the heat setting.

## What remains unproven

- Live Claude and Codex subscription parity on the new direct work loop.
- A real venture left running under heat that returns to a useful, bounded founder queue.
- Cross-machine import with an explicitly rebound destination repository.
- An outside founder completing the loop without intervention.
- A real attributable market outcome changing the next bet.

No outside founder or attributable real-world result has yet proved the alpha bet.
