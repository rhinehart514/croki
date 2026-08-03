# LottieLab handoff

LottieLab is an optional visual-authoring input, not the renderer or source of runtime state. The durable artifact is a checked-in Lottie JSON file. Remotion renders that file deterministically alongside repository-owned product evidence.

## Contract

1. Start from `croki-signal-field.seed.json` or a repository-owned SVG.
2. Upload the asset to LottieLab and author or refine the motion there.
3. Export Lottie JSON as `croki-signal-field.lottie.json`.
4. Record the exported file hash and authoring evidence in `manifest.json`.
5. Render through the `@remotion/lottie` component and inspect representative frames.

The seed has been accepted by LottieLab's official previewer and by Remotion's first-party Lottie renderer at 800×800, 60 fps, and three seconds. An authenticated LottieLab session is still required to edit and export the authored version. Until that round trip is complete, the seed is not an authored LottieLab deliverable and must not be described as one.

LottieLab is proprietary. A checked-in Lottie JSON export keeps rendering and reuse independent of its hosted editor, but strict all-open-source authoring requires replacing LottieLab with an open-source editor.
