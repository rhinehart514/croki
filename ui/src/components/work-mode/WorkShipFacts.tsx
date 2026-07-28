import type { ShipInfo } from "@/api";

function short(value: string | null) {
  return value ? value.slice(0, 8) : "Unavailable";
}

export function WorkShipFacts({ info }: { info: ShipInfo }) {
  const source = info.repository;
  const pr = source.github.pullRequest;
  return <div className="ship-review-facts" aria-label="Exact source-control review">
    <dl>
      <div><dt>Base</dt><dd><code>{source.baseRef ?? source.baseBranch ?? "Unknown"}</code><small>{short(source.baseCommit)}</small></dd></div>
      <div><dt>Current</dt><dd><code>{source.currentBranch ?? "Detached"}</code><small>{short(source.currentCommit)}</small></dd></div>
      <div><dt>Upstream / base</dt><dd><code>{source.upstreamRef ?? source.baseRef ?? "Not set"}</code><small>{source.ahead} ahead · {source.behind} behind</small></dd></div>
      <div><dt>Working tree</dt><dd><strong>{source.dirty ? `${source.dirtyCount} dirty paths` : "Clean"}</strong><small>{source.dirty ? `${source.dirtyEntries.slice(0, 3).map((entry) => `${entry.status} ${entry.path}`).join(" · ")}${source.dirtyTruncated ? " · first 200 shown" : ""}` : "No uncaptured edits"}</small></dd></div>
      <div><dt>Remote</dt><dd><code>{source.remote.url ?? "No origin"}</code><small>{source.remote.name}</small></dd></div>
      <div><dt>Reviewed plan</dt><dd><code>{info.plan.fingerprint.slice(0, 12)}</code><small>Refreshes if branch, patch, remote, or drift changes</small></dd></div>
    </dl>

    <section>
      <strong>Commits in the reviewed lineage</strong>
      {source.commits.length ? <ul>{source.commits.map((commit) => <li key={commit.sha}>
        <code>{commit.shortSha}</code><span>{commit.subject}</span><small>{commit.author}</small>
      </li>)}</ul> : <p>No additional commits sit between the base and reviewed source.</p>}
      {source.commitsTruncated ? <p>{source.commitCount} commits are in this lineage; the latest {source.commits.length} are shown.</p> : null}
    </section>

    <section>
      <strong>Verification attached to this checkpoint</strong>
      {source.verification.length ? <ul>{source.verification.map((check, index) => <li key={`${check.command}:${index}`}>
        <code>{check.command}</code><span>{check.status}{check.exitCode != null ? ` · exit ${check.exitCode}` : ""}</span>
      </li>)}</ul> : <p>No verification is attached.</p>}
    </section>

    <section>
      <strong>GitHub pull request</strong>
      {pr ? <>
        <p><a href={pr.url ?? "#"} target="_blank" rel="noreferrer">PR #{pr.number ?? "?"}</a> · {pr.state} · {pr.mergeable} mergeability · {pr.reviewDecision ?? "no review decision"}</p>
        {pr.reviewRequests.length ? <p>Review requested from {pr.reviewRequests.join(", ")}</p> : null}
        {pr.checks.length ? <ul>{pr.checks.map((check) => <li key={check.name}>
          <span>{check.name}</span><small>{check.conclusion ?? check.status}</small>
        </li>)}</ul> : <p>No GitHub checks are reported.</p>}
      </> : <p>{source.github.reason}</p>}
    </section>

    <section className="ship-plan-summary">
      <strong>What confirmation will change</strong>
      <p>Refresh <code>{source.remote.name}</code>, create <code>{info.plan.branch}</code> from the reviewed source, commit the exact patch, push to <code>{info.plan.remote ?? "origin"}</code>, then prepare <code>{info.plan.pullRequest.head}</code> → <code>{info.plan.pullRequest.base ?? "default"}</code>.</p>
      {source.remote.preparedBranchCommit ? <p role="alert"><code>{source.remote.preparedBranchRef}</code> already points to {short(source.remote.preparedBranchCommit)}. Refresh or choose another branch before confirming.</p> : null}
    </section>
  </div>;
}
