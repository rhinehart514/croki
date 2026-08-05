# Croki release artifacts

An optional, repository-owned workflow for turning current product evidence into reproducible launch media. It uses the Croki capabilities that already exist: durable Threads, isolated worktrees, provider skills, project scripts, Preview automation, files, diffs, checkpoints, and terminals.

The workflow does not add video concepts to Canvas or create another runtime. Canvas may contribute approved product intent and claims. Remotion source, captures, review records, provenance, and outputs remain ordinary repository artifacts.

## Current production

The included `CrokiLaunch16x9` and `CrokiLaunch9x16` compositions tell the same 27-second story from one motion system:

1. Supported coding agents converge in one durable Croki Thread.
2. A founder request remains visible with its repository, model, and current Canvas context.
3. A real agent result makes the work and release diff inspectable.
4. A domain-agnostic Canvas preserves product intent, decisions, evidence, and consequences across turns.
5. Croki is an open-source coding environment for founders.

There is no generated voice, avatar, stock footage, or conventional NLE project. Readable repository-rendered interface fragments are grounded in the inspected Croki Thread and Canvas capture; a labeled live-capture inset preserves the evidence trail without enlarging low-resolution footage into a hero visual. The score is generated deterministically by the checked-in FFmpeg script.

The opening and closing signal-field motion currently uses a checked-in Lottie seed through Remotion's first-party `@remotion/lottie` renderer. LottieLab accepted the seed and Croki SVG, but an authenticated edit/export round trip is still required before the asset may be described as LottieLab-authored. See `public/motion/lottielab/README.md`.

## Run

From the repository root:

```sh
corepack pnpm --dir experiments/release-artifacts install
corepack pnpm --dir experiments/release-artifacts studio
```

Croki also exposes checked-in project actions for setup, Studio, draft rendering, and review.

Render and review a draft:

```sh
corepack pnpm --dir experiments/release-artifacts render:draft
corepack pnpm --dir experiments/release-artifacts review:build
corepack pnpm --dir experiments/release-artifacts review
```

Open `http://localhost:4173/review/`. The review surface includes playback, scene markers, a contact sheet, and recorded founder revision cycles.

After two founder reviews and deterministic product capture:

```sh
corepack pnpm --dir experiments/release-artifacts render:final
corepack pnpm --dir experiments/release-artifacts validate
```

The final render and validator are also exposed as Croki project actions. The validator is intentionally a hard gate: it fails until every review is addressed, the current cut is explicitly accepted, and any production-specific external authoring handoff is verified.

## Revision safety

Run the production in one durable Croki Thread and an isolated worktree. Croki's existing per-turn checkpoints and turn diffs are the revision mechanism; this package does not introduce a second timeline or checkpoint model. Before handing off a founder review, let the current turn settle and inspect its diff. Generated videos remain outside Git, while scene source, selected-capture hashes, motion-export hashes, review decisions, and provenance remain versioned.

## Structure

```text
src/components/       Shared motion system
src/scenes/           Story-specific compositions
public/captures/      Selected live-product evidence
provenance/           Brief, claims, inputs, and review history
review/               Generated local review surface
output/               Generated renders, excluded from Git
scripts/              Review generation, serving, and validation
```

## Capturing Croki

Use an isolated Croki development environment and the product-native Preview automation. Capture a clean dark-mode state at an explicit viewport. Do not include pairing credentials, private repository names, personal account data, or unrelated worktrees.

The browser recording API stores evidence in Croki's external browser-artifact directory. A selected artifact may be copied into `public/captures/` only after inspection. Record the source commit, viewport, capture timestamp, purpose, and SHA-256 digest in both capture and provenance manifests. The included film uses two inspected Preview recordings: a real Thread run and the same Thread beside Canvas.

The validator verifies that selected captures exist and still match their recorded hashes. It also requires both final aspect ratios, audio and video streams, two addressed founder reviews, founder acceptance of the current creative cut, a completed LottieLab export handoff, and the workflow documentation.

## Reuse

For another release, keep the motion primitives and replace:

- `provenance/brief.md`
- claims and source references in `provenance/manifest.json`
- selected captures and their manifest
- scene copy and ordering

Do not fork the motion system until a release actually requires different visual behavior. Prefer changing typed scene inputs over duplicating components.

## Product boundary

This package is evidence that Croki can carry product intent through launch production. It is not a proposal for a Croki video editor. If repeated use exposes missing infrastructure, first determine whether the problem belongs to this workflow or to a general artifact capability useful for images, PDFs, diagrams, videos, and deployed previews.

See [LICENSING.md](./LICENSING.md) before commercial use.
The current requirement-by-requirement state is recorded in [provenance/completion-audit.md](./provenance/completion-audit.md).
