# Drover run contract

**Status:** current routing document. It does not define product direction or claim implementation
status.

## Resume order

1. Read `AGENTS.md` for repository invariants and founder-facing language.
2. Read `docs/FIRM-SPEC.md` for the product and build contract.
3. Read `docs/STATE.md` for the dated boundary between working software and unproven claims.
4. Inspect `git status` and the relevant diff. Preserve every pre-existing change unless the task
   explicitly owns it.

No independent roadmap lives here. The previous outcome-first canvas run is preserved at
`docs/history/OUTCOME-FIRST-CANVAS-RUN.md`; none of its incomplete boxes are current work.

## Invariants for every run

- Keep Drover product-agnostic and desktop-only.
- Use the founder language: Drover, venture, teammate, bet, outcome, fork, and the wall.
- Reserve **outcome** for what the world returned. A founder gives direction; a bet attempts it.
- Do not reintroduce workflow, graph, pipeline, stage, status, or object taxonomies as the work
  model. Historical identifiers such as `gtm-ide`, `channel`, and `~/.gtm-ide` remain unchanged.
- Preserve venture isolation, cited truth, founder-only outward authority, learned taste, and the
  rule that only the founder ends a bet.
- Do not commit, publish, deploy, spend, or take another external action without explicit approval.

## Verification

Use the smallest relevant check while iterating, then the complete gate when the change warrants it:

```sh
npm --prefix brain test
npm --prefix ui run test:unit
npm test
npm run test:firm:browser
npm run test:acceptance
```

`npm run test:acceptance` is the complete local-readiness receipt: mechanical tests, token parity,
four preserved operating journeys, and three Living Venture Atlas journeys.

A handoff states the outcome first, lists changed files and verification, then names any remaining
unproven behavior. Passing deterministic tests does not prove the outside-founder alpha bet.
