#!/bin/bash

set -Eeuo pipefail

readonly script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly release_script="$script_dir/run-local-nightly-release.sh"
readonly label="com.croki.nightly-release"
readonly launch_agents_dir="$HOME/Library/LaunchAgents"
readonly plist_path="$launch_agents_dir/$label.plist"
readonly state_root="$HOME/Library/Application Support/Croki Nightly Release"
readonly log_dir="$HOME/Library/Logs/Croki"
readonly uid="$(id -u)"

[[ -x "$release_script" ]] || {
  printf 'Release script is missing or not executable: %s\n' "$release_script" >&2
  exit 1
}

mkdir -p "$launch_agents_dir" "$state_root" "$log_dir"

temp_plist="$(mktemp "$state_root/launch-agent.XXXXXX")"
trap 'rm -f "$temp_plist"' EXIT

cat > "$temp_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$release_script</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$state_root</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$HOME/.vite-plus/bin:$HOME/.cargo/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>2</integer>
    <key>Minute</key>
    <integer>15</integer>
  </dict>
  <key>ProcessType</key>
  <string>Background</string>
  <key>LowPriorityIO</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$log_dir/nightly-release.log</string>
  <key>StandardErrorPath</key>
  <string>$log_dir/nightly-release.error.log</string>
</dict>
</plist>
PLIST

plutil -lint "$temp_plist" >/dev/null
install -m 0644 "$temp_plist" "$plist_path"

launchctl bootout "gui/$uid/$label" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$uid" "$plist_path"

printf 'Installed %s. Croki nightlies will run daily at 02:15 local time.\n' "$plist_path"
printf 'Logs: %s/nightly-release.log and nightly-release.error.log\n' "$log_dir"
