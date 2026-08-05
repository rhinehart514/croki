# Croki product context

Croki is a narrow product overlay on the native coding-agent environment.
Threads, providers, worktrees, recovery, terminal, preview, files, plans, Git,
and Review remain native surfaces.

## Application lineage

Projects may declare application lineage in `.croki/application.croki`. Version
1 contains:

- the application identity, essential promise, and intended users;
- optional references to its active Release and parent Venture objects;
- optional released reality: version, summary, product facts, GTM facts,
  learnings, and release provenance;
- optional building intent: version, intent, expected product and GTM changes,
  and success signals.

At least one released or building state is required. A building-only file is
valid for an application approaching its first declared version.

The file is optional. Absence adds no prompt, warning, setup flow, or negative
composer status. Invalid, unsupported, unreadable, or oversized lineage also
fails open so native provider work can continue.

Released reality and building intent are founder-approved application facts.
Agents may inspect evidence and propose a change through an ordinary Thread and
Review, but must never silently establish or rewrite lineage.

## Provider behavior

Before every provider turn, the server reads a fresh application snapshot from
the canonical project root, including when the Thread executes in a worktree.
It prepends a bounded factual block to provider input and leaves the stored user
message unchanged.

The block distinguishes inherited released reality from the version currently
being built. It supplies no persona, planning loop, tool policy, delegation
policy, or additional authority. Native remains the default provider behavior.
Product is the single explicit one-turn ideation behavior and treats product
and market as one reality. Historical Venture and split GTM harness identifiers
remain readable for old turns but are not offered for new work.

The source is limited to 64 KiB and the rendered block to 12,000 characters.
Repository values are serialized, escaped, and identified as data rather than
behavioral instructions. The structured encoding is implementation detail; the
durable project object and user-facing format are `.croki`.

## Complete object model

Croki has four first-class perceptual boundaries:

```text
Venture
└── Application
    ├── Release
    └── Concept
        └── Concept
```

An Application is durable product reality. A Concept is independent exploration.
A Release reconciles accepted work into one before-and-after product and market
transition. A Venture shares only relevant company-level advantages and constraints
across applications. Each object is self-describing; Croki discovers child files and
never requires an index.

Evidence, decisions, relationships, Product and GTM lenses, Threads, worktrees,
screenshots, and plans do not become additional kinds. `.croki` is perception data,
never an executable or prompt-import format.

## Scoped concepts

A separately explored product idea is one self-describing Concept file at
`.croki/concepts/<id>.croki`. The file carries its own identity, parent
application and version boundary, branch, inherited assumptions, challenges,
relationships, evidence, and lifecycle state. Croki discovers direct Concept
files from the directory; there is no central index to maintain.

The logical and physical product object is the `.croki` file itself. Its
structured contents remain deterministic, bounded perception data. The same schema can later be packaged as a portable
`Application Sense.croki` file without introducing a competing model.

**Explore separately** creates the self-describing file and opens a Thread on
`croki/concept/<id>` in worktree mode. The founder's existing composer draft is
preserved. The parent application file remains unchanged.

Before a turn on that branch, the server reads the matching Concept from the
canonical project root and adds a fresh, bounded, escaped scope block beside
application lineage. Other Concepts are not loaded wholesale. Archived
Concepts add no provider context. Missing, invalid, mismatched, unreadable, or
oversized Concept files fail open.

An integration request is a Concept lifecycle state, not an automatic merge or
strategy update. Code integration and changes to durable application truth
require separate founder approval. `.croki` data is never interpreted as a
command or imported into the composer as a prompt.

## Release and Venture perception

An Application may reference `.croki/releases/<version>.croki` and
`.croki/venture.croki`. Before every provider turn, Croki freshly validates those
objects and supplies bounded, escaped factual blocks beside Application and Concept
perception. Missing, invalid, unsafe, archived, unreadable, or oversized scopes fail
open. Croki never walks arbitrary paths or loads an entire portfolio into context.

Opening the same files in the ADE produces their human views. Release is an editorial
shipping story—Before, After, product consequences, GTM expression, demo moments,
proof, and success. Venture is a restrained portfolio view of shared audience,
distribution, capabilities, constraints, opportunities, and conflicts. Source remains
available on demand for Git review and debugging.

## Release infrastructure

Application lineage does not require Git or a repository host.

- A GitHub-hosted project may cite its release URL and local tag.
- A local Git repository may cite only its tag and release-note files.
- A non-Git project may declare released or building reality without sources.

Hosted URLs and tags are provenance metadata. Provider injection never fetches
them, and a missing remote, GitHub CLI, credential, or network connection cannot
prevent a turn.

## Thread header

When lineage is loaded, the Thread header shows the application transition, for
example `0.4.5 → 0.4.6`. Its release cover presents one headline, the declared
intent, and up to three changes. Opening the application presents a generated
visual map of released reality, building intent, Concepts, product experience,
market consequences, proof, and provenance in the existing right-panel
workspace. Opening a child `.croki` enters that Concept's scoped view while
preserving a visible path to its parent. The file explorer disappears from this
experience; **Inspect .croki source** reveals the raw structured data only when
requested.

Legacy `.croki/application.json` files remain readable during migration. Croki
never creates new JSON-named application or Concept objects.

When lineage is absent, the old `No context` slot disappears. A declared but
unusable file produces a concise nonblocking warning.

## Canvas and legacy context

Canvas remains a possible projection of application lineage, Senses, evidence,
and Thread activity. It is not required to establish or inject lineage and must
not become a second memory, runtime, task board, conversation store, or
manually maintained scene.

`.croki/context.json`, its release candidate, and node-authoring model are
legacy compatibility formats. Historical `croki.context.applied` receipts stay
content-free and readable, but new provider turns and the composer do not use
that file.

## Verification

Run the focused application parser, provider, and composer tests, then:

```sh
npm run check:croki
```
