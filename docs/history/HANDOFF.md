# GTM IDE handoff

> **ARCHIVED HANDOFF.** This receipt describes the 2026-06-19 repository-change product. It is not
> current state or a resume point; use [FIRM-SPEC.md](../FIRM-SPEC.md) and [STATE.md](../STATE.md).

Date: 2026-06-19

The local web product now implements the repository-backed Cursor-for-GTM loop:

```text
open → inspect → diagnose → propose → review → apply → verify
```

Durable workspaces preserve repository proofs, change sets, decisions, apply and
revert state, and verification runs. General GTM graphs preserve edits and run
history, support individual-node execution, and stop at founder gates.

The working tree remains intentionally uncommitted. Preserve unrelated user
changes. Do not commit, push, deploy, publish, or send communications without
Jacob's explicit request.

Verification:

- `npm test`
- Browser checks at desktop and 390-pixel width
- Default Buffalo Projects diagnosis
- Graph partial failure and saved run history

The native SwiftUI prototype remains out of scope.
