# ADE overnight run — orchestration contract (2026-07-15 night)

Founder-authorized autonomous build. Fable orchestrates only; every unit of work is an Opus 4.8 agent. Goal: the full-stack ADE per the decided shape, frontier-2026 UI quality, testable by the founder in the morning. Loops until complete or honestly blocked.

## Authoritative inputs (all committed on branch `ade` at a382f40)
- `docs/design/ux-divergence-2026.html` — direction + complete founder decision log (six nouns: venture · conversation · effort · teammate · capability · record).
- `docs/design/ade-build-contract.md` — code-audited phases, Night 1 (P1 shell+layout · P2 language+components · P3 zoom-responsive rendering · P4 routing + review-dialogue + trust-grants) then Night 2 (P5 streaming+steering · P6 evidence-to-cause · P7 first-run · P8 one-crew Reading A · P9 Electron). Invariants in §5 hold at every boundary.
- `docs/design/ade-frame-round2/composite.html` — the visual target (collision-proof plane; density toggle — "standard" is the shipping default, founder judges variants later).
- `docs/design/ade-design-system.html` — tokens + component state grids + motion spec. Written as the run's first act (prior attempt was interrupted).

## Run mechanics
- One Workflow drives everything: spec completion → spec gate → phases in contract order → morning briefing.
- Per phase: Opus build agent (never commits) → independent Opus verify agent (runs `npm test`, UI unit tests, browser journey; restarts the app; screenshots 1920×1080 + 1440×900; judges the render against composite + design system + decision log) → pass: tiny commit agent commits on `ade` → next phase. Fail: one rebuild with the verifier's findings; a second fail triggers a Codex-rescue attempt (founder-authorized 2026-07-16: an Opus integrator drives Codex via the codex MCP tool on the mechanical fixes, reviews its output against the specs, and owns verification); a third fail stops the chain at the last green boundary.
- Nothing outbound is sent by anyone: the Gmail send port, if reached (P6), is wired but proven with founder-entered outcomes only, per contract §Phase 6.
- Git: work only on branch `ade`. Stash `stranger-changes-before-ade-run` holds pre-run foreign edits; never pop or drop it.

## Topology change, founder-directed 2026-07-16 morning ("run more in parallel")
Serial chain trimmed to UI-dependent phases in the main tree (P2 → P3 → P7). P4+P5, P6, P8, P9 build concurrently in isolated worktrees off checkpoint c0400e1, each committing to `lane/p4p5|p6|p8|p9`. Integration pass after both complete: merge lanes into `ade` in dependency order (p4p5, p6, p8, p9), `npm test` after each merge, then one visual verification sweep across all phase acceptance criteria, then the briefing.

## Morning deliverables
- The app running from branch `ade` (`npm start`, or `npm run app` if P9 completed).
- `docs/design/ade-morning-briefing.html` — per-phase: what shipped, test output, screenshots, verifier verdict, unmet criteria stated unmet. Plus how-to-test walkthrough for the founder.
- Open judgment calls made during the run listed for founder review (card density default = standard; any contract deviations).
