---
status: implemented
date: 2026-07-20
surface: work-exact-material
live_url: http://127.0.0.1:4317/
---

# Artifact section steering

## Capability

A founder can select one semantic section of a generated Product / GTM artifact and correct it through the existing
composer. The selection preserves the artifact's durable work identity and exact Thread. The founder's transcript
message remains verbatim; a separate structured target tells the participant which section to revise in place.

## Interaction

- Hovering a section reveals **Revise** without covering or replacing its content.
- Clicking the section or its semantic button highlights the whole section and focuses the anchored composer.
- The composer names the selected section, changes its placeholder, offers a clear action, and reports sending/sent.
- Closing the visual, changing Thread, or clearing the target removes the scope without losing the artifact or draft.
- A correction sent from contextual Product / GTM conversation uses the same exact Thread and routes into Work; it
  does not become a sibling document or canonical Product / GTM truth by implication.

## Implementation contract

- `ArtifactSectionFocus` carries artifact ref/title/revision plus stable section id/title/index.
- `VisualMemo` owns selection affordance and accessible state.
- `WorkspaceShell` and compatibility `ThreadShell` own ephemeral focus; no new durable UI record exists.
- `conversation/reply` validates that section corrections include an exact Thread and work reference.
- `buildWorkLoopSystem` instructs the participant to preserve unaffected sections and revise the same work identity.

## Craft hand

- Base: `#0d0f12`, `#101216`, `#1c1c1c`.
- Section focus: restrained `#7c8cff` edge and low-opacity blue field; color is paired with **Editing** and a check.
- Type: existing DM Sans body/display and JetBrains Mono metadata.
- Composition: editorial split artifact beside native coding-client conversation.
- Signature element: the artifact section itself becomes the steering handle; no floating generic toolbar.
- Motion: 160–180ms opacity/translate/background settlement, with the existing reduced-motion fallback.

## Evidence and verification

- Pattern basis: Claude Artifacts' iterative workspace and ChatGPT Canvas' targeted selection/edit model.
- Focused UI tests: `ArtifactPreview.test.tsx`, `NowComposer.test.tsx`.
- Brain route test: `dialogue-routes.test.mjs` selected-artifact-section case.
- Full Brain suite: 846 passed.
- Production UI build: passed.
- Real-data verification: Buffalo Projects “First 10 project drops” artifact; selected “Sourcing — ranked,
  warm-first,” observed section highlight, Editing state, composer retarget, and exact Thread retention.
- Screenshot: `output/playwright/artifact-section-steering.png` (local verification artifact, not product truth).

## Remaining proof

A live provider response must revise the selected section through `stage_artifact` and preserve all unaffected artifact
content. The deterministic route and prompt contract are proven; that live model behavior is not yet claimed.
