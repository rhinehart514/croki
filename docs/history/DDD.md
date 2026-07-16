> **ARCHIVED.** This object model belongs to the earlier "IDE for GTM" product. It has no current
> domain authority. Current product and build direction lives in [FIRM-SPEC.md](../FIRM-SPEC.md),
> and current proof lives in [STATE.md](../STATE.md).

---

# Domain Model

## What this is, in one breath

GTM IDE turns one stated outcome into a working go-to-market system: you name what you
want, it builds the agents that chase it, you approve anything that goes out, and every
decision you make teaches it to build the next agent better.

The thing you create and live inside is a **program**. Everything else — the agents, the
rules that build them, the runs, the feedback — hangs off a program.

## How to use it (the entry)

1. **Start a program by telling Claude the outcome you want.** There is no form — say it
   in plain words in the co-pilot (*New program* in the explorer just opens and focuses the
   chat). Claude creates the `OutcomeProgram` and keeps going.
2. **Build the agents.** Claude builds the program's first agent — or proposes one you
   accept. Each agent is born for a specific job with a contract and safety rules.
3. **Run it.** The agents do their work and stop at the **Founder Gate** — nothing sends,
   publishes, or charges without you.
4. **Decide.** Approve, reject, or edit what's staged at the gate.
5. **Watch it learn.** Your decisions become feedback that revises the rules, so the next
   agent the program builds starts from what you taught it.

The five canvas modes are five questions about the same program: **Design** (what is it /
what was built), **Simulation** (what will happen next), **Run** (what happened step by
step), **Review** (what's waiting for your approval), **Learning** (what your decisions
changed).

## The loop, named

```text
your outcome
→ outcome program        (the thing you're going for)
→ agent creation policy  (the rules for building an agent for it)
→ personalization profile(the context the agent is born with)
→ agent instance         (the actual agent, built for one job)
→ workflow               (the steps it runs)
→ founder gate           (your approval wall)
→ feedback signal        (what your decision taught the system)
→ better policy          (the rules, revised)
→ next agent version     (a smarter agent next time)
```

## Core objects

- `OutcomeProgram` — one business attempt: the outcome you want, who it's for, where
  you'll reach them, how you'll measure it, its status, and its workflow.
- `AgentCreationPolicy` — the rules for building an agent: its purpose, what to do and not
  do, what evidence it must cite, its safety limits, its input/output contract, and how
  its work is judged. This is the object feedback improves over time.
- `PersonalizationProfile` — the context an agent is born with: product truth, your taste,
  market memory, prior runs, program context, and known blind spots.
- `AgentInstance` — the actual agent, built for one program and one job. Points back to
  the policy and profile that made it.
- `GTMGraph` — the execution plan (the steps). It is the *how*, not the business object.
- `FounderGate` — the wall before anything touches the outside world.
- `FeedbackSignal` — what the system learns from: your approvals, rejections, and edits,
  observed outcomes, product feedback, run failures, and measurement gaps.
- `DomainEvent` — the durable, complete, append-only history of what happened. It is
  authoritative, not decorative: every state-changing command records an event carrying the
  full aggregate, the log is never truncated, and `program-projection.mjs` folds the events
  back into current program/policy/agent/profile/evaluation state. `program-projection.test.mjs`
  asserts that rebuild equals the stored snapshots after a full compounding loop — so the
  system really can explain what changed from events alone, not just from a saved snapshot.

## Domain commands

The vocabulary the operator and the API speak. Founder-facing actions map onto these:

| You do | Command |
| --- | --- |
| Start a program | `CreateOutcomeProgram` |
| Say how you'll measure it | `DefineMeasurementPlan` |
| (system) decide an agent is needed | `DeriveAgentNeed` |
| (system) write the rules for it | `CreateAgentCreationPolicy` |
| (system) gather its birth context | `AssemblePersonalizationProfile` |
| (system) build the agent | `CreatePersonalizedAgent` |
| (system) lay out its steps | `ComposeProgramWorkflow` |
| Run the program | `RunProgram` |
| Approve / reject / edit at the gate | `RecordFounderDecision` |
| Record what actually happened | `RecordObservedOutcome` |
| (system) judge the agent's work | `EvaluateAgentInstance` |
| (system) revise the rules from feedback | `ReviseAgentPolicyFromFeedback` |
| (system) build a smarter version | `CreateNextAgentVersion` |

Program commands come first; the lower-level graph tools are repair tools.

## Where it lives

- `brain/src/program-store.mjs` — outcome programs.
- `brain/src/domain-commands.mjs` — the command vocabulary above.
- `brain/src/domain-events.mjs` — durable, complete (untruncated) domain events.
- `brain/src/program-projection.mjs` — the pure fold of events back into current state; the
  executable guarantee that the event log is authoritative.
- `brain/src/program-runtime.mjs` — the executable loop: program → workflow → run → gate →
  feedback → evaluation → next versions.
- `brain/src/agent-policy-store.mjs` — agent creation policies; append-only versions from
  feedback.
- `brain/src/capability-foundry.mjs` — personalization profiles, versioned agent instances,
  and evaluations.
- `brain/src/program-compiler.mjs` — compiles a pipeline spec (`compileChannelProgram`) into
  program/foundry objects before a graph is saved. No opportunity accept-list; the pipeline is
  named directly.
- `brain/src/feedback-ledger.mjs` — records feedback signals and creates revised policies.
- `brain/src/workflow-composer.mjs` — the model designs the graph; composed agent nodes
  carry `programId`, `agentInstanceId`, `creationPolicyId`, `personalizationProfileId`.
- `brain/src/operator-runtime.mjs` — program-first operator tools, including `create_program`
  (the chat's path to `CreateOutcomeProgram`). This is the program's front door.

## Invariants

- No agent without a specific job.
- No agent creation policy without input contracts, output contracts, evidence
  requirements, safety rules, and evaluation signals.
- Product evidence proves only what the code scan can cite.
- The graph is the execution plan, not the business object.
- Every external-effect path stays behind a founder gate.
- Program status moves through explicit states: `draft`, `ready`, `running`,
  `waiting_for_gate`, `paused`, `learning`, `complete`, `retired`, `blocked`.
- No scaled execution without a measurement plan and an attribution join key.
- Feedback creates a new policy version. It does not mutate the old policy that produced a
  run.
- A material policy revision creates a next agent version. Old runs keep pointing to the
  old policy/profile/agent version.
- The domain event log is complete and authoritative: every state-changing command records
  an event carrying the full aggregate, the log is never silently truncated, and current
  state must be reconstructable from events (proven by `program-projection.test.mjs`).
