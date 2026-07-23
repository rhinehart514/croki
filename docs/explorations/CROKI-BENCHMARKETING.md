# Croki benchmarketing

Status: preparation
Date: 2026-07-23
Owner: Jacob
Product name: Croki (`Drover` remains a historical repository identifier)

## Call

Croki's first public benchmark should be unattended and reproducible. It should prove the performance
transition its architecture claims without requiring a founder to operate either condition during a
run:

> The first verified task runs with native-client immediacy. The dependent verified task completes
> faster because exact work and evidence context compounded.

This is performance benchmarketing: a trustworthy, reproducible benchmark whose result is itself a
useful proof release. It is not a feature checklist, a model leaderboard, a synthetic coding score,
or a staged speed demo.

Croki deliberately preserves native Claude and Codex capability. A benchmark that asks whether Croki's
Claude or Codex writes better code than the same provider in its first-party client tests the model,
not Croki. Croki earns an unattended result only if it improves verified task performance while
preserving work quality and direct provider capability. A later human study may test whether that
improvement removes founder coordination.

## Governing bet

A technical founder directing several products with frontier agents will switch from separate coding
clients plus notes when Croki:

1. matches the native client's hot-path immediacy on fresh work;
2. restores exact work without the founder reconstructing it;
3. carries an exact Product consequence and returned evidence into the next direction;
4. reduces active founder time on that next direction without reducing correctness; and
5. keeps every current-truth change and world crossing under exact founder authority.

The benchmark should weaken or kill the current wedge if Croki cannot show the second-change advantage.
More surfaces or richer Product/GTM diagrams would not rescue that result.

## What the first benchmark compares

Use the same pinned repository, task sequence, provider, model, effort, machine, permissions, and
verification for three conditions:

| Condition | What it contains | What it isolates |
| --- | --- | --- |
| Native | First-party Claude or Codex client with the repository and its normal instruction file | The strongest simple substitute |
| Native + manual context | The same client plus the exact static context packet a careful founder would maintain by hand | Whether Croki wins only by receiving more prompt text |
| Croki | The same Claude or Codex SDK through Croki, with its accumulated Thread, work, Product/GTM, and evidence state | The coordination and compounding product |

Do not compare different models under one product label. Report Claude and Codex separately. The
primary comparison is paired within one provider, not a Croki-versus-provider contest.

T3 Code remains an experience-quality reference during the current polish pass. It is not a valid
benchmark condition until it can be run against the same pinned task, model, permissions, and
instrumentation. Visual resemblance is not performance evidence.

## Unattended benchmark

This is the first release. A runner, not a founder, supplies every input and records every output. No
condition receives an interactive correction, clarification, approval, or retry.

Run it at two levels:

| Level | Provider | Purpose |
| --- | --- | --- |
| Deterministic system benchmark | Fixture runtime with fixed streamed events and work results | Measure Croki's launch, persistence, rendering, switching, concurrency, and recovery without provider variance or credits |
| Live agent benchmark | Exact pinned Claude or Codex model | Measure end-to-end verified-task performance, tool use, cost, and cross-task context reuse |

The deterministic level belongs in the ordinary mechanical suite and can run on every relevant change.
The live level remains a bounded experiment because it consumes provider capacity and contains model
variance.

### Automated sequence

Each lane receives the same machine-readable sequence:

1. **Fresh task:** implement an outcome-level change and satisfy held-out acceptance checks.
2. **Evidence injection:** add a fixed, source-bearing observation that changes one premise behind the
   first task.
3. **Dependent task:** implement the next change, which requires facts from the first task and the new
   observation.
4. **Project interruption:** switch to a second fixture, complete a short read, and return.
5. **Recovery trial:** interrupt one designated lane after durable work begins, restart the host, and
   require exact continuation without duplicate effects.

Evidence injection is fixture setup, not a simulated founder decision. It may add a read-only source
or provisional observation, but it must never promote current Product truth, authorize an outward
action, or bypass a founder-only gate. All benchmark work stays inward and sandboxed.

### Automated outputs

The runner decides success only from observable receipts:

- acceptance and regression tests;
- exact patch and changed-file digest;
- durable Thread, Run, session, and worktree identity;
- timestamped UI, persistence, provider, tool, and test spans;
- provider usage and cost when available;
- tool-call counts, repeated repository reads, failed commands, and retries;
- CPU, memory, event-loop delay, long tasks, and dropped frames;
- recovery identity, duplicate-effect check, and cross-venture isolation check; and
- required prior facts correctly reflected in the dependent task.

An independent blinded review may judge patch quality after the run, but it cannot change run success,
request revisions, or rescue a failed lane.

### Unattended performance claims

The automated benchmark can support claims about:

- Croki-controlled latency and resource use;
- time and cost to verified work with the same provider;
- overhead relative to the native client;
- dependent-task improvement from retained context;
- throughput and backpressure under concurrent work;
- exact restart recovery; and
- venture and Run isolation.

It cannot support claims about founder comprehension, founder active time, judgment quality, usability
of a decision, or whether a real outward action produced useful evidence. Those require a later human
study or dogfood case and stay out of the unattended headline.

## The task sequence

Each benchmark lane completes one three-part sequence. A lane uses the same durable project
throughout; only the product condition changes. The unattended runner supplies the founder-authored
fixture prompts identically to every condition.

### A. Fresh change

The runner gives an outcome-level direction containing real ambiguity but complete acceptance
criteria. The agent must inspect the repository, implement the change, verify it, and return reviewable
evidence without an interactive correction.

This phase establishes the non-inferiority floor. Croki is not allowed to hide a slow or degraded Work
surface behind later compounding value.

### B. Returned reality

The lane receives an exact, source-preserving observation that challenges one assumption behind the
change. A fixed follow-up prompt asks the agent what the return supports, what remains unknown, and what
Product or GTM consequence should remain provisional.

The controlled benchmark uses a held-out evidence receipt so every condition sees the same reality.
This proves interpretation and coordination, not a real world crossing. A separately disclosed
dogfood case must perform one real founder-gated outward action and return before Croki makes a public
world-loop claim.

### C. The next change

After a project switch and a delayed return, the runner supplies the next Product change implied by the
evidence. The task requires facts from phase A and the exact return from phase B. The agent implements
and verifies the change without receiving a recap.

This is the benchmark's center. The runner supplies no restatement of the prior implementation,
evidence, or unresolved uncertainty.

## Fixtures

The pilot uses three private, pinned TypeScript repositories with different shapes:

1. a small web product with a code-proven page walk;
2. an Electron or local-first product with a host/renderer boundary; and
3. a service-backed product whose customer consequence crosses UI and persistence.

Each repository receives one three-part sequence authored after the pinned snapshot. Keep the task and
solution out of public history until all runs finish. A fixture is valid only when:

- its prompt states observable behavior without prescribing an implementation;
- a clean solution exists and the starting revision fails the acceptance check;
- acceptance checks cover the requested behavior without importing a hidden implementation detail;
- existing regression checks pass before the run;
- two independent engineering reviews agree the prompt and checks are aligned; and
- the evidence receipt can change a decision without requiring invented interpretation.

Do not use public SWE-bench results as Croki's headline. Public coding benchmarks currently carry
material contamination, underspecification, and test-quality risk, and they do not measure interactive
founder coordination or cross-session compounding.

## Measures

Report the measures separately. Do not collapse them into one Croki score.

### Performance model

Performance has four layers. Publish all four so a faster model response cannot hide a slower product
and a fast interface cannot hide more founder work.

| Layer | Primary question | Controlled or attributed to |
| --- | --- | --- |
| Product performance | How quickly and smoothly does Croki acknowledge, navigate, restore, and render? | Croki |
| Work performance | How long from submitted direction to verified work of equal quality? | Croki + provider + repository |
| Founder performance | How much active attention, restatement, correction, and review does the founder spend? | The full product condition |
| Compounding performance | Does the next verified change become faster after prior work and evidence? | Croki's durable context advantage |

The primary unattended public measure is **time to verified outcome**, paired with correctness,
provider usage, and Croki resource cost. **Active founder time** belongs only to the later human study.
Raw model tokens per second is diagnostic. Croki does not own the provider's generation speed and must
not claim a faster Claude or Codex response as a Croki performance win.

Record one timestamped event stream and report both:

- end-to-end elapsed time from automated submission to verified outcome; and
- component spans for Croki UI/persistence, provider startup and generation, tools, tests, and founder
  interaction when a later human study exists.

Do not derive Croki overhead by naively subtracting overlapping spans. Attribute time from the event
trace and disclose any span that cannot be separated.

### Product performance

Measure on the same supported dogfood machine in cold-start, warm, offline/recovery, and realistic
dense-state profiles:

- input to visible submitted turn;
- input to durable Thread and Run address;
- warm project and Thread switch to last coherent content;
- time to first factual provider activity;
- application launch to a visible, usable Work composer;
- restore to the exact transcript, draft, selection, and adjacent review material;
- Product/GTM canvas frame to readable and interactive;
- interaction latency, long tasks, dropped frames, and layout shift;
- idle and active CPU, memory high-water mark, and application bundle size;
- continuity failures: blank waits, lost drafts, wrong Thread, lost review state;
- p50, p95, sample count, hardware, and cold/warm state.

The existing intended desktop budgets remain the pass line:

- local acknowledgement at p95 `<=100ms`;
- warm switch to usable coherent content at p95 `<=250ms`; and
- durable Thread/Run address at p95 `<=500ms`, with the submitted turn visible by the next paint.

### Verified work

- wall-clock time to a reviewable attempt;
- wall-clock time to all acceptance and regression checks passing;
- pass rate;
- independent patch-quality review;
- regressions or unsupported behavior;
- provider turns, tool actions, tokens when available, and cost;
- failed or abandoned attempts.

Report provider startup, generation, tool, test, and Croki-controlled spans separately. The native and
Croki conditions must use the same exact provider model and effort; otherwise the result is not a
Croki performance comparison.

### Founder coordination — later human study only

- active founder minutes, measured from interaction recording rather than total agent runtime;
- founder prompts and corrections;
- minutes spent searching, reopening, copying, summarizing, or restating prior context;
- facts the founder had to re-supply;
- incorrect assumptions the founder had to catch;
- time from return to a justified next direction;
- time from next direction to verified second change.

### Compounding and integrity

- prior facts correctly reused without restatement;
- exact evidence trace preserved;
- provisional interpretation kept distinct from fact;
- unsupported causal joins;
- current truth changed only by the founder;
- unauthorized outward actions;
- blind retries or duplicate execution;
- whether the next change starts from the retained decision and unresolved uncertainty.

Quality and authority are gates, not weights. Faster incorrect work, fabricated evidence, a false causal
join, or an unauthorized world crossing fails the lane.

## Pilot design

Run a paired pilot before a publishable study:

- three task sequences across the three fixture repositories;
- both supported providers, reported separately;
- all three conditions;
- one full lane per condition and provider, for 18 lanes total;
- condition order counterbalanced across sequences;
- fresh worktrees and identical starting revisions;
- caches declared and held consistent within each paired comparison;
- no model or product update during one provider's set;
- a blinded patch review after automated checks; and
- every exclusion reported with its reason.

The pilot is directional, not statistically conclusive. Its job is to expose instrumentation gaps,
fixture defects, product regressions, and likely effect size before paying for repetitions. Set the
publishable sample size only after the pilot variance is known.

Provider trials consume subscription or API capacity. Estimate the maximum turns and spend from one
instrumented dry run, then obtain Jacob's explicit approval before starting the 18-lane pilot.

## Initial pass and kill criteria

These thresholds are provisional until the pilot exposes normal variance.

### Publishable result

- Croki meets all three existing p95 desktop interaction budgets.
- Croki reports launch, restore, canvas, CPU, and memory distributions with no unexplained regression
  against its pinned pre-benchmark build.
- On phase A, Croki's median time to verified work is no worse than `15%` behind the corresponding
  native condition, with no lower correctness rate.
- On the dependent task, Croki reduces median time to verified work or provider usage by at least
  `20%` against the better native condition, with no lower correctness rate.
- No run receives a human correction, clarification, approval, or retry.
- Evidence traceability is complete in every published Croki lane.
- Recovery resumes the exact durable identity with zero duplicate effects.
- There are zero cross-venture reads, unauthorized truth changes, world crossings, duplicate
  executions, or blind retries.

These gates qualify an unattended performance claim only. A separate real dogfood case must still
complete the repository → outward action → evidence → selective merge → faster next move loop before
Croki claims performance across the full founder loop.

### Do not publish a performance claim

- the post-polish acceptance receipt is not current;
- the hot-path floor misses its existing budgets;
- phase A correctness is lower;
- the advantage disappears against native + manual context;
- the result depends on a different model, effort, permissions, or hidden context;
- the fixture or acceptance checks fail review;
- exclusions change the headline result; or
- the real case stops before returned evidence changes the next move.

If Croki wins only on lower-value bookkeeping while increasing time to verified work, narrow or kill the
benchmark claim. If the Product/GTM context does not improve phase C, prioritize the compounding loop over
additional canvas capability.

## Instrumentation contract

Every run should produce an immutable bundle:

```text
benchmark/runs/<run-id>/
├── manifest.json
├── prompt.md
├── context/
├── events.jsonl
├── runner-actions.jsonl
├── patch.diff
├── verification.json
├── review.json
├── evidence-receipt.json
├── screen-recording.mp4
└── README.md
```

`manifest.json` records:

- condition, product version, git revision, fixture revision, and task digest;
- provider, exact model, effort, client/SDK version, auth mode, and permissions;
- machine, operating system, cache state, start/end timestamps, and run order;
- context inputs and their digests;
- acceptance command digests;
- every retry, exclusion, interruption, and manual intervention; and
- the tool that produced each measurement.

Raw private repository content, prompts, credentials, and customer data remain local. A public bundle
uses a release-safe fixture or publishes hashes, redacted traces, aggregate measures, the exact scoring
code, and enough receipts to audit every claim. Redaction must not remove evidence needed to challenge
the result.

Croki already has useful pieces: isolated attempts and worktrees, exact Run/provider/model records,
tool-duration receipts, local privacy-preserving UX metrics, deterministic browser journeys, diffs,
verification receipts, and founder-action gates. It does not yet have one exportable run manifest or
complete instrumentation for the three p95 product-floor events. Extend these feature-locally; do not
build a general analytics platform.

## Public proof release

The first public story should be:

> Same Claude or Codex. The dependent verified task finishes faster.

Only use that sentence after the benchmark passes. Before results exist, describe it as the question
being tested.

The release contains:

1. an uncut runner trace centered on the evidence injection and dependent task;
2. the protocol and preregistered pass/kill criteria;
3. separate Claude and Codex results with distributions, not only averages;
4. the raw audit bundle or a privacy-preserving equivalent;
5. the strongest losing or contradictory result;
6. exact product, provider, model, fixture, and hardware versions;
7. reproduction instructions; and
8. any later founder dogfood loop as a case, clearly separated from the unattended benchmark.

The traveling output is the fixture plus audit bundle: another founder or tool builder can run the same
sequence and compare how much coordination their environment requires. The natural recipient is a
technical founder already supervising Claude or Codex across several projects.

Do not lead with a leaderboard, an unexplained percentage, a polished montage, or a safety claim.
Speed and reduced reconstruction are the headline. Provenance and authority explain why that speed is
usable.

## Preparation order

1. Finish the current T3 polish pass and produce a current acceptance receipt.
2. Instrument the three existing p95 product-floor events in Croki and verify that collection stores no
   venture content.
3. Add the deterministic fixture runtime and automated fresh-task, dependent-task, switch, concurrency,
   and restart cases to the mechanical benchmark.
4. Define the run manifest and exporter around existing receipts.
5. Author and independently audit one fixture sequence.
6. Build native Codex and Claude adapters around their supported structured, non-interactive outputs.
7. Run deterministic no-provider trials to prove reset, ordering, capture, isolation, redaction, and
   scoring.
8. Price one unattended live lane, ask Jacob for provider-spend approval, and run the 18-lane pilot.
9. Revise thresholds or fixtures only with a recorded reason that predates the publishable runs.
10. Complete one real Croki dogfood loop separately.
11. Publish only the claim the returned evidence supports.

## External basis

Checked 2026-07-23:

- Anthropic's analysis of roughly 400,000 interactive Claude Code sessions finds that people make most
  planning decisions while Claude makes most execution decisions, and that task-specific domain
  expertise improves verified success. This supports measuring founder coordination and retained
  judgment, not only code output:
  <https://www.anthropic.com/research/claude-code-expertise>
- OpenAI's July 2026 audit estimates that roughly 30% of SWE-Bench Pro tasks are broken and recommends
  careful task-level review. This supports privately authored, human-audited fixtures and full
  disclosure rather than borrowing a headline leaderboard:
  <https://openai.com/index/separating-signal-from-noise-coding-evaluations/>
- OpenAI documents that Codex quality depends on configured environments, reliable tests, and clear
  repository instructions, and that its output should be judged with terminal and test evidence:
  <https://openai.com/index/introducing-codex/>
- Claude Code supports non-interactive structured output, model selection, turn limits, and session
  resume for a native-condition adapter:
  <https://docs.anthropic.com/en/docs/claude-code/cli-usage>
- Codex supports non-interactive execution and JSONL event output for a native-condition adapter:
  <https://github.com/openai/codex/blob/main/codex-rs/README.md>

## Highest-leverage next move

Build the deterministic unattended slice first: the three missing product-floor timings plus one
audited fresh-task → evidence → dependent-task fixture with switch and restart. One no-provider run
bundle will reveal whether Croki is measurable enough to justify live provider spend.
