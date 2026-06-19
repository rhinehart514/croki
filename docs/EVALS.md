# Evals — the loop we build toward

The product is built eval-first. We don't add features; we pass evals. The founder is the
oracle (no external judge) — a human yes/no is the score.

## Eval #1 — Comprehension (the load-bearing bet)

Target repo: `~/Buffalo-Projects` (real Turborepo monorepo, TS + Firebase + Vercel, 679 files).

Passes when, with **one** founder input (the "win" event), the brain can:

1. Confirm the win event exists in code — with `file:line`.
2. Reconstruct the funnel stages leading to the win — each cited to `file:line`.
3. Find **≥1 true tracking gap** — a stage that can't be attributed — with `file:line`.
4. Zero uncited claims — everything cited or explicitly marked **blind**.
5. Founder confirms the funnel + gap are actually true.

### Progress

- **v0 deterministic floor (`brain/src/mirror.mjs`) — DONE, runs on the real repo.**
  Found, all cited: stack (turbo/firebase/vercel); analytics WIRED (Segment, Plausible,
  PostHog, GA); funnel touchpoints (login/auth, onboarding, signup, checkout); attribution
  present (`searchParams.get("ref")` in the join flow). Headline: *"Instrumented — verify
  they're joined."*
- **Next (Claude-interpretation layer):** trace whether `ref`/source actually flows through
  to the win event (the real Buffalo gap: "can't tell what creates active projects"). That's
  the part the deterministic floor honestly can't decide — it surfaced the *question*, not
  the answer. Passing criterion 3 requires this layer.

## Eval #2 — Action loop (later)
The agent writes the tracking fix into a git worktree, tests pass, opens a reviewable PR.

## Eval #3 — Honest funnel render (later)
The canvas renders the funnel with per-stage proven/inferred/blind, no uncited claim shown.
