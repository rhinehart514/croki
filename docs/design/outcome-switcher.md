# OutcomeSwitcher redesign — flat list, branch only when it must

> **ARCHIVED DESIGN RECEIPT.** Here, “outcome” names a superseded program object—not Drover's current
> returned-reality meaning. Do not reuse this ontology; use [FIRM-SPEC.md](../FIRM-SPEC.md).

Decided 2026-06-27. Refinement arc (the surface existed and wanted cross-layer/IA direction).

## Surface
`ui/src/components/OutcomeSwitcher.tsx` + `ui/src/styles/outcome-switcher.css`. The top-bar
breadcrumb that switches between outcomes (`OutcomeProgram`) and their systems (`ChannelMeta`
workflows), plus the "All workflows" overview and "New outcome".

## The problem (live render)
1. **Structural duplication.** An outcome with exactly one system rendered the outcome row, a
   "SYSTEMS" sub-header, AND a child row whose name was verbatim identical to the parent — three
   lines for one thing. The common case is one system per outcome, so nearly every outcome
   triple-printed itself.
2. Long compound names ("Outcome — Channel") truncated in the trigger and read heavy in the list.
3. Lifecycle status (draft/blocked/ready) and run telemetry (1 run, N gates) shared one trailing
   slot with no distinction.

## The hierarchy decision (what it claims)
The list is a list of **outcomes**, not a tree of programs-over-channels. An outcome name leads
every row; the channel is a quiet qualifier, not a co-equal noun. A single-system outcome **is** its
system — it never nests under itself. Nesting appears only when an outcome genuinely wraps 2+ systems,
where one row can't represent the parts. This makes the switcher claim: "these are your outcomes, and
the shape only gets more complex exactly where the work did."

## Direction chosen: A (Flat) + two grafts
Three directions were rendered and compared (`~/design-showcase/outcome-switcher/`, screenshot in
the session). Founder picked A with grafts; this is a high-frequency return surface, so the ambitious
version is calmer and faster, not a flourish.

- **A · Flat (spine).** One row per outcome: leading state dot · outcome name · quiet channel
  qualifier · one trailing run/lifecycle meta. Single/zero-system outcomes are flat and open the
  program canvas (`onOpenProgram`, which already resolves to the bound system graph). A 2+-system
  outcome becomes a group header that toggles open to indented system rows (`onOpenChannel` each).
- **Graft from C (status board).** Health segments — one per system, colored by live `channelDot`
  state — ride only on collapsed multi-system rows, where a single dot can't show two systems'
  health. They earn the chrome only there; every other row stays a single dot. Matches "GTM is
  debugged like a codebase."
- **Graft from B (power).** A filter field appears only when the list passes 8 outcomes; below that
  it's absent, so the common case stays bare.

Rejected: C standalone (double-encodes status — a dot AND segments on every row, added chrome on a
daily surface) and B standalone (over-structures the common 1:1 case back into headers).

## Naming hygiene (display-time only)
`splitName()` splits a compound name on a *spaced* dash (`/\s[—–-]\s/`) so "First PCO Signup — Trigger
Outbound" shows "First PCO Signup" bold with "· Trigger Outbound" muted. An arrow
("Demo Console → Pilot Conversion") or an unspaced hyphen ("Dev-Tool") is left whole. `childLabel()`
strips the parent outcome's name from a nested system's label. The underlying data is untouched — the
founder chose "switcher UI only"; the duplicate-program / baked-in-suffix data issue (a draft
"First PCO Signup" AND a separate "First PCO Signup — Trigger Outbound" program) is a separate
upstream fix in the program-compiler/foundry naming, scoped later.

## Status split
The leading dot encodes state (tone) — `channelDot` (live run state) when a system exists, else the
program lifecycle tone. The trailing meta is one string: the system's run telemetry ("1 run",
"2 gates") when it has run, else the program lifecycle ("draft"/"ready"). Lifecycle and telemetry no
longer collide in one slot.

## Grounding
Reuses the shared `.menu` opaque skin (`ui/src/styles/menu.css`, grounded in shadcn/ui DropdownMenu),
the existing status tokens, and the one-accent rule (status dot is the only color; the trailing check
is the only signature mark). Reference register: Linear / Vercel project switchers (flat outcome list
with inline health), held to the house style's "internal product ≠ beautiful website — calm, legible,
fast" doctrine. No new tokens introduced.

## Verification
- `npx tsc --noEmit` clean.
- Design gate (`~/.claude/skills/design/gate.mjs`) passes on the showcase (non-blocking warnings:
  the checker looks for an `@theme` block rather than the `:root` token layer present; no Mobbin URL
  in spec — this leaned on the in-repo shadcn-grounded menu system over a fresh Mobbin pull).
- Remaining: live verification in the running app (needs the founder's project with a real
  multi-system outcome to exercise the expand/segments path).
