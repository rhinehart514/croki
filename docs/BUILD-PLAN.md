# Drover — Build Plan (spec → reality)

*Consolidated from a grounded gap analysis of the codebase against `PRODUCT-SPEC.md`. Five areas, real files, rough sizes (S ≈ <1d, M ≈ 1–2d, L ≈ 3+d).*

## The shape of the work

**The engine is largely built. Most of the gap is the cockpit catching up + a few new pieces + deliberately letting the wall *graduate*.** Across all five areas the pattern repeats: the hard substrate exists (executable graph, the gate + pattern-approval, taste, truth, person/intertwining, the build worktree, the crucible/ideate machinery, team roles), and what's missing is (a) **surfacing** it on the canvas, (b) **a handful of net-new objects** (Inputs, GtmIdea, the autonomy ladder state, a credential store, a microproduct producer), and (c) **letting the wall graduate** so a microproduct can deploy and a trusted pipeline can send — without the wall ever disappearing.

## Reuse as-is — do NOT rebuild

- **Canvas shell:** `CanvasShell.tsx` (projection engine, cross-lens selection, chromeless), `GtmBoard.tsx` freeform roam (pan/zoom/drag/persist), `GraphCanvas.tsx` ReactFlow run/cursor/proposal machinery, `index.css` tokens.
- **Engine:** `compose_and_run` + `runGraph` (with its live `node_start`/`node_done` event stream), durable resumable operator sessions.
- **The wall at scale:** `gate/default.mjs` + `gate-pattern.mjs` (pattern + exception approval already built), `team-store.canApprove` (role-based release already built).
- **Truth/Taste/People:** `scan.mjs`, `feedback-ledger.mjs` + `memory.mjs` (complete), `person-store.mjs` + `cross-reference.mjs` (intertwining + fatigue already *computed*).
- **Ideation machinery:** `crucible/bin/grade.mjs` (the bar enforcer — already vendored via `eval.mjs`, and its `showable`/`demo_is_core`/`loop_able` axes ARE the microproduct bar), `ideate/bin/distinct.mjs` (distinctness check, zero callers today).
- **Build/ship substrate:** `build.mjs` worktree (Codex `--sandbox workspace-write` — already writes files), `revision.mjs` gated-apply pattern, `connectors/execute/artifact.mjs` (microproduct staging connector, already registered), `execute/http.mjs` (a real guarded sender template), `enrich/clay.mjs` (runtime-key pattern).
- **Team:** `team-store.mjs` + `convex-*` substrate (built, guarded off).

## The task list

### A · Canvas / cockpit (the lead surface)
1. **Composer → floating center-bottom workbench** with ideation built in (the variant already exists at `ComposerDock.tsx:741`; App mounts the docked one). *M*
2. **Retire the panes** — drop the left `AltitudeLadder` rail; reshape Approvals/Issues `<aside>`s into the small floating **wall card** + the **calm strip** ("N need you + the one move"). *S–M*
3. **One node grammar (keystone).** Unify the two node vocabularies (`board-node` ↔ `loop-node`) into one card frame + adaptive face; port existing faces (belief→line, agent→avatar, source→entrants, gate, measure→count), add **microproduct→live-preview** and **metric→spark**. Gates tasks 4 & A-current. *L*
4. **Continuous semantic zoom** — board nodes ↔ live `GraphCanvas` flow as two zooms of one surface (replace the depth-3 modal mount). *L*
5. **The current** — send→lift-out, fast staggered ideation assembly, kill strike, build→travel, results settle back. Motion law; route to `design-motion-principles`. *L, build last*

### B · Harness / inputs / ambient
6. **Inputs store** (new `inputs-store.mjs`) — typed world signals with provenance + routed/unrouted status; `domain-events` is NOT this (it's product-model event-sourcing). *S–M*
7. **Ingestion** — `POST /inputs` webhook + CSV drop; wire the existing `gtm-signal-github` agent's output into it. *M*
8. **Router** (`input-router.mjs`) — input class → flow or ambient wake. *M*
9. **Make the harness ambient** — event-triggered wake + a standing-brief session kind + a background tick; relax the goal-required constraint for ambient sessions. *L, touches safety-critical lifecycle — care.*
10. **Cross-flow run-state projection + concurrency** — loosen the one-session-per-project lock for ambient drives; a queryable "which flows need you" view. *M–L*

### C · Ideation engine (the biggest goal)
11. **Idea bar deriver** (`idea-bar.mjs`) — clone the `eval.mjs` pattern; reuse `grade.mjs` + its microproduct axes; proposes the bar, founder adjusts. *M*
12. **Idea generator + critic** (`ideation.mjs` + doctrine agent) — N angle-generators (anchors from `ideate/SKILL.md`), call `distinct.mjs` and regenerate on HUDDLED, grade survivors with a **separate** critic. *L*
13. **GtmIdea object + store** (`idea-store.mjs`). *M*
14. **Idea-taste** — `IdeaKill`/`IdeaKeep` on the *feedback* rail (never crystallization), sharpen the next round. *M*
15. **`ideate` operator tool** — blooms a goal into graded survivors, pauses for the founder before any build; pre-wire survivors to build. *M*
16. **The visible loop on canvas** — bar node, angle lanes, survivor cards, one-click kill + assembly motion. (Pairs with A-3/A-5.) *L*

### D · Microproducts (the crown jewel)
17. **Microproduct file-composer** (`gtm-compose-microproduct` agent) — the missing *producer* of `artifactSpec`/`artifactFiles`, grounded in `scan.mjs`. *S–M*
18. **Generalize `build.mjs`** from repair → build (write the composed files in the worktree, run the build, capture preview). *M*
19. **Gated deploy leg** (`deploy.mjs`) — runs ONLY on founder approval (reuse `authorizeGateRelease` + `applyRevision` confirmation), BYO `git push`/hook + **hosted fallback via the Vercel MCP**. *M*
20. **Invariant carve-out** — "build stops before deploy *except* a microproduct deploy the founder approved at the gate" in `AGENTS.md` + `PRODUCT-SPEC.md` + an anti-cage test. *S*
21. **Operator build-and-ship door** (`compose_microproduct`) + live-preview asset face on canvas. *M*
22. **Land on the map + signups flow back** (asset store + inputs wiring). *M–L, depends on D-6 inputs.*

### E · Pipelines / wall / data / sending / team
23. **Per-pipeline autonomy ladder (keystone for "real autonomy").** Add `autonomy: draft|trusted|autonomous` + blessed pattern to the channel record (the pipeline's durable object); `promote`/`revoke`; teach the gate to auto-apply a trusted pipeline's pattern via existing `gate-pattern.mjs`; promotion offered from taste, never automatic; revocable in one click. *M, must precede ambient sending.*
24. **BYO credential store** (`credential-store.mjs`) — founder-pasted Gmail/Apollo/Clay keys at runtime (env-only today locks out non-technical founders). Unblocks 25 & data. *M*
25. **BYO Gmail sender** (`execute/gmail.mjs`) — modeled on `execute/http.mjs`, sends through the founder's Gmail, with the three guardrails: rate limit, provenance per message, recall. *M*
26. **Surface role-based release** — wire `team-store.canApprove` into the gate route + UI. *S–M*
27. **Visualize intertwining + fatigue** — overlay the shared person/asset/voice/learning threads `cross-reference.mjs` already computes; surface `dedupeAcrossChannels` as a "about to double-hit these people" warning at the gate. *M*
28. **Turn on team-from-v1** — provision Convex, arm sync, fix the onboarding trap that strands a solo founder when Convex is down. *M*

## Critical path & keystones

- **Keystones (unblock the most):** #3 one node grammar (gates the canvas) · #23 autonomy ladder (gates safe autonomy) · #6 inputs store (gates ambient + the closing loop) · #24 credential store (gates BYO data/sending) · #20 deploy carve-out (gates microproduct ship).
- **The crown-jewel demo (founder-driven, no ambient needed):** 17 → 18 → 19 → 20 → 21 ships "compose a demo of my product, build it in a worktree, approve, ship to a hosted subdomain."
- **The v1 lead (visual harness):** A-1, A-2, A-3, then C-11→16 (the ideation loop in the composer), then A-5 (the current). This is the headline you bet on.

## Decisions the founder must make (these gate the build)

1. **Let the wall graduate?** Microproduct *deploy* and *autonomous pipelines* both require an explicit invariant carve-out (always gated/approved, never silent). Confirm the carve-out language. *(Existential — the crown jewel and real autonomy both depend on it.)*
2. **Reuse the `crucible`/`ideate` skills as binaries (recommended) or re-implement in-product?** Recommended: reuse `grade.mjs` + `distinct.mjs` + the SKILL doctrine, build the in-product injectable composer around them so the loop is visible and steerable.
3. **Ambient now or later?** The crown-jewel demo and the visual-harness lead need *zero* ambient work. Ambient (#6–10) is the harder, safety-sensitive leg — sequence it after the lead is real, or pull it forward?
4. **Hosted deploy provider** for the microproduct fallback — the Vercel MCP is available and wired-able; confirm it's the managed path.
