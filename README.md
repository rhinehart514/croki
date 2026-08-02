# Croki

Croki is an agentic development environment (ADE) for founders building real
products with coding agents. It is a working daily development environment, not
a standalone agent runtime or a replacement for the provider behind the work.

Croki is a narrow product overlay on T3 Code. It preserves native threads,
providers, worktrees, checkpoints, recovery, Git, terminal, preview, files,
plans, project scripts, desktop, web, and mobile clients. Canvas adds optional,
repository-owned product understanding that survives individual conversations.

The primary product rule is **native providers by default**. Croki-specific
personas, planning loops, delegation policies, and behavioral prompts belong in
explicit named harnesses that are off by default, visible, scoped, and
reversible. The web composer now defaults to Native and offers GTM v1 for one
turn. Approved Canvas context attaches independently of panel visibility, while
proposals remain excluded. See [current project state](./docs/project/current-state.md)
for the remaining provider and release gaps.

See [Croki architecture](./docs/croki.md) for the product model, branch contract,
context format, and recovery record.

## Installation

> [!WARNING]
> Croki currently supports Codex, Claude, Cursor, Grok Build, OpenCode, and
> OpenClaw. Runtime readiness still depends on the corresponding local CLI,
> account, and, for OpenClaw, Gateway and agent configuration.
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - Cursor: install [Cursor CLI](https://cursor.com/cli) and run `cursor-agent login`
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

Manual workflow builds are unsigned until Croki's Windows signing credentials
are configured, so Windows may show a SmartScreen warning.

## Documentation

- [Current project state](./docs/project/current-state.md)
- [Getting started](./docs/getting-started/quick-start.md)
- [Remote access](./docs/user/remote-access.md)
- [Keeping Croki in sync](./docs/user/server-updates.md)
- [Architecture overview](./docs/architecture/overview.md)
- [Provider architecture](./docs/architecture/providers.md)
- [Provider guides](./docs/README.md#providers)
- [Operations](./docs/operations/ci.md)
- [Reference](./docs/reference/encyclopedia.md)

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

### Run Croki

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
