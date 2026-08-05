---
name: release-artifacts
description: Produce truthful, code-native release videos and related launch artifacts from a live repository using Croki Threads, Preview capture, Remotion, FFmpeg, and browser review. Use when turning completed product work into launch footage, demo clips, screenshots, or a reproducible release narrative.
---

# Release artifacts

Treat the repository as the source of truth and the founder as the creative authority. Canvas may supply durable product intent and approved claims, but it must remain domain-agnostic. Never add timeline, render, footage, or media-job state to Canvas.

## Establish evidence

1. Read the product README, the relevant release diff, approved product context, and existing brand assets.
2. Record every external-facing claim in `experiments/release-artifacts/provenance/manifest.json` with a repository reference.
3. Reject claims or visual states that cannot be supported by the current product.

## Capture the live product

1. Start an isolated Croki environment from the current worktree.
2. Use Croki Preview to navigate, resize, set appearance, create exact states, and record interactions.
3. Keep credentials and pairing tokens out of screenshots, recordings, commits, and review pages.
4. Promote selected evidence into `experiments/release-artifacts/public/captures/` and record its viewport, source commit, capture time, and purpose in both capture and provenance manifests.

## Compose and render

1. Use the shared theme, timing, and components before adding scene-specific machinery.
2. Keep animation frame-driven and deterministic. Avoid CSS loops, decorative pulse, shimmer, blur, and generated voice.
3. Run `corepack pnpm --dir experiments/release-artifacts typecheck`.
4. Render a draft with the checked-in project action or `render:draft` script.
5. Build and serve the local review surface. Inspect the video and contact sheet in Croki Preview.

## Use motion-authoring inputs honestly

1. Treat LottieLab, Rive, or another hosted editor as an optional authoring input, never as runtime state.
2. Check the exported animation into `public/motion/` and record its SHA-256 digest, dimensions, duration, tool, and authoring evidence.
3. Render the checked-in export through the first-party Remotion integration. Do not describe a code-authored seed as editor-authored merely because the editor preview accepted it.
4. Keep the code-authored path usable when an external editor is unavailable. Document proprietary tools and export-plan requirements in `LICENSING.md`.

## Preserve revision safety

1. Keep the production in one durable Croki Thread and one isolated worktree.
2. Let Croki's native per-turn checkpoints settle before each founder-review handoff. Use the Thread turn diff to inspect source changes and restore a prior turn when a revision regresses the cut.
3. Record founder feedback and the resulting decision in `review/revisions.json` and provenance. Do not add another checkpoint or timeline model inside the package.
4. Generated renders stay out of Git. The source diff, capture hashes, exported-animation hash, and review record are the reproducible checkpoint.

## Review

1. Ask the founder for judgment on story, accuracy, pacing, hierarchy, and visual character.
2. Record each accepted review cycle in `review/revisions.json` and the provenance manifest.
3. Make revisions in source, not by post-processing around defects.
4. Complete two founder review cycles before final export. Keep the current creative status rejected until the founder explicitly accepts the current rendered cut.

## Finish

Render both aspect ratios from the same composition system, run `validate`, and inspect final frames. Document any licensed dependency or non-redistributable input. Do not claim completion while the validator reports missing captures, revisions, motion-authoring evidence, founder acceptance, outputs, dimensions, or duration.
