# Firm cutover receipt

**Captured:** 2026-07-14 against the uncommitted working tree.

The Firm is now the only executable product ontology. The old canvas, project, graph, channel-flow,
operator-session, terrain, run, and multi-backend persistence systems have been removed from the
server, MCP door, interface, dependencies, and tests.

Against `HEAD`, the working tree deletes 619 tracked files and 148,457 tracked lines. It adds 1,151
tracked lines and 89 currently untracked files for the Firm replacement, leaving 364 present files
where `HEAD` had 894: a net reduction of 530 files and 147,306 tracked lines.

## Current surface

- The server exposes system, presence, credentials, ventures, bets, work, lens, wall, heat, market,
  and product-change routes.
- The MCP door exposes Firm reads, teammate drives, product-bet forks, and the local dogfood queue.
  It exposes no founder decision or outward-release tool.
- The interface renders `FirmApp` directly. There is no alternate render root or query-string escape.
- Local persistence is readable atomic JSON. The SQLite and Convex implementations and dependencies
  are gone.
- Product changes retain the isolated-worktree review and explicit local-apply contract without the
  old microproduct builder or repository scanner.
- Credentials are founder-global. Venture and bet identities scope all Firm work and receipts.

## Verification

- Brain: 389 tests pass.
- Interface: 42 tests pass across 11 files.
- Interface lint passes.
- Production interface build passes.
- The root `npm test` command covers all four checks above.
- The Firm desktop browser journey passes: repository binding, founder unlock, lens, wall decisions,
  and heat persistence.

## Still unproven

- Live Claude and Codex subscription parity on a direct teammate drive.
- A real Gmail release and returned market outcome through the Firm path.
- An outside founder completing the loop without intervention.

These are product-proof gaps, not retained compatibility paths.
