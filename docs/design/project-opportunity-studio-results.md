# Validation Results

> **Superseded (2026-06-28).** These are the validation results for the Opportunity Studio,
> which has since been removed (channels are now named directly and compiled via
> `compileChannelProgram` / `compose_channel`; ideation is the composer's posture). Kept as a
> dated build-record; see `docs/GOAL.md` P11 and `project-opportunity-studio.md` for the removal.

## What Changed

- Added durable multi-project selection with backwards-compatible migration from the prior singleton project.
- Added repository-backed product understanding and evidence-labeled channel and agent opportunities.
- Added persistent founder review decisions before workflow mutation.
- Added Claude/Codex agent selection and editable agent artifacts.
- Added manual, CSV, and HTTP API inputs plus local and gated HTTP API outputs.
- Added validated opportunity composition with a mandatory founder gate, measure node, and feedback edges into product and input context.
- Added the project, understanding, opportunity review, and composition surfaces to the canonical React interface and MCP/operator front doors.

## Checks Run

| Check | Result | Evidence |
|---|---|---|
| Flow plan validation | Pass | Required sections present; readiness score 100/100 |
| Backend tests | Pass | 157 tests across 55 suites |
| Frontend lint | Pass | ESLint completed with no errors |
| TypeScript and production build | Pass | `tsc -b` and Vite production build completed |
| Primary browser path | Pass | Added Buffalo Projects, generated opportunities, accepted a channel and agent, composed the workflow, and opened the resulting canvas |
| Founder gate | Pass | Composed graph visibly contains the founder gate before local/API output |
| Feedback loop | Pass | Composed graph visibly contains measure → learning context and measure → input feedback edges |
| Responsive studio | Pass | Project picker and opportunity review verified at 390px width |
| External transmission safety | Pass | Browser verification used manual output; API behavior is covered with injected fetch tests |

## Browser Evidence

- Desktop: project creation, understanding, opportunity review, and composition worked against an isolated local state.
- Tablet: layout collapses the composition review beneath opportunity lists below 1120px.
- Mobile: toolbar and studio surfaces remain readable and single-column at 390px.
- Console/network: no application error was observed during the verified primary path.

## Remaining Risk

- Real Claude and Codex agent quality depends on the local subscription/login and the authored agent prompt; provider routing is covered deterministically.
- HTTP input and output integrations require the founder to provide valid endpoints and any needed authorization through local environment configuration.
- Opportunity heuristics are deliberately conservative and only mark a candidate derived when a production-code signal is available; broader strategy remains speculative until evidence or observed outcomes support it.
