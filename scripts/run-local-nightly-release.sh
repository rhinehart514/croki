#!/bin/bash

set -Eeuo pipefail

readonly repository="${CROKI_NIGHTLY_REPOSITORY:-rhinehart514/croki}"
readonly branch="${CROKI_NIGHTLY_BRANCH:-croki/main}"
readonly state_root="${CROKI_NIGHTLY_STATE_ROOT:-$HOME/Library/Application Support/Croki Nightly Release}"
readonly mirror_dir="$state_root/repository.git"
readonly lock_dir="$state_root/run.lock"
readonly vp_bin="${CROKI_NIGHTLY_VP_BIN:-$HOME/.vite-plus/bin/vp}"
readonly gh_bin="${CROKI_NIGHTLY_GH_BIN:-/opt/homebrew/bin/gh}"
readonly node_bin="${CROKI_NIGHTLY_NODE_BIN:-/opt/homebrew/bin/node}"
readonly git_bin="${CROKI_NIGHTLY_GIT_BIN:-/usr/bin/git}"
readonly dry_run="${CROKI_NIGHTLY_DRY_RUN:-false}"

work_root=""

log() {
  printf '[croki-nightly] %s\n' "$*"
}

fail() {
  printf '[croki-nightly] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  if [[ -n "$work_root" && -d "$work_root/checkout" && -d "$mirror_dir" ]]; then
    "$git_bin" --git-dir="$mirror_dir" worktree remove --force "$work_root/checkout" >/dev/null 2>&1 || true
  fi
  if [[ -n "$work_root" && -d "$work_root" ]]; then
    rm -rf "$work_root"
  fi
  rm -f "$lock_dir/pid"
  rmdir "$lock_dir" >/dev/null 2>&1 || true
  exit "$exit_code"
}

require_executable() {
  [[ -x "$1" ]] || fail "Required executable is missing: $1"
}

read_output() {
  local key="$1"
  local file="$2"
  sed -n "s/^${key}=//p" "$file" | tail -n 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "Local nightlies require macOS."
[[ "$(uname -m)" == "arm64" ]] || fail "Local nightlies require an Apple Silicon Mac."

for executable in "$vp_bin" "$gh_bin" "$node_bin" "$git_bin"; do
  require_executable "$executable"
done

mkdir -p "$state_root"
if ! mkdir "$lock_dir" 2>/dev/null; then
  if [[ -f "$lock_dir/pid" ]]; then
    running_pid="$(sed -n '1p' "$lock_dir/pid")"
    if [[ "$running_pid" =~ ^[0-9]+$ ]] && kill -0 "$running_pid" 2>/dev/null; then
      log "Another nightly release is already running as process $running_pid; skipping."
      exit 0
    fi
  fi
  rm -f "$lock_dir/pid"
  rmdir "$lock_dir" 2>/dev/null || fail "Could not clear stale release lock at $lock_dir."
  mkdir "$lock_dir" || fail "Could not acquire release lock at $lock_dir."
fi
printf '%s\n' "$$" > "$lock_dir/pid"
trap cleanup EXIT INT TERM

"$gh_bin" auth status --hostname github.com >/dev/null 2>&1 || fail "GitHub CLI is not authenticated."

if [[ ! -d "$mirror_dir" ]]; then
  log "Creating the isolated release mirror."
  "$gh_bin" repo clone "$repository" "$mirror_dir" -- --mirror
fi

log "Fetching $repository and pruning stale refs."
"$git_bin" --git-dir="$mirror_dir" remote update --prune

readonly branch_ref="refs/heads/$branch"
target_sha="$($git_bin --git-dir="$mirror_dir" rev-parse "$branch_ref")" || fail "Branch $branch was not found in $repository."
latest_nightly_tag="$($git_bin --git-dir="$mirror_dir" for-each-ref \
  --sort=-creatordate --format='%(refname:strip=2)' 'refs/tags/v*-nightly.*' 'refs/tags/nightly-v*' | head -n 1)"

if [[ -n "$latest_nightly_tag" ]]; then
  latest_nightly_sha="$($git_bin --git-dir="$mirror_dir" rev-parse "$latest_nightly_tag^{commit}")"
  if [[ "$latest_nightly_sha" == "$target_sha" ]]; then
    log "No changes on $branch since $latest_nightly_tag; nothing to publish."
    exit 0
  fi
fi

if [[ "$dry_run" == "true" ]]; then
  log "Dry run passed for $repository@$branch ($target_sha)."
  log "A release would be built because the latest nightly is ${latest_nightly_tag:-absent}."
  exit 0
fi

work_root="$(mktemp -d "$state_root/work.XXXXXX")"
mkdir -p "$work_root/checkout" "$work_root/artifacts"
"$git_bin" --git-dir="$mirror_dir" worktree add --detach "$work_root/checkout" "$target_sha"
cd "$work_root/checkout"

log "Installing the locked workspace dependencies."
"$vp_bin" install --frozen-lockfile
"$vp_bin" run --filter @croki/desktop ensure:electron

readonly nightly_date="$(date -u +%Y%m%d)"
readonly nightly_run_number="$(date -u +%s)"
readonly metadata_file="$work_root/nightly.env"
"$node_bin" scripts/resolve-nightly-release.ts \
  --date "$nightly_date" \
  --run-number "$nightly_run_number" \
  --sha "$target_sha" > "$metadata_file"

version="$(read_output version "$metadata_file")"
tag="$(read_output tag "$metadata_file")"
release_name="$(read_output name "$metadata_file")"
[[ -n "$version" && -n "$tag" && -n "$release_name" ]] || fail "Nightly metadata was incomplete."

if "$gh_bin" release view "$tag" --repo "$repository" >/dev/null 2>&1; then
  log "Release $tag already exists; skipping."
  exit 0
fi

log "Validating commit $target_sha before publication."
"$vp_bin" check
"$vp_bin" run typecheck
"$vp_bin" run test

"$node_bin" scripts/update-release-package-versions.ts "$version"

log "Building unsigned macOS arm64 artifacts for $tag."
CROKI_DESKTOP_UPDATE_REPOSITORY="$repository" \
  VITE_CROKI_SERVER_PACKAGE_UPDATES_AVAILABLE=false \
  "$vp_bin" run dist:desktop:artifact \
    --platform mac \
    --target dmg \
    --arch arm64 \
    --build-version "$version" \
    --output-dir "$work_root/artifacts" \
    --verbose

shopt -s nullglob
assets=(
  "$work_root/artifacts"/*.dmg
  "$work_root/artifacts"/*.zip
  "$work_root/artifacts"/*.blockmap
  "$work_root/artifacts"/*.yml
)
(( ${#assets[@]} > 0 )) || fail "The desktop build produced no publishable assets."
dmg_assets=("$work_root/artifacts"/*.dmg)
(( ${#dmg_assets[@]} > 0 )) || fail "The desktop build produced no DMG."

release_args=(
  release create "$tag"
  "${assets[@]}"
  --repo "$repository"
  --target "$target_sha"
  --title "$release_name"
  --prerelease
  --latest=false
  --generate-notes
)
if [[ -n "$latest_nightly_tag" ]]; then
  release_args+=(--notes-start-tag "$latest_nightly_tag")
fi

log "Publishing $tag directly to GitHub Releases."
"$gh_bin" "${release_args[@]}"

published_tag="$($gh_bin release view "$tag" --repo "$repository" --json tagName --jq .tagName)"
published_assets="$($gh_bin release view "$tag" --repo "$repository" --json assets --jq '.assets | length')"
[[ "$published_tag" == "$tag" ]] || fail "GitHub did not return the expected release tag."
(( published_assets > 0 )) || fail "GitHub release $tag has no assets."

log "Published $tag with $published_assets assets from $target_sha."
