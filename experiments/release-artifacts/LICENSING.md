# Licensing

The workflow source in this repository is distributed under Croki's MIT license. Inputs and generated outputs may carry separate rights depending on their source.

## Remotion

Remotion is not a conventional permissive open-source dependency. Its published source uses Remotion's own license and its commercial terms vary by team size and usage model. As of the production date:

- Individuals and organizations with up to three people may use it under the free license.
- Larger organizations require a company license.
- Products that provide automated video creation are covered by the automator terms, currently usage-priced with a monthly minimum.

Verify the current terms at <https://www.remotion.dev/license> and <https://www.remotion.dev/pricing> before commercial use. This repository does not grant rights to Remotion.

This Croki workflow is presently designed for a founder or team producing its own low-volume release media. Turning it into a hosted or bundled video-generation product is a different licensing posture and must not be inferred from this example.

## LottieLab

LottieLab is a proprietary hosted authoring tool, not an open-source dependency. Its editor may be used as an optional authoring handoff, while the exported Lottie JSON remains a versioned repository input rendered by Remotion. Lottie JSON export may require a paid plan under LottieLab's current terms. Verify <https://www.lottielab.com/pricing> and <https://docs.lottielab.com/export-and-hand-off/file-download/lottie-json-download> before relying on the workflow commercially.

Because the requested workflow includes LottieLab, the end-to-end authoring path is not strictly all-open-source. The repository-owned render, media-processing, evidence, and review artifacts remain reproducible without a continuing LottieLab runtime dependency after export.

## Typography

The composition self-hosts Inter through the pinned `@fontsource/inter@5.2.8` package so typography does not change with the render host. Inter is distributed under the SIL Open Font License 1.1. The Fontsource package reports `OFL-1.1` and includes its license file.

## Product and provider marks

The Croki mark is repository-owned. Claude, OpenAI, OpenCode, Cursor, and Grok marks remain the property of their respective owners. Their appearance demonstrates supported provider integrations and does not imply sponsorship.

## Captures and audio

Only commit captures that are safe to redistribute. Record external footage, fonts, music, sound effects, and generated assets in the provenance manifest with their license or permission. The current production contains no generated voice and introduces no external music asset.
