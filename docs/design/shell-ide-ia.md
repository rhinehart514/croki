# Shell IA — "The IDE" (Refinement, picked 2026-06-22)

> **ARCHIVED DESIGN DIRECTION.** This channel-centered IDE shell is superseded. Current desktop UX
> is governed by [FIRM-SPEC.md](../FIRM-SPEC.md), [STATE.md](../STATE.md), and the root
> [DESIGN.md](../../DESIGN.md).

Founder picked the IDE three-pane model for the GTM IDE shell, to fix: "I don't know where
to start, where to see channels and parts of my GTM engineering."

## The decision

One primary object: **channels** (the GTM systems the founder builds). One nav model:
**explorer / editor / assistant**, the Cursor shell.

- **Left — Explorer.** A file tree of the founder's GTM engineering, so the parts are legible
  and you always know where things are:
  - **Channels** (primary, top): the workflows you've built. Click one → it opens on the canvas.
    Shows run count + a pending-gate dot. This is "your files."
  - **Agents**: the subagents on disk (`~/.claude/agents/*.md`).
  - **Skills**: the skills on disk (`~/.claude/skills/*/SKILL.md`).
  - **Context**: the assembled substrate layers (product / taste / state / signal) — the multiplier.
  - **Problems**: the engine's ranked problems, folded in at the bottom (existing ProblemsRail).
- **Center — Canvas.** The active channel's loop as the editor surface; spacious (a follow-up
  cut fixes the cramped node layout).
- **Right — Assistant.** Claude (the resident operator) + the per-step context inspector.

Where you start: the explorer. Channels are the files; click one to open its loop.

## Verdict that drove it

Audit of the prior shell: FIX, IA ~35/100. Vetoes: no nameable center (two competing nav
systems — Build/Simulate/Run tabs vs Understand/Opportunities/Channels/Products views); the
primary object (channels) buried in the right operator panel. Comparable: Cursor/VS Code shell,
n8n/Retool canvas. Sharpest gap: in Cursor you always know where your files are; here you didn't.

## Interaction shape

Ride-along IDE + delegate-and-review (the operator does work, you review at the gate).

## Build cuts

1. (this turn) Left explorer: Channels primary + Agents + Skills + Context + Problems; new
   `GET /api/library` lists agents/skills from disk; `GtmExplorer` component; wired into the
   left rail for the canvas view.
2. (next) Canvas spaciousness — fix node layout so the loop reads as a real workspace.
3. (next) Right-panel operator legibility — render the operator messages, kill the raw markdown.
4. (next) Agent/skill detail views — click an agent/skill to read/edit it (authoring from the UI).

Mobbin grounding: not pulled this run (named-shipped grounding used: Cursor, VS Code, n8n,
Retool, Linear). Pull Mobbin refs on the canvas-spaciousness cut.
