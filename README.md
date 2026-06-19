# GTM IDE (codename)

An **AI go-to-market IDE** for vibe-coded products. "Cursor for go-to-market": it reads
your code, makes growth measurable, and builds your next move with you — visually.

Two halves:

```
Sources/GTMIDE/   ← the native SwiftUI Mac app (the shell, canvas, panels)
brain/            ← the Node/TS comprehension engine (reads repos, runs Claude)
```

The app renders; the brain thinks. They talk over JSON (the app spawns the brain as a
sidecar). The brain runs on your own Claude OAuth, locally — no code leaves the machine.

## Status

- **Shell (SwiftUI):** scaffolded — home (project cards), Product⇄GTM toggle, panel layout.
  Requires **full Xcode** to build (Command Line Tools alone cannot compile SwiftUI).
- **Brain (Node):** next — the comprehension engine, gated by **Eval #1** (see `docs/EVALS.md`):
  on the real `~/Buffalo-Projects` repo, find the win event, reconstruct the funnel, and find
  one true tracking gap — every claim cited to `file:line`, or it's blind.
- **Canvas:** open decision — native SwiftUI node-graph vs. embedded Vue Flow (`WKWebView`).

## Run

App (needs Xcode installed + selected): open this folder in Xcode, or
```
swift run            # once `xcode-select` points at a full Xcode
```

Brain:
```
cd brain && npm install && npm run mirror -- ~/Buffalo-Projects
```
