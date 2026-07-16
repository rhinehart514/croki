# Living Venture Atlas production polish gate

**Status:** mechanically passed on 2026-07-15 through `npm run test:acceptance`; repeated founder use,
outside-founder comprehension, and market proof remain open in [`../../STATE.md`](../../STATE.md).

This gate turns “clean, beautiful, and properly canvas-like” into observable acceptance. It does not create a second design system; `DESIGN.md`, `docs/design/DESIGN.md`, and `ui/src/index.css` remain authority.

## Canvas identity

- The atlas fills the available workbench and remains continuously pannable and zoomable.
- No viewport resembles a dashboard grid, page of cards, architecture slide, or fixed three-column layout.
- Manual placement survives reload. Focus and Escape restore the exact prior camera.
- Product terrain, systems, motion routes, campaign pressure, wall, and open founder material remain spatially legible without opening a panel.
- Open concepts can sit between operational structures without acquiring generic node chrome.
- The deterministic outline provides parity without becoming the primary navigation.

## Composition

- The three-second opening hierarchy is intent → product value → active motion pressure → founder judgment/return.
- Agents, runtimes, configuration, and costs are absent until “How this runs.”
- Only selected or consequential content rises. Resting content uses hairlines, topology, and space before containers.
- Concepts, named areas, loops, systems, motions, campaigns, bets/work, releases, and outcomes do not collapse into uniform rectangles.
- Long labels wrap deliberately; no essential operating prose falls below 11px.
- At 1440×900 and 1280×800 the composer, wall, return account, and selected focus remain simultaneously operable.

## Interaction finish

- Pan and zoom respond on the first frame and remain interruptible.
- Hover is subtle; selection is unmistakable; keyboard focus is equally clear.
- Direct dragging never triggers a semantic mutation accidentally.
- Contextual controls appear only for the current selection and never form a permanent inspector.
- Empty, loading, stale, offline, conflict, denied, and failed states preserve the canvas and the founder's last coherent map.
- Destructive semantic removal names affected execution context; placement removal clearly says it removes placement only.

## Motion

- Camera focus/restore, promotion, fork, route reflow, release, return, and accepted architecture change are the only signature sequences.
- Direct input always interrupts animation.
- Most control feedback completes within `--dur-fast`; ordinary settling uses `--dur-base`; camera/topology focus may use `--dur-focus`.
- Promotion changes fragment → landmark once and shows affected routes settling around it.
- Release travels only toward the wall. Return travels inward only along a supported join. Unsupported signals stop outside the architecture.
- Nothing loops to imply work, intelligence, urgency, or liveness.
- Reduced motion removes travel and layout choreography while preserving final selection, topology, evidence, and authority.

## Visual restraint

- Warm mineral tokens and ink ramp do most of the work.
- Forest marks selection/focus, ochre marks founder-held authority, red marks destructive/failure. Outcomes never gain sentiment colors.
- No decorative gradients, glow, glass, excessive blur, neon graph edges, or shadow stacks.
- Elevation is limited to selected/transient detail and blocking founder decisions.
- Icons support plain language; they never replace it.

## Performance

- Dense fixture pan/zoom and selection stay responsive without animating every node.
- Offscreen and far-altitude representations are reduced or virtualized.
- Topology layout is calculated outside render where practical and does not cause repeated camera jumps.
- React effects clean up observers, timers, and subscriptions.
- No broad `transition: all`, unstable list keys, or animation state duplicated across components.

## Evidence required to pass

- Rendered and interacted browser evidence at 1440×900 and 1280×800.
- Reduced-motion capture.
- Venture, architecture, motion, campaign, bet/work, wall, return, machinery, empty, dense, stale/offline, and unrelated-venture states.
- Keyboard-only creation, selection, connection/promotion, focus, outline traversal, wall review, and broadening.
- Browser zoom at 80%, 100%, 125%, 150%, and 200% without loss of reachable actions.
- A deterministic check that placement deletion preserves semantic architecture and that semantic deletion names its impact.

Mechanical evidence proves rendering and behavior only. Jacob's repeated use decides whether the result is genuinely beautiful, clear, and worth operating.
