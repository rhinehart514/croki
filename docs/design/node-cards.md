# Node cards — external MCP capabilities on the card + canvas dismiss

> **ARCHIVED DESIGN RECEIPT.** These workflow node cards are not the current Firm lens. Use
> [FIRM-SPEC.md](../FIRM-SPEC.md), [STATE.md](../STATE.md), and the root
> [DESIGN.md](../../DESIGN.md).

Status: BUILT + live-verified (2026-06-27). Refinement arc on the canvas step cards
(`GraphCanvas.tsx` `WorkNodeComponent`, shared by `ProgramCanvas`). Live render:
`.design-shots/mcp-cards.png`.

## What shipped

**1. External MCP capabilities show the real service logo.** An `mcp` node calls a real service
(Notion, Gmail, Slack, Salesforce…). The card now shows that service's actual brand logo in its icon
chip, the service name as the eyebrow, and a read/write **lane signal** — the wall, legible on the
card. The logos come from `simple-icons` (the canonical brand-SVG set), resolved by the server id, so
ANY service the founder connects is covered without enumerating them — an unrecognized id falls back
to a neutral plug (`lucide` Plug) and the eyebrow title-cases the raw id. Slack and Salesforce were
pulled from simple-icons for trademark reasons, so they currently show the plug fallback; most
services (Notion, Gmail, GitHub, Linear, Figma, Vercel, Airtable, HubSpot, Discord…) resolve.

**2. The read/write lane — the wall, on the card.** A read tool reads `● Runs free` (proven green); a
write tool reads `🔒 Behind your gate` (gap amber, with a lock). This mirrors the connect-capability
"wall" surface (`connect-capability.md`) at the node level, and is the ONE functional accent an MCP
card carries.

**3. Color discipline (the founder's choice: "with the logo").** The logo is monochrome **ink at
rest** so the canvas stays calm (DESIGN.md: "color for meaning only"), and **blooms to the service's
real brand color when its card is focused** — recognition where attention already is, not a rainbow
map. `BrandGlyph` takes a `brand` flag wired to the node's `selected` state. One line flips it to
always-on brand color if more pop is wanted.

**4. Click the empty canvas to dismiss.** `GraphCanvas` now forwards React Flow's `onPaneClick` to a
host `dismissOverlays` (threaded through `ProgramCanvas` too) that clears the in-card editor
selection, the library picker, the agent profile, and the Problems/Approvals popovers. (The picker
and profile already closed on outside-click via their own handlers; this adds canvas-click dismissal
for the selected-node editor and the toolbar popovers, which didn't have it.)

## The hand
Zero new color system — the refinement inherits the monochrome + one-accent discipline. The new
material is the **brand glyph** (monochrome ink, brand-color on focus) and the **lane chip**
(proven-green / gap-amber, the existing semantic tokens). Geist + Geist Mono unchanged. The signature
where boldness is spent: the MCP brand chip — a card that calls Notion shows the Notion mark.

## Grounding
- Look: Mobbin workflow-node references — [n8n](https://mobbin.com/screens/bec3d8c7-324e-4f43-89b5-95df0af804d9)
  (brand glyph in the node icon slot — Slack on "Send a message"),
  [Zoho CRM](https://mobbin.com/screens/32b3a683-6e35-465d-8688-e27f67e29da1) (per-action brand marks).
  Those use full-color logos; we chose monochrome-at-rest to hold the calm canvas, brand-color on focus.
- Code: `simple-icons` via context7 (`/simple-icons/simple-icons`) — `siNotion.path` / `.hex` / `.title`.
- Tokens: `ui/src/index.css` (`--proven`, `--gap`, `--surface-2`, `--ink`), `canvas-refine.css`.

## Files
- `ui/src/lib/brandGlyph.ts` — resolver: server id → simple-icons brand icon (+ alias map, fallback).
- `ui/src/components/BrandGlyph.tsx` — the glyph component (monochrome / brand-on-focus, plug fallback).
- `ui/src/components/GraphCanvas.tsx` — MCP card rendering (brand chip, eyebrow, lane signal) + `onPaneClick`.
- `ui/src/styles/canvas-refine.css` — `.loop-node-icon-brand`, `.loop-node-lane` (free/gated).
- `ui/src/App.tsx` — `dismissOverlays`, wired to every canvas; `ui/src/components/ProgramCanvas.tsx` forwards it.
- Dependency added: `simple-icons`.

## Not yet built
- Slack/Salesforce (and any simple-icons-removed brand) show the plug fallback; a small curated
  supplement of their official monochrome paths would restore them.
- The brand chip is rendered for `kind === "mcp"` nodes; when the live connect-capability run-path
  lands, real connected tools dropped on the canvas will carry it automatically (same node kind).

## P10.4 — re-axing cards to GTM objects (BUILT 2026-06-27)
The live canvas cards now read as the **GTM object** they are, not the mechanical kind. All five
objects render through `WorkNodeComponent` in `ui/src/components/GraphCanvas.tsx`, branched by a
new `cardObject(node)`:

- **Source** — the audience is the headline (`node.label`). The left **mark encodes the mode** so the
  label can never disagree with the runner: a scout telescope for a self-sourcing `discovered` agent,
  a seed sprout for a founder-`provided` seed (`sourceMode(node)` mirrors `brain/src/source-entry.mjs`
  — `kind === "agent"` ⇒ discovered, else provided). A trigger line carries an **observed-vs-assumed**
  dot (green when real entrants confirm it, faint when not), and a foot counts who enters. The OPENED
  card (the in-card editor) shows the **real per-entrant list**: the durable People (P10.3) whose
  appearances include this channel (`graph.id`), each row a name + that appearance's own trigger.
  No entrants → an honest empty state, never a fabricated one.
- **Teammate** (agent) — unchanged persona treatment (role is the headline, kebab `ref` a faint slug,
  family-tinted monogram), aligned to the new header + verdict layout.
- **Step** (tool / code / skill / enrich / filter / generate) — the quiet machinery; the mechanism
  recedes to a small label, the connector/ref rides as a faint slug.
- **Gate** — the signature card, reinforced: the amber accent on the border (`.loop-node-gate`) plus an
  amber icon chip and amber "Gate" label (`.loop-node-obj-gate`) make the wall unmistakable.
- **Measure** — the scoreboard; honest about blind attribution via the verdict badge's `blind` state.

**The verdict badge** (`nodeVerdict` + `VerdictBadge`, re-points the old `loop-contract-badge` →
`.loop-verdict`) replaces the bare health number. It is mapped only from signals the host already
derived from real state, never seeded — when no signal exists it renders nothing:
- `blind` ← `contractAudit.state === "blind"` (e.g. Measure with no attribution source)
- `blocked` ← `contractAudit.state === "blocked"` (a hard, named data gap — the danger read)
- `assumed` ← contract `waiting`, OR a `discovered` source (a scout's hypothesis until it runs), OR
  engine health 40–69
- `grounded` ← contract `satisfied`/`ready`, OR a `provided` source (founder-supplied real seed), OR
  engine health ≥ 70
- `generic` ← engine health 1–39 (real but thin grounding)

**Indigo killed.** The proposed-ghost state, the proposed-edge marching ants, the operator cursor +
tag + "Back to Claude" pill, and the proposal bar / note popovers all dropped `#6366f1` / `#4f46e5` /
the indigo drop-shadows. "Not yet real" now reads through **value + dash** on the ink ramp (dashed
`--ghost` border, faint inset, ink-tinted breathe), holding the one-accent contract (amber = the
gate, the only hue with meaning). Verified: `grep -rE "6366f1|4f46e5"` over `ui/src` is clean (the
remaining `4f46e5` is the unrelated agent-persona "growth" family tint, a separate system).

**Strong radius.** New token `--r-2xl: 24px`. Collapsed cards round to 18px (the founder-approved
strong register, up from `--r-lg` 12px); the opened/selected card lifts to `--r-2xl` (24px) and is a
real designed surface — wider (340px) with the `--shadow-pop` float, not just a taller strip.

Files: `ui/src/components/GraphCanvas.tsx` (card taxonomy, verdict, entrants, source card),
`ui/src/components/ProgramCanvas.tsx` + `ui/src/components/canvas/GtmCanvas.tsx` + `ui/src/App.tsx`
(thread `people` to the canvas), `ui/src/index.css` (radius, `.loop-verdict`, source/entrant styles,
de-indigo). Design reference: the founder-approved Source-card mockup. See `docs/CANVAS.md` (P10.4)
for the route.
