# Hardening "vibe code your GTM" — research synthesis (July 2026)

Eight parallel research streams (competitors, customer, channel reality, retention mechanics,
grounding moat, SDK capabilities, GTM tool teardowns, artifact-loop UX). This file records what
survived, what changed, and the decisions the evidence forces. Exploration evidence, not authority;
DESIGN.md and FIRM-SPEC remain law.

## Verdict

The thesis survives with one structural correction: **the moat is the closed loop's accumulated
causal record (action → returned evidence → founder judgment), not repo-grounding alone.**
Grounding is commodity-adjacent (Notra, changelog AI, Lovable+Semrush shipped May 2026); the loop
is unoccupied — no tool anywhere raises a GTM consequence from a shipped change or a product
consequence from a market reply, and no copier can cold-start months of a venture's causal history.

"Vibe marketing" as a phrase is entering slop backlash (CNN, Gartner 2026). Use the vibe-coding
loop as the design brief; position on **grounded and gated**, not on the phrase.

## What the evidence settled

1. **The founder gate is category consensus, not a compromise.** Autonomous AI SDR collapsed
   publicly (11x: fake logos, 70–80% churn; Artisan walked back "Stop Hiring Humans"; 40–60% of
   AI SDR pilots dead in 90 days). Every published working loop is "AI drafts, human approves,
   real send lands." Anthropic's Gmail connector is deliberately draft-only — the gate is enforced
   at the platform layer. Nobody has made the gate a product identity.
2. **The gate is also the emotional product.** The customer's deeper block is rejection fear, not
   knowledge ("marketing feels so cringe"; building is chosen because it can't say no). The gate
   reframes: everything scary is already made, grounded, worth being proud of; one small brave act
   remains. First-session win condition = at least one send actually fired, not a plan.
3. **The customer is real and industrialized.** Distribution paralysis predates vibe coding but
   50M+ Lovable projects (~0.1 visits/project/day) industrialized it with a less technical
   population. Reference pricing exists: $25/mo to build, ~$50/mo proven for audience-listening
   (GummySearch, 140k users), $200–500/mo agent stacks. Never quote an invented "X% get zero
   users" stat; use the visits-per-project ratio.
4. **The run step works only at hand scale.** Volume cold email is dead (0.45% reply, 1 meeting
   per ~6,250 sends); low-volume researched founder-signed email to small companies still clears
   mid-single digits. The existential risk moved from spam folder to platform enforcement
   (Workspace tenant suspension, LinkedIn bans). Sequencer fingerprints are the trigger.
5. **Channel order inverts.** Best n=1 evidence 2026: warm intros > community answers (Reddit/IH,
   3–23% conversion) > build-in-public > AI-search citations > directories > cold email last.
   Product Hunt decayed (68% invisible).
6. **Slop physics.** Buyers detect AI prose within two sentences; 81% accept AI content only if
   accurate + specific + original examples; AI-authorship disclosure measurably lowers trust
   (never disclose, never imply). Grounding is the correct response to the slop equilibrium, but
   no study shows buyers reward "citable to repo" per se — it works as specificity, unproven as
   a visible mechanism.
7. **Retention physics.** One-shot generation churns (Jasper post-mortem; sub-$50/mo AI products
   at 23% GRR). Marketing output historically had no run button — evidence returning to the exact
   node that caused it is the compiler output marketing never had, and the daily-open reason
   ("what did reality say since yesterday"). First-session bar from Bolt/Replit/Vercel:
   time-to-first-wow correlates with retention; session one must end with a live, owned artifact.

## Hardening laws (product must refuse / must default)

- **Refuse to be a sequencer.** No burst sends, cadences, tracking pixels, or LinkedIn automation.
  Hand-scale caps (~25/day hard ceiling; 5–20/week normal). Drafts only where platforms punish
  automation; the founder's hand performs the act.
- **One true fact or no send.** Every draft anchors to a cited prospect-specific fact or
  now-trigger; refuse templated inference dressed as personalization. Composer forces founder
  edit of the opening sentences.
- **Compliance generated in, not optional.** Truthful identity, physical address, working opt-out,
  suppression list honored forever, region rules at draft time, SPF/DKIM/DMARC check gates the
  first stageable send.
- **Cold email last.** Default plays: warm-intro drafting from the founder's real network,
  community answers, build-in-public, citation-earning artifacts.
- **Never synthesize rates at small n.** Evidence = exact action paired with exact return, plus
  self-reported attribution ("how did you hear about us"). Refusing to render conversion
  percentages at n=15 is a feature and matches existing no-fabrication physics.

## Capability order (all ship on today's SDK; ranked leverage-per-effort, month one)

1. Repo-grounded outreach drafting with claim citations (pure SDK; Gmail draft-only enforces gate).
2. Landing page/microsite → one-gate Vercel deploy → live URL + logs as evidence. **The only fully
   closed loop in the stack; the first-session moment.**
3. Public-web prospect dossiers with visible provenance and honest gaps ("Unknown" is a value).
4. Gmail reply triage threading returns to the originating action (attribution is app-side
   thread-ID bookkeeping).
5. Launch packet auto-raised from repo diffs (existing "product change raises distribution
   question" physics, made concrete).
6. Standing competitor/market watch (SDK background tasks + memory).
7. Social drafts through Typefully MCP (one OAuth, queue = gate).
8. AI-search visibility scorecard (which buyer prompts cite the product on ChatGPT/Perplexity).

Do not promise: LinkedIn automation, paid ads management, phone, Instagram/TikTok posting,
volume email. X posting is per-post metered ($0.015–0.20).

## UX canon (patterns with shipped proof; map to existing design law)

- **Card-in-transcript, object-in-panel** (v0/Rox): artifacts drop a compact versioned card in the
  Thread and open as the real editable object beside it.
- **Two correction channels, one persistent artifact** (Canvas/Lovable): click a span → type the
  fix instantly (no agent round-trip) or speak a scoped change. Never regenerate over founder
  hand-edits. Cursor's removal of per-hunk review caused open revolt — granular review is
  retention-grade UX.
- **One provisional register; adoption = ink settling** (matches dashed→solid law). State badge
  lives on artifact chrome.
- **Decision packet at the gate**: literal rendered message to the named recipient (never the
  template), blast-radius sentence ("to Dana Cho at Acme, from you, now"), evidence links,
  reversibility; Approve / Edit-then-approve / Respond-to-agent / Discard as equal verbs; never
  approve-all, never preselected approve.
- **Queue rows + full detail + keyboard advance**; "Respond" drops back into conversation with the
  drafting agent without losing queue position.
- **Three-beat send ceremony**: visible machinery → proof-of-life (sent confirmation / live URL) →
  ~10s undo hold. Friction only at the outward-irreversible act.
- **Returns land typed, on the artifact and in the Thread**: reply text and counts pin to the sent
  artifact's card everywhere it appears AND post as typed turns in the originating Thread
  (Typefully users request this and no one ships it).
- **Person is the unit of work, not the campaign** (sequence tools' campaign-as-atom is the
  documented anti-pattern at founder volume). Zero-entry relationship memory (Attio) +
  gone-quiet nudges with a drafted next touch (folk). A reply anywhere stops all machinery for
  that person.
- **Research renders per-item honest states** (Clay: found / not found / queued, with sources,
  reasoning, confidence).

## Kill risks, ranked

1. **Draft quality below "proud to send."** Artisan Ava: 1,400 sends, 0 replies. Persona theater
   cannot cover slop; the founder-voice + one-true-fact bar is make-or-break. Prototype this
   first on real venture data.
2. **Platform annexation.** Lovable/Base44/Replit will ship generic "promote my app" inside
   12–18 months. Defense: the accumulating causal record and gate/citation discipline their
   template economics won't build. Requires being the venture's system of record.
3. **Behaving like a sequencer** → tenant/account bans. Operational, existential, fully avoidable.
4. **Silence as the common return.** At 5–20 sends/week most actions return nothing; the product
   must make silence legible (visible, honest, non-interpreted) or the evidence loop feels dead.

## Consequences for the current Product/GTM section direction

- The derived-map direction (venture as it is; ideas as staged diffs; amber gaps) is compatible
  with everything above; the GTM band becomes person/relationship-first with plays ranked
  warm-first.
- Judgment memory (pruned ideas with reasons) is confirmed by the retention evidence and extends
  to relationship memory (who was contacted, what came back, what the founder decided).
- The first twenty minutes is the wedge: riff → grounded artifact → gate → one fired send or one
  live deploy. Prototype before visual polish.

Key sources: Belkins 7.5M-email dataset; Gartner May 2026 buyer survey; ChartMogul AI churn data;
Jasper/Copy.ai post-mortems; TechCrunch 11x investigation; Lovable SEO launch (May 2026); YC Memoir
and tday; Anthropic SDK changelog and connector docs; Clay/Instantly/Attio/folk/Typefully teardowns;
Mobbin flows for v0, Rox, Apollo, Vercel, Hootsuite, Reddit mod queue. Full citations in the session
research transcripts.
