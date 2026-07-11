# Client Care — Product Spec

**Status:** proposed  
**Product verdict:** build  
**First proof customer:** Rohlax Wellness  
**Core promise:** Drover notices when a client's business changes and makes sure their site keeps up.

## The product in one scene

Chelsea publishes a newsletter announcing a move, a temporary closure, a pause on new clients, and an
upcoming maternity leave. She does not need to translate that newsletter into a website ticket.

Drover notices that the announcement may affect her site. It compares the announcement with what the
site says today, prepares a recommendation, and gives Chelsea an easy choice:

- use the recommendation;
- choose only the changes she wants; or
- keep the site exactly as it is.

Before she decides, she sees her actual site with the proposed changes in place, when each change would
appear, when temporary notices would come down, and whether the work is included in her plan. Nothing
changes until she approves it.

The feeling is not "my website software found an email." It is "the people taking care of my site were
already thinking about what I need."

## Why this belongs in Drover

Drover already reads a product, watches for real-world signals, prepares work, and stops at the founder
wall before anything reaches the outside world. Client Care applies that same promise to an important GTM
surface: keeping a client's public business accurate as the business changes.

This is not a new CRM, support desk, or agency portal. It is a new kind of Drover run:

> A real-world change may affect a client's public business. Understand it, recommend what should change,
> and prepare the work without assuming permission.

For an operator managing several client sites, each client site remains a Drover product. Client Care is
the teammate that notices when that product and the client's real business are drifting apart.

## The Rohlax proof case

The July Rohlax Wellness newsletter contains four possible website changes:

1. The business moves to 2167 Wehrle Drive beginning August 1.
2. The studio closes July 24 through August 3 and reopens August 4.
3. New-client intake stops September 1 while existing clients may continue booking.
4. Maternity leave is planned for November 1, but the return plan is not decided.

It also contains a conflict: the newsletter announces the new location while its footer still shows the
old Transit Road address.

The correct recommendation is not "apply all four changes":

- **Change now:** prepare the new address and temporary closure notice.
- **Schedule:** prepare the September intake message, while keeping existing-client booking clear.
- **Hold:** wait on detailed maternity messaging until Chelsea confirms how she wants bookings and her
  return handled.
- **Flag:** ask about the old address in the newsletter footer rather than silently treating either source
  as authoritative.

The first outreach email has already been sent manually. It is the first live test of whether the client
welcomes this kind of proactive care.

## Product principles

1. **A communication is a clue, never permission.** A newsletter can justify a recommendation. It cannot
   authorize a website change.
2. **Recommend; do not merely extract.** Drover says what should happen now, what should wait, and why.
3. **Show the source.** Every proposed change carries the sentence or fact that caused Drover to notice it.
4. **Show uncertainty plainly.** Use "confirmed" and "needs confirmation," not fake confidence scores.
5. **Approval is granular.** The client may approve the address, decline the leave notice, and revise the
   closure wording.
6. **Keeping the site unchanged is a first-class choice.** It is never visually or verbally punished.
7. **Price is known before approval.** "Included in your plan — $0" or an exact quote appears before the
   client says yes. Drover never guesses coverage.
8. **Personal news stays personal unless the client chooses otherwise.** Pregnancy, health, family, and
   leave details receive a higher bar than ordinary business facts.
9. **Temporary changes include their ending.** A closure banner is incomplete without a removal date.
10. **The wall still holds.** Preparing a preview is safe. Sending the recommendation and publishing the
    site change remain explicit approvals.

## The complete customer experience

### 1. Drover notices

A client email, newsletter, calendar change, booking update, or other opted-in source reaches the client's
Drover product. The first release may begin with an operator selecting or forwarding one message. Broad
mailbox monitoring is not required to prove the experience.

Drover asks one question: does this change what a customer should see, know, or be able to do?

Most messages should produce nothing. Silence is a feature.

### 2. Drover checks the real site

Drover reads the relevant pages and connected public details. It looks for affected claims, buttons,
booking paths, addresses, maps, structured data, FAQs, banners, and already-scheduled notices.

It separates:

- what the client definitely announced;
- what the site currently says;
- where the two conflict;
- what Drover infers may need attention; and
- what still requires a human answer.

### 3. The operator receives a Care Card

The primary object is one compact recommendation, not a raw inbox item or task ticket.

Example:

> **Rohlax Wellness is moving August 1.**  
> I found the old address on the contact page and in the newsletter footer. I recommend updating the site
> address for August 1, adding the July closure notice now, preparing the September intake message, and
> holding the maternity notice until Chelsea confirms her return plan. These updates are included in her
> plan.

The operator can edit the recommendation and client-facing message, ignore it, or approve sending it.

### 4. The client gets a human email

The email uses the relationship's existing voice. It leads with the client, not the feature. It says:

- what Drover noticed;
- which changes may help;
- what is recommended and when;
- what the work costs;
- that nothing will change without approval; and
- that keeping the site the same is completely fine.

The client does not need a Drover account. They can reply in plain English or open a private review link.

### 5. The client sees the Change Preview

The private link opens the client's real website with the proposed words and states already in place.
This is the signature moment.

The preview contains:

- **Current / Recommended:** switch between the live site and proposed version.
- **Date view:** see what customers would see now, on August 1, on September 1, and on November 1.
- **Why we noticed:** the source excerpt beside the affected site content.
- **What stays the same:** sensitive or unresolved items Drover will not touch.
- **Decision strip:** Use recommendation / Choose changes / Keep site the same.
- **Plan coverage:** Included in your plan — $0, Needs a quote, or Not yet confirmed.

The date view should feel like moving through the client's business, not editing a schedule.

### 6. The client decides in plain English

"Yes to the address and closure. Hold the maternity note" is a valid decision.

Drover maps the response to the proposed changes and shows the operator exactly what it understood. If the
reply is ambiguous, Drover asks one short follow-up. Ambiguity never becomes approval.

### 7. Drover prepares the real update

Drover creates the site change in an isolated preview. It does not commit, push, or publish. The operator
reviews the real difference and sees the client's authorization beside it.

For approved future changes, Drover prepares the dates and reversals together:

- publish the new address on the chosen date;
- remove the closure notice after reopening;
- switch new-client messaging on September 1; and
- leave the maternity state untouched until Chelsea decides.

### 8. The update goes live and closes cleanly

Publishing still requires the authorized final action. After it goes live, the client receives one calm
confirmation with the live link and a receipt showing:

- what changed;
- when it changed;
- what will change later;
- what will remove itself;
- what was left unchanged; and
- the final price.

Drover checks later that the public site matches the approved plan and that temporary notices did not go
stale.

## Signature product surfaces

### Care Card

The operator-facing unit: one detected change, its evidence, the affected public surfaces, Drover's
recommendation, plan coverage, and the client email ready for review. It should live in the existing
conversation and decision flow, not in a new dashboard.

### Change Preview

The client-facing unit: the real site, already updated in preview, with Current / Recommended and granular
approval. This is the demoable product moment.

### Date View

A small timeline across real dates. It shows the public state of the business on each date, including
automatic removal of temporary information.

### Care Receipt

A permanent, plain-English record of the source, decision, approved work, timing, coverage, publication,
and cleanup. It is useful to the client and becomes durable memory for future recommendations.

## What the first build must include

The narrow first build should prove care, not inbox cleverness.

### Input

- An operator manually selects, pastes, or forwards one client communication.
- It is explicitly assigned to one client product and website.
- The source excerpt and original timestamp remain attached.

### Recommendation

- Drover compares the message with the real site.
- It proposes an open set of changes rather than forcing them into a closed taxonomy.
- Each proposal is marked Now, Later, Hold, or Needs confirmation in the interface; these are presentation
  choices, not a host-side ontology that can block a run.
- It identifies conflicts and recommends doing nothing when that is the stronger call.

### Operator review

- The Care Card appears in the existing conversation or decision inbox.
- The operator can edit the recommendation, select plan coverage, and approve the outgoing email.
- No email sends without that approval.

### Client decision

- The client receives a normal email in the operator's voice.
- A private link shows the recommendation, coverage, and real preview.
- The client can approve everything, approve individual changes, request edits, or keep the site unchanged.
- The client may also reply in plain English. In the first build, the operator records that decision;
  automatic reply interpretation comes next and must never treat ambiguity as approval.

### Build and publish

- Approved work is prepared in an isolated worktree with a preview.
- The operator sees the site difference and the client decision together.
- Publishing remains behind the founder wall.
- Temporary changes carry removal dates and verification after removal.

### Memory

- The client's approved facts, declined ideas, tone, sensitive boundaries, and coverage rules inform the
  next recommendation.
- One client's details never become another client's facts.

## Ambition ladder

### Version 1 — Recommended Update

One selected communication becomes a Care Card, a client email, a live site preview, granular approval,
and a receipt. This is the first build.

The proof: Chelsea sees the recommendation and feels helped rather than monitored or sold to.

### Version 2 — Always Cared For

Clients opt in to the sources Drover may watch: a Gmail label, forwarded newsletter address, booking feed,
calendar, form, or social account. Drover surfaces only changes with a credible public impact.

It adds:

- natural-language reply handling;
- timed publishing and automatic cleanup;
- checks across the site, maps, booking instructions, confirmation emails, and structured data;
- one quiet portfolio view containing only clients whose public business may be out of sync; and
- a yearly value summary such as "12 business changes caught, 9 approved, no stale notices left live."

### Version 3 — Business Continuity

Drover becomes the continuity layer for a small business's public presence. When the business changes,
every approved customer-facing surface stays coherent.

Ambitious capabilities:

- **Future-state previews:** a client can see their public business on any upcoming date.
- **Absence mode:** before a leave or busy season, Drover identifies what customers may need, prepares
  coverage messaging, and queues unresolved questions while the owner is away.
- **Consistency sweeps:** after a move or policy change, Drover finds stale references across the site,
  maps, booking tools, email templates, and public profiles.
- **Earned autopilot:** after repeated approvals, a client may explicitly promote a narrow pattern such as
  "keep my address in sync everywhere" or "publish and remove closure notices on approved dates."
- **Care memory:** Drover remembers how personal the client wants to be, which facts belong publicly, how
  they handle new-client pauses, and what they consider included.
- **Portfolio judgment:** the operator sees only where attention matters, ranked by customer harm and date,
  with the recommended outreach ready.
- **Reusable taste, private facts:** the agency's judgment about how to handle moves or closures compounds,
  while client-specific facts and personal details never cross accounts.

The long-term category is not website maintenance. It is **client care that keeps the public business true.**

## Upside if this works

### For the client

- They stop carrying a mental list of website updates during already stressful business or life changes.
- Their customers receive accurate locations, availability, policies, and booking expectations.
- Temporary information does not remain live for months.
- They feel the ongoing plan is active care rather than hosting or emergency edits.
- They retain control over personal information and public tone.

### For the operator

- Loose announcements become clear, reviewable work without waiting for a perfect request.
- One operator can care for more clients without making the relationship feel automated.
- Plan value becomes visible without manufacturing work or surprise charges.
- Genuine out-of-plan work can be quoted early and transparently.
- The approval history teaches the operator's judgment and reduces future review time.
- Client retention should improve because the service becomes present between requests.

### For Drover

- It creates a specific, tellable magic moment: "My client announced a move and Drover had the site update
  ready before she asked."
- It turns external signals, repo truth, gated action, and taste memory into one visible product experience.
- It creates recurring use without adding a dashboard habit.
- It produces hard-to-fake proof of value through receipts and kept-current public surfaces.
- It opens a strong vertical package for web studios, fractional teams, and founders managing several
  small businesses without changing Drover into generic agency software.
- Better models improve the judgment, while the durable advantage remains each relationship's approval
  history, boundaries, tone, and operating context.

## Trust, privacy, and billing boundaries

- Monitoring is opt-in per source. Connecting Gmail to send does not silently authorize broad inbox reading.
- The first build should prefer selected or forwarded messages over an all-mailbox reader. Later sources
  remain narrow: an approved sender, forwarding address, or Gmail label bound to one client product.
- Never persist raw message bodies in the append-only signal log. Parse transiently, then retain only the
  sender, subject, timestamp, provider message ID, integrity hash, extracted facts, and the shortest useful
  supporting excerpts. The client or operator can delete retained source evidence.
- Strip scripts, hidden HTML, tracking pixels, and remote content before interpretation. Treat all email
  text as untrusted evidence, never as instructions to an agent or tool.
- Do not read attachments, patient replies, or unrelated threads automatically. This boundary matters
  especially for health and wellness clients.
- Ignore unrelated personal details. Never infer medical facts, exact due dates, return dates, family
  plans, or business policy from personal news.
- Do not tell a client that Drover "detected" private activity. Say what was shared and why it may affect
  the site.
- Plan coverage is explicit project truth supplied by the operator or agreement. The model may explain it;
  it may not invent it.
- An unknown price blocks the client-facing price claim, not the analysis. The operator must resolve it
  before outreach.
- Client approval authorizes only the named change. It does not authorize unrelated edits, sending,
  publishing, or future automation.
- Every private review link expires, is scoped to one client and recommendation, and reveals no internal
  notes, other clients, or unrelated product data.
- Earned autopilot is narrow, explicit, revocable, and exception-first. It never grows from repeated use
  without a deliberate client/operator promotion.

## What not to build

- A generic shared inbox.
- A ticket board for website requests.
- A client login portal with navigation, settings, and account setup.
- A chatbot placed between the client and operator.
- A fixed menu of change types that prevents the model from noticing novel implications.
- Full-mailbox surveillance as the first experience.
- Automatic client outreach.
- Automatic publishing from a newsletter or inferred request.
- A plan-pricing engine that guesses whether work is included.
- A cross-client memory pool containing personal facts.
- A dashboard full of low-confidence suggestions.

These all make the product larger while hiding the magic: Drover understood what changed, already did the
thinking, and made the right next step easy.

## Acceptance case: Rohlax Wellness

Given the July Rohlax newsletter and the Rohlax website, the feature passes only if:

1. It identifies the move, closure, September intake change, and planned November leave.
2. It preserves the exact dates and cites the newsletter excerpt behind each claim.
3. It finds the old-address conflict and asks rather than choosing silently.
4. It recommends location and closure now, September later, and detailed maternity messaging on hold.
5. It explicitly shows that the selected updates are included in Chelsea's plan with no additional charge.
6. It produces a client email in Jacob's existing tone, including "keep the site the same" as a valid choice.
7. It shows a real preview with individual decisions and future dates.
8. It treats "yes to the first two, hold the rest" correctly and asks when a reply is ambiguous.
9. It prepares only the approved site work in an isolated worktree.
10. It cannot send the email or publish the update without the required human approval.
11. It removes the temporary closure notice after the approved reopening date and verifies the result.
12. It leaves a plain receipt the client and operator can both understand.
13. It proves project isolation, narrow source permissions, revocation, HTML sanitization, prompt-injection
    resistance, and zero raw-message-body persistence.

The test corpus must include tentative announcements, forwarded or stale newsletters, canceled moves,
relative dates and time zones, duplicate messages, third-party announcements, contradictory body/footer
facts, hidden malicious instructions, and personal news with no public business impact.

## Product evidence to collect

The first signal is Chelsea's response to the already-sent outreach. The important evidence is behavioral:

- Does she understand why the message arrived?
- Does she understand that the work is included?
- Can she approve or reject without a call or clarification?
- Does she choose different timing for different changes?
- Does the proactive note feel helpful rather than intrusive?
- How much operator time passes from source message to accurate recommendation?
- After approval, does the preview reduce revision rounds?

Expansion requires more than one friendly response. At least three different clients must approve a
proactive recommendation before asking for it, across more than one kind of business change, and the
operator must say Drover caught something that otherwise would have been missed or handled late.

The bet changes if clients consistently find the outreach invasive, if facts often need correction, if most
signals are ignored, if review takes longer than the work it saves, or if the preview does not reduce effort.
In that case, narrow the feature to operator-only recommendations or client-forwarded requests rather than
expanding monitoring. If clients value the finished site work but not proactive outreach, the winning
product is request-to-change, not ambient detection.

## Build sequence

### First coherent release

- Manually selected communication.
- Care Card in the existing conversation and decision flow.
- Site comparison and recommendation.
- Explicit plan coverage.
- Operator-approved client email.
- Private live preview with granular decisions.
- Isolated build and final publish gate.
- Care Receipt.

### Next if clients pull for it

- Plain-English reply interpretation.
- Date-aware publish and automatic cleanup.
- Opt-in Gmail label or forwarding address.
- Whole-business consistency sweep.
- Portfolio attention queue.

### Later, only after repeated trust

- Narrow promoted patterns.
- Cross-surface execution.
- Absence mode.
- Annual care proof.

## Repo fit and missing seams

Drover already has most of the safe path:

- a durable, project-scoped inbox for outside signals;
- model-backed routing that may wake a run but still stops at the founder wall;
- a single decision inbox and in-conversation gate review;
- Gmail sending behind approval;
- isolated worktree builds and local previews that stop before shipping; and
- durable decision and taste memory.

The feature should reuse those parts. The missing product seams are:

- an opted-in client communication source—the current Gmail connection is send-only, and the existing
  inbox reader follows replies only to messages Drover sent;
- optional client relationship and plan-coverage context. Missing coverage remains "not yet confirmed" and
  never blocks analysis or a run; it only blocks an unsupported price promise in client outreach;
- the Care Card and client-facing Change Preview;
- client decision capture without requiring an account;
- approved one-time future-state timing and cleanup—the current scheduler supports recurring wakes, not
  exact publish and removal dates;
- an exact site diff and securely hosted, client-accessible preview. The current build path can render a
  local preview but does not create the private review link this experience requires; and
- a truthful path from reviewed client-site change to publication. Today, ordinary in-repo builds stop at
  a local worktree ready for review and deliberately cannot commit, push, open a pull request, or deploy;
  this feature must either preserve that handoff or add a separately authorized publication path; and
- a final consistency check against the live public site.

The fuzzy work—understanding the communication, judging likely impact, writing the recommendation, and
preparing the proposed change—belongs to a rented agent in an open step. Do not add a host-side taxonomy of
moves, closures, leave, pricing, or change requests. The host should own only truth, permissions, durable
state, timing, and receipts.

## Final product call

Build the **Recommended Update** moment first: one selected client communication becomes a grounded
recommendation, a real site preview, granular approval, an included-cost receipt, and a safe staged change.

Do not lead with monitoring. Lead with the experience that makes a client say: **"You already thought of
that for me."**
