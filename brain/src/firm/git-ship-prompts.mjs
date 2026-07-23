// git-ship-prompts.mjs — everything that PREPARES ship content for the founder-gated ship action:
// branch/commit/PR naming rules, preparation prompts, and the deterministic drafts derived from the
// durable coding workspace record. Code answers what code can answer: goal, changed files, and
// recorded verification become the default branch name, commit message, and PR body without a model
// call; an agent that wants richer content runs the prompts here and stages the result through
// prepareShipDrafts. Either way every field passes the same sanitizers before the founder sees it.
// Preparation only: nothing in this file executes git, gh, or any outward effect.
//
// Portions Copyright (c) 2026 T3 Tools Inc. Licensed under MIT (github.com/pingdotgg/t3code).
// Adapted from packages/shared/src/git.ts, apps/server/src/textGeneration/TextGenerationPrompts.ts,
// and apps/server/src/textGeneration/TextGenerationUtils.ts with Effect idioms removed.

/** Truncate a text section to `maxChars`, appending a `[truncated]` marker when needed. */
export function limitSection(value, maxChars) {
  const text = String(value ?? "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated]`;
}

/**
 * Sanitize an arbitrary string into a valid, lowercase git refName fragment.
 * Strips quotes, collapses separators, limits to 64 chars.
 */
export function sanitizeBranchFragment(raw) {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/^[./\s_-]+|[./\s_-]+$/g, "");

  const branchFragment = normalized
    .replace(/[^a-z0-9/_-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/-+/g, "-")
    .replace(/^[./_-]+|[./_-]+$/g, "")
    .slice(0, 64)
    .replace(/[./_-]+$/g, "");

  return branchFragment.length > 0 ? branchFragment : "update";
}

/**
 * Sanitize a string into a `feature/…` branch name.
 * Preserves an existing `feature/` prefix or slash-separated namespace.
 */
export function sanitizeFeatureBranchName(raw) {
  const sanitized = sanitizeBranchFragment(raw);
  if (sanitized.includes("/")) {
    return sanitized.startsWith("feature/") ? sanitized : `feature/${sanitized}`;
  }
  return `feature/${sanitized}`;
}

const AUTO_FEATURE_BRANCH_FALLBACK = "feature/update";

/**
 * Resolve a unique `feature/…` branch name that doesn't collide with any
 * existing branch. Appends a numeric suffix when needed.
 */
export function resolveAutoFeatureBranchName(existingBranchNames, preferredBranch) {
  const preferred = String(preferredBranch ?? "").trim();
  const resolvedBase = sanitizeFeatureBranchName(preferred.length > 0 ? preferred : AUTO_FEATURE_BRANCH_FALLBACK);
  const existingNames = new Set((existingBranchNames ?? []).map((name) => String(name).toLowerCase()));

  if (!existingNames.has(resolvedBase)) return resolvedBase;

  let suffix = 2;
  while (existingNames.has(`${resolvedBase}-${suffix}`)) suffix += 1;
  return `${resolvedBase}-${suffix}`;
}

/** Normalise a raw commit subject to imperative-mood, ≤72 chars, no trailing period. */
export function sanitizeCommitSubject(raw) {
  const singleLine = String(raw ?? "").trim().split(/\r?\n/g)[0]?.trim() ?? "";
  const withoutTrailingPeriod = singleLine.replace(/[.]+$/g, "").trim();
  if (withoutTrailingPeriod.length === 0) return "Update project files";
  if (withoutTrailingPeriod.length <= 72) return withoutTrailingPeriod;
  return withoutTrailingPeriod.slice(0, 72).trimEnd();
}

/** Normalise a raw PR title to a single line with a sensible fallback. */
export function sanitizePrTitle(raw) {
  const singleLine = String(raw ?? "").trim().split(/\r?\n/g)[0]?.trim() ?? "";
  return singleLine.length > 0 ? singleLine : "Update project changes";
}

/** Join a subject and optional body into one commit message. */
export function formatCommitMessage(subject, body) {
  const trimmedBody = String(body ?? "").trim();
  if (trimmedBody.length === 0) return subject;
  return `${subject}\n\n${trimmedBody}`;
}

/** Split a founder- or agent-authored commit message into subject and body, or null when empty. */
export function parseCustomCommitMessage(raw) {
  const normalized = String(raw ?? "").replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return null;
  const [firstLine, ...rest] = normalized.split("\n");
  const subject = firstLine?.trim() ?? "";
  if (subject.length === 0) return null;
  return { subject, body: rest.join("\n").trim() };
}

/**
 * Prompt an SDK agent can run to draft a commit message (and optionally a branch fragment)
 * from the exact staged material. The caller parses the JSON keys named in `outputKeys`.
 */
export function buildCommitMessagePrompt({ branch, stagedSummary, stagedPatch, includeBranch = false }) {
  const prompt = [
    "You write concise git commit messages.",
    includeBranch
      ? "Return a JSON object with keys: subject, body, branch."
      : "Return a JSON object with keys: subject, body.",
    "Rules:",
    "- subject must be imperative, <= 72 chars, and no trailing period",
    "- body can be empty string or short bullet points",
    ...(includeBranch ? ["- branch must be a short semantic git branch fragment for this change"] : []),
    "- capture the primary user-visible or developer-visible change",
    "",
    `Branch: ${branch ?? "(detached)"}`,
    "",
    "Staged files:",
    limitSection(stagedSummary ?? "", 6_000),
    "",
    "Staged patch:",
    limitSection(stagedPatch ?? "", 40_000),
  ].join("\n");
  return { prompt, outputKeys: includeBranch ? ["subject", "body", "branch"] : ["subject", "body"] };
}

/** Prompt an SDK agent can run to draft a pull request title and body from the exact range. */
export function buildPrContentPrompt({ baseBranch, headBranch, commitSummary, diffSummary, diffPatch }) {
  const prompt = [
    "You write GitHub pull request content.",
    "Return a JSON object with keys: title, body.",
    "Rules:",
    "- title should be concise and specific",
    "- body must be markdown and include headings '## Summary' and '## Testing'",
    "- under Summary, provide short bullet points",
    "- under Testing, include bullet points with concrete checks or 'Not run' where appropriate",
    "",
    `Base branch: ${baseBranch}`,
    `Head branch: ${headBranch}`,
    "",
    "Commits:",
    limitSection(commitSummary ?? "", 12_000),
    "",
    "Diff stat:",
    limitSection(diffSummary ?? "", 12_000),
    "",
    "Diff patch:",
    limitSection(diffPatch ?? "", 40_000),
  ].join("\n");
  return { prompt, outputKeys: ["title", "body"] };
}

/** Deterministic ship content from the durable coding workspace record — no model call needed. */
export function draftShipContent(record, { existingBranchNames = [] } = {}) {
  const custom = parseCustomCommitMessage(record?.consequence?.commitMessage ?? "");
  const commitSubject = sanitizeCommitSubject(custom?.subject ?? record?.goal ?? "");
  const commitBody = custom?.body ?? "";
  const branch = resolveAutoFeatureBranchName(existingBranchNames, sanitizeFeatureBranchName(commitSubject));
  const files = (record?.changedFiles ?? []).map((entry) => entry.path).filter(Boolean);
  const passed = [...new Set((record?.verification ?? [])
    .filter((entry) => entry.status === "passed" && entry.command)
    .map((entry) => entry.command))];
  const prBody = [
    "## Summary",
    `- ${String(record?.goal ?? "").trim() || commitSubject}`,
    ...files.slice(0, 20).map((file) => `- \`${file}\``),
    "",
    "## Testing",
    ...(passed.length ? passed.map((command) => `- \`${command}\` passed`) : ["- Not run"]),
  ].join("\n");
  return {
    branch,
    commitSubject,
    commitBody,
    commitMessage: formatCommitMessage(commitSubject, commitBody),
    prTitle: sanitizePrTitle(commitSubject),
    prBody,
  };
}

// Overlay prepared or founder-edited fields on the deterministic base, re-sanitizing everything so
// no path — agent, stored draft, or request body — can smuggle an unbounded subject or a multi-line
// PR title past the decision point. Branch names are only shaped here; existence and ref validity
// are asserted at execution time against the live repository.
export function mergeShipDrafts(base, overrides = {}) {
  const branch = String(overrides.branch ?? "").trim();
  const custom = parseCustomCommitMessage(overrides.commitMessage ?? "");
  const commitSubject = sanitizeCommitSubject(custom?.subject ?? overrides.commitSubject ?? base.commitSubject);
  const commitBody = String(custom ? custom.body : overrides.commitBody ?? base.commitBody ?? "").trim();
  return {
    // A chosen branch keeps its exact namespace (only shaped into a safe ref fragment); the forced
    // feature/ prefix applies to generated names alone, so what the founder read is what ships.
    branch: branch ? sanitizeBranchFragment(branch) : base.branch,
    commitSubject,
    commitBody,
    commitMessage: formatCommitMessage(commitSubject, commitBody),
    prTitle: sanitizePrTitle(String(overrides.prTitle ?? "").trim() || base.prTitle),
    prBody: String(overrides.prBody ?? "").trim() || base.prBody,
  };
}
