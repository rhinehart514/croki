// first-run.mjs — the connect → read-back → offers sequence, assembled deterministically at repo bind.
//
// Contract §4A.5 / Phase 7. When a venture binds a real product repository, Drover must (1) read the
// product back on the canvas as a correctable working theory — what it does, who it's for, and what is
// still uncertain, with uncertainty explicitly LABELED rather than asserted — and (2) offer the founder
// two or three concrete, repository-derived directions in the conversation ("contact these buyers",
// "rewrite onboarding"), in ordinary language, not internal nouns.
//
// Truth discipline (FIRM-SPEC): a read-back is either CITED or LABELED INFERENCE, never asserted. This
// module derives the read-back from truth.mjs's bounded, cited repository scan and records it as a
// working theory whose grounded subjects carry real, digest-verified repository sources and whose
// interpretive subject is explicitly framed as Drover's guess for the founder to correct. It makes NO
// model call: the derivation is deterministic over cited facts, which keeps first-run offline-safe and
// reproducible. The interpretive step is intentionally injectable (see `deriveReadBack`) so a future
// model-backed product-model generator can replace the deterministic reader without moving this seam.
//
// This module never creates outward acts, campaigns, bets, or spend — the offers are conversation
// messages the founder picks from (routed through direction routing when chosen, Phase 4), not a plan
// to approve. Idea-stage ventures (a venture from a description with no repository) are out of scope
// (Phase 7 scope note: deferred-not-scheduled); first-run runs only for the repo-backed case.

import { readRepositoryTruth, readRepositoryExcerpt } from "./truth.mjs";
import { recordWorkingTheory } from "./architecture-proposals.mjs";
import { getArchitecture } from "./architecture.mjs";
import { appendConversationMessage } from "./conversation.mjs";

// The number of concrete directions first-run offers. Two or three per the contract; three when the
// scan gives us enough distinct, grounded footholds, two otherwise.
const MAX_OFFERS = 3;
const MIN_OFFERS = 2;

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

// End a fragment cleanly before concatenating another sentence onto it — a description that already
// ends in terminal punctuation must not produce a doubled period ("holding companies.. Who…").
function sentence(fragment) {
  return String(fragment ?? "").replace(/[.!?]+$/, "").trim();
}

// Internal compatibility-seam identifiers (contract §0) that must never surface as a founder-facing
// product name. Matched case-insensitively against the manifest name with any package scope stripped,
// so a repo whose package.json name is a seam slug (e.g. "gtm-ide" or "@drover/gtm-ide") never renders
// verbatim in read-back copy.
const SEAM_IDENTIFIERS = new Set([
  "gtm-ide", "bet", "bets", "motion", "motions", "fork", "forks",
  "outcome", "outcomes", "stage", "stages", "staged", "channel", "drifting",
]);

// The founder-facing product name. The manifest name is a repository fact, not founder copy: a package
// name is frequently an internal seam slug ("gtm-ide") or an ugly kebab/identifier slug ("acme-saas")
// that has no place in a read-back the founder reads. When the manifest name is a seam or a bare slug,
// prefer the founder's own venture name; fall back to a neutral phrase only when neither is usable. The
// founder-given venture name always wins over a slug because it is the name the founder chose to see.
function deriveProductName(manifestName, ventureName) {
  const manifest = text(manifestName);
  const venture = text(ventureName);
  const bare = manifest ? manifest.replace(/^@[^/]+\//, "").toLowerCase() : null;
  const isSeam = bare ? SEAM_IDENTIFIERS.has(bare) : false;
  // A slug is a machine identifier, not a name a founder would write: lowercase, no spaces, joined by
  // hyphens/underscores/dots/slashes/scopes. Founder-facing copy shows the venture name instead.
  const isSlug = manifest ? /^[@a-z0-9]+(?:[-_./][a-z0-9]+)+$/.test(manifest) : false;
  if (manifest && !isSeam && !isSlug) return manifest;
  return venture ?? "this product";
}

// A repository excerpt captured as a durable, digest-verified working-theory source. readRepositoryExcerpt
// mints the ref/digest format recordWorkingTheory re-validates, so a source captured here is a real
// citation, not a fabricated one. Returns null when the file is absent — honest absence, never a faked cite.
function captureSource(repository, file, startLine, endLine) {
  try {
    return readRepositoryExcerpt(repository, { file, startLine, endLine });
  } catch {
    return null;
  }
}

// The first readable code file the scan found, used to ground the "who it's for / how value happens"
// read in something the product actually ships, not just its manifest.
function firstCodeFile(files) {
  return files.find((file) => /\.(m?[jt]sx?|py|rb|go|rs)$/.test(file) && !/\.(test|spec)\./.test(file)) ?? null;
}

// Derive the labeled read-back from the cited scan. Deterministic and injectable: the return shape is a
// small set of subjects (each grounded in captured sources or explicitly marked as inference) plus the
// concrete direction offers. A model-backed generator can implement the same contract later.
export function deriveReadBack(scan, sources, ventureName = null) {
  const manifest = scan.manifest ?? {};
  const productName = deriveProductName(manifest.name, ventureName);
  const description = text(manifest.description);
  const deps = Array.isArray(manifest.dependencies) ? manifest.dependencies : [];

  const groundedRefs = sources.map((source) => source.ref);
  // Every read-back subject must carry a concrete anchor (recordWorkingTheory enforces this). With no
  // captured source the venture is blind — the caller falls back rather than fabricating an anchor.
  if (!groundedRefs.length) return null;

  const doesStatement = description
    ? `${productName} is: ${description}`
    : `${productName} is the product in this repository; its manifest and code are the read.`;

  // The "who it's for" read is genuine interpretation layered on cited facts — labeled so the founder
  // sees it as Drover's guess, correctable in dialogue, not an asserted fact.
  const audienceGuess = description
    ? `Drover's read (correct me): the people ${productName} helps are those the description points at — ${sentence(description)}. Who they really are is a guess until you say.`
    : `Drover's read (correct me): who ${productName} is for is not yet stated in the repository. Tell me who you're building for and I'll ground it.`;

  const stackNote = deps.length
    ? `Built on ${deps.slice(0, 4).join(", ")}${deps.length > 4 ? ", and more" : ""}.`
    : "The stack is not declared in the manifest.";

  const subjects = [
    {
      id: "read-what-it-does",
      name: "What it does",
      statement: `${doesStatement} ${stackNote}`,
      anchor: groundedRefs,
    },
    {
      id: "read-who-its-for",
      name: "Who it may help",
      statement: audienceGuess,
      anchor: groundedRefs,
    },
    {
      id: "read-uncertain",
      name: "What's uncertain",
      statement: `Uncertain, needs you: how ${productName} makes value happen and which of these people to reach first. This is Drover's inference from the repository, not a claim it proves — correct it and I'll re-ground.`,
      anchor: groundedRefs,
    },
  ];

  const offers = deriveOffers({ productName, description, deps, files: scan.files ?? [] });
  return { subjects, offers };
}

// Two or three concrete, repository-derived directions in ordinary language. Each is grounded in a real
// scan fact so the offer is honest ("contact these buyers" only when the product implies a buyer). These
// are picks, not a plan: the founder chooses one and it routes to a teammate (Phase 4).
function deriveOffers({ productName, description, deps, files }) {
  const offers = [];
  const has = (pattern) => files.some((file) => pattern.test(file));

  if (has(/signup|onboard|invite|register/i)) {
    offers.push(`Rewrite onboarding so a first-time ${productName} user reaches value faster.`);
  }
  if (has(/pricing|checkout|billing|plan/i)) {
    offers.push(`Sharpen the pricing page so the offer reads clearly to a buyer.`);
  }
  if (has(/landing|marketing|page\.(t|j)sx/i) || description) {
    offers.push(`Reach the first buyers for ${productName} with one grounded, specific invitation.`);
  }
  if (deps.some((dep) => /analytics|segment|posthog|mixpanel|amplitude/i.test(dep))) {
    offers.push(`Close the loop so every new ${productName} account can be traced back to what brought it in.`);
  }

  // Always ensure at least the minimum: a broad, always-valid grounded direction so first-run never
  // returns an empty offer set even for a sparse repository.
  if (offers.length < MIN_OFFERS) {
    offers.push(`Contact the first people ${productName} could help and learn which promise earns a reply.`);
  }
  if (offers.length < MIN_OFFERS) {
    offers.push(`Publish, in the buyers' own words, the problem ${productName} solves.`);
  }
  return [...new Set(offers)].slice(0, MAX_OFFERS);
}

// Run the first-run sequence for a freshly bound venture: capture cited sources from the repository,
// record the correctable read-back as a working theory (rendered on the canvas), and append the concrete
// direction offers to the conversation. Idempotent-safe against a re-run only in that the caller decides
// when to invoke it (once, right after createVenture); this module performs the sequence it is given.
//
// Returns { theory, offers, grounded } on success, or { grounded: false } when the repository yields no
// citable source (a blind scan) — in which case first-run honestly does nothing rather than assert a
// read it cannot ground.
export function runFirstRun({ ventureId, repository, ventureName = null }, options = {}) {
  const scan = readRepositoryTruth(repository);

  // Capture real, digest-verified sources: the manifest and the primary context file, plus the first
  // shipped code file so the read is grounded in what the product actually is.
  const sources = [];
  const manifestSource = captureSource(repository, "package.json", 1, 40);
  if (manifestSource) sources.push(manifestSource);
  for (const contextFile of ["README.md", "docs/STATE.md"]) {
    const source = captureSource(repository, contextFile, 1, 20);
    if (source) { sources.push(source); break; }
  }
  const code = firstCodeFile(scan.files ?? []);
  if (code) {
    const source = captureSource(repository, code, 1, 24);
    if (source) sources.push(source);
  }

  const readBack = deriveReadBack(scan, sources, ventureName);
  if (!readBack) {
    // Blind repository: no citable source. Honest absence — no read-back, no fabricated offers.
    return { grounded: false, theory: null, offers: [] };
  }

  const architecture = getArchitecture(ventureId, options);
  const operations = readBack.subjects.map((subject) => ({
    op: "upsert-subject",
    id: subject.id,
    value: { id: subject.id, name: subject.name, statement: subject.statement },
  }));
  const anchors = readBack.subjects.map((subject) => ({
    subjectRef: `theory:${subject.id}`,
    sourceRefs: subject.anchor,
  }));

  const { theory } = recordWorkingTheory({
    ventureId,
    baseRevision: architecture.revision,
    intent: "Drover's first read of the connected product — correct anything and I'll re-ground it.",
    supersedes: null,
    operations,
    anchors,
    sources,
    proposedBy: { authority: "agent", id: "first-run" },
  }, options);

  // The direction offers land in the conversation as an agent message the founder picks from. Ordinary
  // language, concrete actions — not internal nouns, not a plan to approve.
  const offerLines = readBack.offers.map((offer, index) => `${index + 1}. ${offer}`).join("\n");
  const message = appendConversationMessage({
    ventureId,
    role: "agent",
    kind: "message",
    content: `I read the connected product and drew a first working theory on the canvas — what it does, who it may help, and what's still uncertain. Correct anything there and I'll re-ground it.\n\nA few concrete directions I can take from here — pick one and I'll route it to the right teammate:\n\n${offerLines}`,
    teammateRef: null,
  }, options);

  return { grounded: true, theory, offers: readBack.offers, messageId: message.id };
}
