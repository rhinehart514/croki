# Install Croki

Croki is a web, desktop, and mobile environment for running coding agents on your machine.

## Requirements

Node.js `^24.13.1` on the machine that runs the Croki server from source.

At least one provider CLI, installed and authenticated. See [Providers](#providers) below.

## Desktop App

Download the latest release from
[Croki GitHub Releases](https://github.com/rhinehart514/croki/releases/latest).

The macOS release is an Apple Silicon DMG. Open it and drag Croki into
Applications. The current build is unsigned, so macOS may require approval in
**System Settings → Privacy & Security** the first time it opens.

Pushes to `croki/main` also produce an unsigned Windows x64 installer artifact
in the repository's Actions run. Windows may show a SmartScreen warning.

Croki's package-registry, hosted web, signing, and production mobile release
destinations remain disabled until each has Croki-owned credentials. Use the
Croki GitHub release or run Croki from source.

## Run From Source

```sh
vp i
vp run dev
```

## Providers

Croki drives provider CLIs; it does not ship them. Install the CLI for each provider you want
to use, then authenticate it.

| Provider   | CLI                                                   | Default binary | Log in with           |
| ---------- | ----------------------------------------------------- | -------------- | --------------------- |
| Codex      | [Codex CLI](https://developers.openai.com/codex/cli)  | `codex`        | `codex login`         |
| Claude     | [Claude Code](https://claude.com/product/claude-code) | `claude`       | `claude auth login`   |
| Cursor     | [Cursor CLI](https://cursor.com/cli)                  | `cursor-agent` | `agent login`         |
| Grok Build | [Grok Build CLI](https://x.ai/cli)                    | `grok`         | `grok login`          |
| OpenCode   | [OpenCode](https://opencode.ai)                       | `opencode`     | `opencode auth login` |

Codex and Claude are on by default. Cursor, Grok Build, and OpenCode are off by default; turn
them on in **Settings** → the provider's card when you want to use them.

Cursor is the one to watch: install Cursor CLI, which provides the `cursor-agent` binary that
Croki looks for, but authenticate with `agent login`, not `cursor-agent login`.

Run the login command on the machine running the Croki server, not on the device you browse
from.

### Binary Discovery

Each provider CLI must be on the server's `PATH`, or have an explicit binary path set in
**Settings** → the provider instance → **Binary path**. Use the explicit path when a version
manager or a non-standard install location keeps the CLI off the `PATH` of the shell that
started Croki.

### When Auth Is Needed

Provider auth is required before you start a session with that provider, not before you start
Croki. You can install Croki, open it, and add providers afterwards. A provider that is not
authenticated shows its status in **Settings** and fails at session start with the login command
to run.

For multi-account setups, see [Codex](./providers-codex.md) and [Claude](./providers-claude.md).

## Next Steps

- [Permission modes](./permission-modes.md): how much Croki asks before acting
- [Remote access](./remote-access.md): connect from a phone, tablet, or another desktop
- [Keeping Croki in sync](./updating.md): client and server version skew
- [Running in the background](./background-service.md): Linux background service
