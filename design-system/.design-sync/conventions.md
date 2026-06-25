# GTM IDE design system

A clean, IDE-dense light system: monochrome **ink** ramp, semantic color used for
**meaning only**, dark = primary, Geist throughout. No decorative hue.

## Setup — no provider needed
Components are styled entirely by `styles.css` (design tokens on `:root` + `gtm-*`
component classes). Load that one stylesheet; there is **no** ThemeProvider, context,
or wrapper to mount. Without `styles.css` components render unstyled. The default font
is **Geist** (set on `:root`); `var(--font-mono)` is **Geist Mono** for code and paths.

## Styling idiom — tokens, NOT utility classes
This is **not** a Tailwind / utility-class system. Two rules:

1. **Style components through their props/variants**, never by adding CSS classes to
   them: `<Button variant="secondary" size="sm">`, `<Badge tone="proven">`,
   `<WorkflowNode category="gate">`.
2. **Style your own layout glue with the CSS custom properties below** — never hardcode
   hex or px. Use inline `style={{ … }}` or your own classes that reference `var(--*)`.

### Token vocabulary (all defined in `styles.css :root`)
- **Ink ramp** (text): `--ink` titles · `--ink-2` body · `--muted` labels · `--faint`
  meta · `--ghost` disabled.
- **Surfaces**: `--surface` cards · `--surface-2` inset/hover · `--canvas` workspace ·
  `--line` / `--line-2` borders · `--panel` frosted bar.
- **Action**: `--primary` (ink pill) / `--on-primary` · `--link` (the one restrained blue).
- **Semantic — meaning only**: `--proven`/`--proven-soft`, `--gap`/`--gap-soft`,
  `--danger`/`--danger-soft`, `--blind`. Node category accents:
  `--cat-source|enrich|filter|generate|gate|execute|measure`.
- **Type**: `--text-xs … --text-2xl`. **Spacing** (4px base): `--space-1 … --space-12`.
  **Radius**: `--r-sm/-md/-lg/-xl`. **Elevation**: `--shadow-xs/-sm/-card/-pop/-modal`.
  **Mono**: `--font-mono`.

## Components (the props that carry the design language)
- **Button** — `variant`: primary | secondary | ghost | outline; `size`: sm | md | icon; `asChild`.
- **Badge** — `tone`: proven | gap | danger | blind | neutral | agent; `caps` (uppercase state mark).
- **WorkflowNode** — the signature node card. `category`: source | enrich | filter | generate | gate | execute | measure (sets the top accent); plus `label`, `icon`, `connector`, `status`, `count`, `error`, `selected`.
- **Card** — with `CardHeader` / `CardTitle` / `CardDescription` / `CardContent`.
- **Input** / **Textarea** — `mono` for file paths and prompts.
- **SegmentedTabs** — `items` (`{ value, label, icon }`), `value`, `onValueChange` (the Build / Run / Measure strip).
- **StatusDot** — `tone`: proven | ready | gap | danger | missing | blind.
- **SectionHeading** — uppercase, tracked rail label; optional `icon`.
- **CitationCard** — `path` (a `file:line`), `icon`, `code` excerpt.
- **ProspectCard** — `name`, `score`, `scoreTone`, `summary`, `draft`.
- **Toolbar** — with `Brand` (`mark`), `ToolbarDivider`, `ToolbarSpacer`.

## Where the truth lives
Read `styles.css` (tokens + every `gtm-*` rule) before styling, and each component's
`<Name>.prompt.md` + `<Name>.d.ts` for its exact API.

## Idiomatic build snippet
```tsx
import { WorkflowNode, Button, SectionHeading } from "@gtm-ide/design-system";

<div style={{ display: "grid", gap: "var(--space-3)", padding: "var(--space-4)", background: "var(--canvas)" }}>
  <SectionHeading>Outreach system</SectionHeading>
  <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
    <WorkflowNode category="source" label="Find ICP accounts" count="128 accounts" />
    <WorkflowNode category="gate" label="Founder review" count="42 approved" />
    <WorkflowNode category="execute" label="Send opener" connector="tool:instantly" />
  </div>
  <Button>Run channel</Button>
</div>
```
