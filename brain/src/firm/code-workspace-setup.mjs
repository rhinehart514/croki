import fs from "node:fs";
import path from "node:path";

function linkDependencyTree(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  const localCaches = new Set([".cache", ".tmp", ".vite"]);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const target = path.join(destination, entry.name);
    if (localCaches.has(entry.name)) {
      fs.mkdirSync(target, { recursive: true });
    } else if (entry.name.startsWith("@") && entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      for (const scoped of fs.readdirSync(path.join(source, entry.name))) {
        fs.symlinkSync(path.join(source, entry.name, scoped), path.join(target, scoped), "junction");
      }
    } else {
      fs.symlinkSync(path.join(source, entry.name), target, "junction");
    }
  }
}

function linkDependencies(repo, worktree) {
  for (const relative of ["node_modules", "brain/node_modules", "ui/node_modules"]) {
    const source = path.join(repo, relative);
    const destination = path.join(worktree, relative);
    if (!fs.existsSync(source) || fs.existsSync(destination)) continue;
    linkDependencyTree(source, destination);
  }
}

function installConsequenceGuards(worktree, git) {
  const gitDir = path.resolve(worktree, git(worktree, ["rev-parse", "--git-dir"]));
  const hooks = path.join(gitDir, "drover-founder-guards");
  fs.mkdirSync(hooks, { recursive: true });
  const protectedRoot = worktree.replaceAll("'", "'\"'\"'");
  const script = `#!/bin/sh
protected_root='${protectedRoot}'
current_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ "$current_root" = "$protected_root" ]; then
  echo 'Croki: commit, merge, and push remain founder-held consequences.' >&2
  exit 1
fi
exit 0
`;
  for (const name of ["pre-commit", "pre-merge-commit", "pre-push", "pre-rebase"]) {
    fs.writeFileSync(path.join(hooks, name), script, { mode: 0o755 });
  }
  return hooks;
}

export function prepareCodingWorkspaceFilesystem(repo, worktree, git) {
  linkDependencies(repo, worktree);
  return installConsequenceGuards(worktree, git);
}
