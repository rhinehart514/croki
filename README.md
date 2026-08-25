# Croki

Croki is an agentic development environment (ADE) for founders building real
products with coding agents. It is a working daily development environment, not
a standalone agent runtime or a replacement for the provider behind the work.

Croki is a narrow product overlay on the underlying development environment. It
preserves native threads, providers, worktrees, checkpoints, recovery, Git,
terminal, preview, files, plans, project scripts, desktop, web, and mobile
clients.

Croki is a harness host, not a harness. A default turn adds no Croki-authored
behavioral instruction or hidden application, sibling-Thread, or project
context. Anything that can affect the selected model is applied by the user,
visible before send, scoped, recorded with the turn, removable, and reversible.
Croki makes provider-native project instructions, skills, plugins, tools, and
explicit context attachments easy to discover and apply without translating
them into a hidden Croki prompt layer. See
[current project state](./docs/project/current-state.md) for the remaining
provider and release gaps.

See [Croki architecture](./docs/croki.md) for the product model, branch contract,
application brief, and recovery record.

## Installation

> [!WARNING]
> Croki currently supports Codex, Claude, Cursor, Grok Build, OpenCode, and
> OpenClaw. Runtime readiness still depends on the corresponding local CLI,
> account, and, for OpenClaw, Gateway and agent configuration.
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - Cursor: install [Cursor CLI](https://cursor.com/cli) and run `agent login`
> - Grok Build: install [Grok Build CLI](https://x.ai/cli) and run `grok login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`
> - OpenClaw: install OpenClaw, start its Gateway, and configure the selected agent

### macOS

Download the Apple Silicon DMG from the
[latest release](https://github.com/rhinehart514/croki/releases/latest), open it,
and drag Croki into Applications.

The current macOS build is unsigned, so macOS may require approval in
**System Settings → Privacy & Security** on first launch.

### Windows

Every push to `croki/main` produces a Windows x64 installer:

1. Open **Actions → Build Croki for Windows** in this repository.
2. Open the latest successful run.
3. Download the `croki-windows-x64-<version>` artifact.
4. Extract it and run the `Croki-<version>-x64.exe` installer.

Install the latest version of the desktop app from [GitHub Releases](https://github.com/pingdotgg/t3code/releases), or from your favorite package registry:

#### Windows (`winget`)

```bash
winget install T3Tools.T3Code
```

#### macOS (Homebrew)

```bash
brew install --cask t3-code
```

#### Arch Linux (AUR)

Stable:

```bash
yay -S t3code-bin
```

Nightly:

```bash
yay -S t3code-nightly-bin
```

The AUR packaging is maintained in this repository under [`packaging/aur`](./packaging/aur).

## Some notes

We are very very early in this project. Expect bugs.

We are (mostly) not accepting contributions yet. Small fixes may be considered. Big features will not be.

## Documentation

- [Install and first run](./docs/user/install.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Keyboard shortcuts](./docs/user/keybindings.md)
- [Customize a project icon](./docs/user/project-settings.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Keeping app and server in sync](./docs/user/updating.md)
- [Source control integrations](./docs/user/source-control.md)
- Multiple accounts: [Codex](./docs/user/providers-codex.md) · [Claude](./docs/user/providers-claude.md)
- Linux: [run Croki as a background service](./docs/user/background-service.md)
- [Current project state](./docs/project/current-state.md)

Building from source? Start at
[docs/internals/overview.md](./docs/internals/overview.md).

## Development

### Install `vp`

Croki uses Vite+, so install the global `vp` command-line tool.

#### macOS / Linux

```bash
curl -fsSL https://vite.plus | bash
```

#### Windows

```bash
irm https://vite.plus/ps1 | iex
```

### Install dependencies

```bash
vp i
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before reporting a bug or opening a PR.

Have a feature request? Start an [Ideas discussion](https://github.com/pingdotgg/t3code/discussions/categories/ideas).

```bash
# Web development
vp run dev

# Desktop development
vp run dev:desktop
```

Croki requires Node.js `^24.13.1` at the repository root and pins
`pnpm@11.10.0`. Use the one-time pairing URL printed by the development server;
do not share it.

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.
