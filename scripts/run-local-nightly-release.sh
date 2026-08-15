#!/bin/bash

set -Eeuo pipefail

readonly source_repository="${CROKI_NIGHTLY_SOURCE_REPOSITORY:-rhinehart514/croki}"
readonly update_repository="${CROKI_NIGHTLY_UPDATE_REPOSITORY:-rhinehart514/croki-releases}"
readonly branch="${CROKI_NIGHTLY_BRANCH:-croki/main}"
readonly state_root="${CROKI_NIGHTLY_STATE_ROOT:-$HOME/Library/Application Support/Croki Nightly Release}"
readonly mirror_dir="$state_root/repository.git"
readonly lock_dir="$state_root/run.lock"
readonly gh_bin="${CROKI_NIGHTLY_GH_BIN:-/opt/homebrew/bin/gh}"
readonly git_bin="${CROKI_NIGHTLY_GIT_BIN:-/usr/bin/git}"
readonly unzip_bin="${CROKI_NIGHTLY_UNZIP_BIN:-/usr/bin/unzip}"
readonly dry_run="${CROKI_NIGHTLY_DRY_RUN:-false}"
readonly script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly repository_root="$(cd "$script_dir/.." && pwd)"

resolve_vp_bin() {
  if [[ -n "${CROKI_NIGHTLY_VP_BIN:-}" ]]; then
    printf '%s\n' "$CROKI_NIGHTLY_VP_BIN"
  elif [[ -x "$HOME/.vite-plus/bin/vp" ]]; then
    printf '%s\n' "$HOME/.vite-plus/bin/vp"
  elif [[ -x "$HOME/Library/pnpm/vp" ]]; then
    printf '%s\n' "$HOME/Library/pnpm/vp"
  else
    printf '%s\n' "$repository_root/node_modules/.bin/vp"
  fi
}

resolve_node_bin() {
  if [[ -n "${CROKI_NIGHTLY_NODE_BIN:-}" ]]; then
    printf '%s\n' "$CROKI_NIGHTLY_NODE_BIN"
  elif [[ -x "/opt/homebrew/opt/node@24/bin/node" ]]; then
    printf '%s\n' "/opt/homebrew/opt/node@24/bin/node"
  else
    printf '%s\n' "/opt/homebrew/bin/node"
  fi
}

readonly vp_bin="$(resolve_vp_bin)"
readonly node_bin="$(resolve_node_bin)"
readonly release_workspace_filters=(
  --filter "@croki/desktop..."
  --filter "croki-server..."
  --filter "@croki/scripts..."
)
readonly install_workspace_filters=(
  "${release_workspace_filters[@]}"
  --filter "@croki/oxlint-plugin-croki..."
)
export PATH="$(dirname "$node_bin"):$PATH"

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

for executable in "$vp_bin" "$gh_bin" "$node_bin" "$git_bin" "$unzip_bin"; do
  require_executable "$executable"
done

"$node_bin" -e '
  const [major, minor, patch] = process.versions.node.split(".").map(Number);
  if (major !== 24 || minor < 13 || (minor === 13 && patch < 1)) process.exit(1);
' || fail "Local nightlies require Node ^24.13.1; found $($node_bin --version) at $node_bin."

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

readonly branch_ref="refs/heads/$branch"
if [[ "$dry_run" == "true" ]]; then
  target_sha="$("$gh_bin" api "repos/$source_repository/git/ref/heads/$branch" --jq .object.sha)" || fail "Branch $branch was not found in $source_repository."
else
  if [[ -d "$mirror_dir" ]] &&
    [[ "$("$git_bin" --git-dir="$mirror_dir" rev-parse --is-bare-repository 2>/dev/null || true)" != "true" ]]; then
    log "Removing an incomplete release mirror."
    rm -rf "$mirror_dir"
  fi
  if [[ ! -d "$mirror_dir" ]]; then
    log "Creating the isolated release mirror."
    "$gh_bin" repo clone "$source_repository" "$mirror_dir" -- --mirror --filter=blob:none
  fi

  log "Fetching $source_repository and pruning stale refs."
  "$git_bin" --git-dir="$mirror_dir" remote update --prune
  target_sha="$("$git_bin" --git-dir="$mirror_dir" rev-parse "$branch_ref")" || fail "Branch $branch was not found in $source_repository."
fi
latest_nightly_tag="$("$gh_bin" release list --repo "$update_repository" --limit 100 \
  --json tagName,isPrerelease,publishedAt \
  --jq '[.[] | select(.isPrerelease and (.tagName | test("^v[0-9]+\\.[0-9]+\\.[0-9]+-nightly\\.")))] | sort_by(.publishedAt) | reverse | .[0].tagName // ""')"
latest_source_sha=""

if [[ -n "$latest_nightly_tag" ]]; then
  latest_release_body="$("$gh_bin" release view "$latest_nightly_tag" --repo "$update_repository" --json body --jq .body)"
  latest_source_sha="$(printf '%s\n' "$latest_release_body" | sed -n 's/^Croki source commit: \([0-9a-f]\{40\}\)$/\1/p' | head -n 1)"
  if [[ "$latest_source_sha" == "$target_sha" ]]; then
    log "No changes on $branch since $latest_source_sha ($latest_nightly_tag); nothing to publish."
    exit 0
  fi
fi

if [[ "$dry_run" == "true" ]]; then
  log "Dry run passed for $source_repository@$branch ($target_sha)."
  log "Artifacts would publish to $update_repository because the latest source commit is ${latest_source_sha:-absent}."
  exit 0
fi

work_root="$(mktemp -d "$state_root/work.XXXXXX")"
mkdir -p "$work_root/checkout" "$work_root/artifacts"
"$git_bin" --git-dir="$mirror_dir" worktree add --detach "$work_root/checkout" "$target_sha"
cd "$work_root/checkout"

log "Installing the locked workspace dependencies."
"$vp_bin" install --frozen-lockfile "${install_workspace_filters[@]}"
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

if "$gh_bin" release view "$tag" --repo "$update_repository" >/dev/null 2>&1; then
  log "Release $tag already exists; skipping."
  exit 0
fi

log "Validating commit $target_sha before publication."
"$vp_bin" check
"$vp_bin" run "${release_workspace_filters[@]}" typecheck
"$vp_bin" run "${release_workspace_filters[@]}" test

"$node_bin" scripts/update-release-package-versions.ts "$version"

log "Building unsigned macOS arm64 artifacts for $tag."
CROKI_DESKTOP_UPDATE_REPOSITORY="$update_repository" \
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
  "$work_root/artifacts"/nightly-mac.yml
)
(( ${#assets[@]} > 0 )) || fail "The desktop build produced no publishable assets."
dmg_assets=("$work_root/artifacts"/*.dmg)
(( ${#dmg_assets[@]} > 0 )) || fail "The desktop build produced no DMG."
zip_assets=("$work_root/artifacts"/*.zip)
(( ${#zip_assets[@]} == 1 )) || fail "The desktop build must produce exactly one ZIP."
readonly manifest="$work_root/artifacts/nightly-mac.yml"
[[ -f "$manifest" ]] || fail "The desktop build did not produce nightly-mac.yml."
grep -Fq "version: $version" "$manifest" || fail "The updater manifest has the wrong version."
grep -Fq "path: $(basename "${zip_assets[0]}")" "$manifest" || fail "The updater manifest does not select the built ZIP."

update_config_path="$("$unzip_bin" -Z1 "${zip_assets[0]}" | sed -n '\#Contents/Resources/app-update.yml$#p' | head -n 1)"
[[ -n "$update_config_path" ]] || fail "The desktop ZIP has no bundled app-update.yml."
update_config="$("$unzip_bin" -p "${zip_assets[0]}" "$update_config_path")"
readonly update_owner="${update_repository%%/*}"
readonly update_repo="${update_repository#*/}"
[[ "$update_owner" != "$update_repository" && -n "$update_repo" ]] || fail "Invalid update repository: $update_repository"
printf '%s\n' "$update_config" | grep -Fq "provider: github" || fail "The bundled updater provider is not GitHub."
printf '%s\n' "$update_config" | grep -Fq "owner: $update_owner" || fail "The bundled updater owner is not $update_owner."
printf '%s\n' "$update_config" | grep -Fq "repo: $update_repo" || fail "The bundled updater repository is not $update_repo."
printf '%s\n' "$update_config" | grep -Fq "channel: nightly" || fail "The bundled updater channel is not nightly."

release_notes="Croki source commit: $target_sha

Unsigned macOS arm64 nightly built and validated locally from Croki's private source repository."
release_args=(
  release create "$tag"
  "${assets[@]}"
  --repo "$update_repository"
  --title "$release_name"
  --prerelease
  --latest=false
  --notes "$release_notes"
)

log "Publishing $tag to the public updater repository."
"$gh_bin" "${release_args[@]}"

published_tag="$("$gh_bin" release view "$tag" --repo "$update_repository" --json tagName --jq .tagName)"
published_assets="$("$gh_bin" release view "$tag" --repo "$update_repository" --json assets --jq '.assets | length')"
[[ "$published_tag" == "$tag" ]] || fail "GitHub did not return the expected release tag."
(( published_assets > 0 )) || fail "GitHub release $tag has no assets."

log "Published $tag with $published_assets assets from $target_sha."
