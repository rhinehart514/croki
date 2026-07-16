# Firm build — task pack index

> **Historical execution pack.** These files preserve the cutover plan and receipts. They are not a
> current backlog and cannot override [FIRM-SPEC.md](../FIRM-SPEC.md) or
> [STATE.md](../STATE.md). Unchecked boxes describe the plan at capture time, not missing current work.

Execution pack for the [FIRM-SPEC.md](../FIRM-SPEC.md) rebuild. Each numbered file is a
self-contained work package: context, exact files, acceptance, and the invariants that must keep
passing. Read FIRM-SPEC.md first; it is the contract. Where a task and the spec conflict, the spec
wins and the task is wrong.

## Order

| Task | File | Depends on |
|---|---|---|
| F0 | 01-F0-reconcile.md | — |
| F1 | 02-F1-firm-core.md | F0 |
| F2 | 03-F2-teammates-work.md | F1 |
| F3 | 04-F3-wall-queue.md | F1 |
| F4 | 05-F4-fork-worktree.md | F2, F3 |
| F5 | 06-F5-market-speaks.md | F2, F3 |
| F6 | 07-F6-lens.md | F2, F3 |
| F7 | 08-F7-always-on.md | F2, F3 |
| F8 | 09-F8-portfolio.md | F4–F7 |

F2 and F3 can build in parallel after F1. F4–F7 can build in parallel after F2+F3.

## Rules for every builder

1. **Never commit.** Leave the tree dirty. The founder stages and commits.
2. **Never touch the founder wall's authority.** The security invariants in FIRM-SPEC.md
   §Verification are non-negotiable; port their tests before porting their code.
3. **No new machinery.** No new enum, stage, required field, role taxonomy, or config surface.
   A task needing one means the task is mis-specified — stop and report, do not improvise structure.
4. **New core imports old code only through the keep-list.** Nothing under the new firm core may
   import a module named in FIRM-SPEC.md §Deletion ledger "Dies". Port, don't reference.
5. **Verify with real commands.** `node --test` the suites named in each task. Report failures
   honestly; a task with failing tests is not done.
6. **Preserve historical identifiers** where kept modules rely on them (`gtm-ide`, `~/.gtm-ide`,
   `channel` in ported code) — they are intentional (repo AGENTS.md).
7. **Founder-facing language** stays plain: Drover, crew, bet, wall, outcome. No machinery
   vocabulary on founder surfaces (register guard carries forward).
8. Model routing: build agents run on **Sonnet (Sol), high effort**, per founder instruction.

## Layout being built

```
brain/src/firm/
  venture-store.mjs    one venture = one readable directory (crew, bets, decisions, placement)
  bet.mjs              bet records + fork verb + position derivation (live / at-wall / ended)
  crew.mjs             teammate roster over ported souls
  work-loop.mjs        the one loop: drive a teammate via runtime adapters to the next pause
  wall.mjs             the one decision queue + outward classification + receipts
  market.mjs           reply capture join + the market's voice objects
  heat.mjs             the one dial + spend rail over the ambient scheduler
  routes.mjs           the firm's HTTP surface (thin; venture-scoped; fails closed)
harness (ported, same authority):
  tool-safety, presence, memory/feedback-ledger/taste-distill/consult-guard,
  scan + evidence discipline, teammate-soul(+store), git-patch/feature-builder/revision/
  product-change-receipts (trimmed workspace), runtimes/, gmail-oauth + inbox-reader,
  capability-registry, session-guard, ambient-scheduler (trimmed), ambient-wake-scorer
```

Target: the new core plus ported harness reads in an afternoon. If a file wants to exceed ~300
lines, split by domain responsibility or report why.
