# Persist intent before side effects

Croki distinguishes accepting a collaborative command from successfully delivering its provider, terminal, Git, or external side effect. Accepted intent and its idempotency key are persisted before dispatch; delivery becomes acknowledged, failed, stale, or unconfirmed through durable runtime records. Hot process-local publication remains an optimization, and Croki never retries an outcome that could duplicate consequential work merely because acknowledgement was lost.
