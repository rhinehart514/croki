# GTM IDE Design System — showcase

The styleguide / reference page for `@gtm-ide/design-system`, designed in
claude.ai/design and ported here verbatim. Self-contained: open it in a browser
(via a static server) and it renders the foundations, a live component gallery,
and composition patterns on the glass "Stitch" canvas.

## Run it

Any static server works (it needs a server, not `file://`, so the browser can
load `demos.jsx`). Internet is required at view time — React/ReactDOM/Babel load
from unpkg.

```sh
# from the repo root
node design-system/.ds-sync/storybook/http-serve.mjs design-system/showcase
#   → open the http://127.0.0.1:<port>/ URL it prints
# or:  npx serve design-system/showcase
```

## Files

| File | What it is |
|---|---|
| `index.html` | the page — bespoke "Stitch" CSS (`--st-*` glass aesthetic) over the DS tokens |
| `demos.jsx` | the live component specimens, compiled in-browser by Babel and mounted into `#demo-*` nodes |
| `styles.css`, `_ds_bundle.css`, `_ds_bundle.js`, `fonts/` | **vendored** from the package build (`../ds-bundle`) — the real DS stylesheet, the `window.GtmIde` component bundle, and Geist fonts |

`refresh-assets.cjs` re-copies the vendored files after a package rebuild — run
it whenever the design system changes so the showcase doesn't render stale.

## Important — showcase ≠ package (yet)

Some specimens here are **page-level mockups, not real package components**:
the rich WorkflowNode (Auto-Run / Cost / Mapped-fields graph), the media Card,
the icon-chip Badges, and the Chat panel are hand-built in `demos.jsx`. The
glass aesthetic (`--st-*`, frosted surfaces, pill nav) is also page-only. The
shipped package is the clean light/zinc system in `../styles.css`. Reconcile
before treating this page as the source of truth — see the repo notes.
