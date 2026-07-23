import fs from "node:fs";
import path from "node:path";

const repository = path.resolve(import.meta.dirname, "..");
const forbidden = ["components/canvas", "components/stage", "@gtm-ide/design-system", "design-system/"];
const failures = [];
// Observed after the 2026-07-22 T3 polish cleanup: 133 production Brain modules. The one dead module
// (firm/architecture-system-assembly.mjs) was deleted; the remaining growth over the prior 126 baseline
// is legitimate feature-local extraction forced by the 500-line service limit — work-loop alone splits
// into focused files because work-loop.mjs already sits at that limit. knip and reachability confirm no
// other orphans. Headroom is intentionally spent to zero during the polish freeze: no new modules should
// land now, so the next extraction must re-baseline this line consciously rather than drift past it.
// 2026-07-22 re-baseline 133 → 134: firm/repository-files.mjs, the @-file composer reach — a bounded
// read of what git already sees, adopted with its route, test, and composer wiring rather than folded
// into an unrelated module. The capability pass that landed the same day added zero modules.
// 2026-07-22 re-baseline 134 → 136: firm/work-loop-stream.mjs and runtimes/claude-stream.mjs, the
// SDK streaming core (long-lived prompt queue, steering, live run controls, partial deltas, resume
// cursor). Both parents sit at the 500-line service limit (work-loop.mjs 497, claude-code.mjs 493),
// so the extraction is forced feature-local splitting, not drift.
// 2026-07-23 re-baseline 136 → 138: firm/preview-broker.mjs and firm/preview-work-loop-tools.mjs,
// the agent-drivable preview. The broker owns the session-pinning invariant (one run pins one preview
// session, no cross-thread access) and the tools module screens the preview vocabulary into the work
// loop; work-loop-tools.mjs already sits near the service limit, so both land as feature-local modules.
// 2026-07-23 re-baseline 138 → 140: firm/git-ship.mjs and firm/git-ship-prompts.mjs, the founder-gated
// ship action. The split is the authority boundary itself: git-ship-prompts.mjs is preparation only
// (sanitizers, prompts, deterministic drafts — what agents may touch) while git-ship.mjs holds drift
// facts and the execute path (branch/commit/push/PR — founder-only). Folding them together would put
// agent-reachable preparation and outward execution in one module and push it past the service limit.
// 2026-07-23 re-baseline 140 → 141: provider-interventions.mjs is the one durable bridge from
// provider-native questions/permissions into the existing founder wall and exact session resume.
// Keeping normalization, one-shot grants, and resume in one feature module avoids provider-specific
// policy leaking across wall.mjs, work-loop.mjs, and the Claude runtime.
// 2026-07-23 re-baseline 141 → 146: the local journey-observation boundary adds four cohesive modules
// for staging/profile privacy, deterministic aggregation, provisional mapping proposals, and HTTP
// routes. dialogue-event-stream.mjs is the fifth: extracting the existing SSE transport keeps
// dialogue-routes.mjs under the 500-line service ceiling without creating another conversation path.
// 2026-07-23 re-baseline 146 → 148: streaming parity adds two modules on the token path. drive-stream.mjs
// is the payload-carrying bus a forming reply rides (the existing firm-events.mjs stays data-free, so a
// token cannot cost a timeline refetch), and codex-events.mjs isolates the Codex CLI's JSONL event shapes
// so the adapter reads one normalized stream instead of parsing item families inline.
// 2026-07-23 re-baseline 148 → 149: code-workspace-setup.mjs isolates dependency linking and founder
// consequence guards after code-workspace.mjs crossed the authoritative 500-line service ceiling.
const BRAIN_MODULE_CEILING = 149;

function files(directory, pattern) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target, pattern) : pattern.test(entry.name) ? [target] : [];
  });
}

for (const file of [...files(path.join(repository, "ui/src"), /\.(?:ts|tsx|css)$/), ...files(path.join(repository, "brain/src"), /\.mjs$/)]) {
  const source = fs.readFileSync(file, "utf8");
  for (const token of forbidden) if (source.includes(token)) failures.push(`${path.relative(repository, file)} imports retired boundary ${token}`);
  if (/export\s+const\s+jsonPersistence\b/.test(source)) failures.push(`${path.relative(repository, file)} restores the duplicate persistence alias`);
}

const brainFiles = files(path.join(repository, "brain/src"), /\.mjs$/).map((file) => path.resolve(file));
if (brainFiles.length > BRAIN_MODULE_CEILING) {
  failures.push(`Brain module ceiling exceeded: ${brainFiles.length} > ${BRAIN_MODULE_CEILING} (polish-freeze baseline; re-baseline this line consciously if the new module is legitimate)`);
}
const brainSet = new Set(brainFiles);
const graph = new Map(brainFiles.map((file) => [file, []]));
for (const file of brainFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)["'](\.[^"']+)["']/g)) {
    const target = path.resolve(path.dirname(file), match[1]);
    const resolved = brainSet.has(target) ? target : brainSet.has(`${target}.mjs`) ? `${target}.mjs` : null;
    if (resolved) graph.get(file).push(resolved);
  }
}

const visiting = new Set();
const visited = new Set();
function visit(file, stack = []) {
  if (visiting.has(file)) {
    const start = stack.indexOf(file);
    failures.push(`Brain cycle: ${[...stack.slice(start), file].map((entry) => path.relative(repository, entry)).join(" -> ")}`);
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  for (const dependency of graph.get(file) ?? []) visit(dependency, [...stack, file]);
  visiting.delete(file);
  visited.add(file);
}
for (const file of brainFiles) visit(file);

if (failures.length) {
  console.error([...new Set(failures)].join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Architecture verified (${brainFiles.length} Brain modules, no cycles or retired imports).`);
}
