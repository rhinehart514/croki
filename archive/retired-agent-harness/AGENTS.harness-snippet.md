## Project operation

Use the `operate-project` skill only when asked to operate, recover, transform, or take consequential ownership of the whole project. Keep bounded answers, reviews, plans, diagnoses, file edits, features, and fixes bounded unless the user explicitly expands responsibility.

Read `PROJECT.md`, runtime status, and relevant live artifacts before choosing whole-project work. Treat implementation and documents as evidence, not automatic authority. Canonical harness mutations are immutable events; projections are rebuildable. Use `python3 <operate-project-skill>/scripts/operate.py <command> TARGET ...` and the skill's `references/runtime.md`. Every mutation needs a caller-owned `--actor` and unique retry-safe `--key`.

State what must become true, what failure looks like, what evidence proves the result, who is accountable for held judgment, and which consequences are authorized. Inspect available capabilities and choose the means. Existing harnesses are optional instruments. Invent a local operation when none fits.

Keep reasoning and internal exploration broad. Use the runtime's action proposal and trusted approval boundary before external or difficult-to-reverse effects. Do not infer authority from editable project state. Do not substitute plans, polish, agent activity, or narrow tests for a verified consequence.
