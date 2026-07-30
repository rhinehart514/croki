# Croki

Croki is a coding environment for founders building products with Codex and
other coding agents. Threads are the durable spine. Canvas holds optional,
repository-owned product truth that survives individual conversations.

See [Croki architecture](./docs/croki.md) for the product model, branch contract,
context format, and recovery record.

## Installation

> [!WARNING]
> Croki currently supports Codex, Claude, Cursor, Grok Build, and OpenCode.
> Install and authenticate at least one provider before use:
>
> - Codex: install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`
> - Claude: install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`
> - Cursor: install [Cursor CLI](https://cursor.com/cli) and run `cursor-agent login`
> - Grok Build: install [Grok Build CLI](https://x.ai/cli) and run `grok login`
> - OpenCode: install [OpenCode](https://opencode.ai) and run `opencode auth login`

### Windows

Croki has a dedicated Windows x64 installer build:

1. Open **Actions → Build Croki for Windows** in this repository.
2. Choose **Run workflow**.
3. Download the `croki-windows-x64-<version>` artifact.
4. Extract it and run the `Croki-<version>-x64.exe` installer.

Manual workflow builds are unsigned until Croki's Windows signing credentials
are configured, so Windows may show a SmartScreen warning.

## Documentation

- [Getting started](./docs/getting-started/quick-start.md)
- [Remote access](./docs/user/remote-access.md)
- [Keeping Croki in sync](./docs/user/server-updates.md)
- [Architecture overview](./docs/architecture/overview.md)
- [Provider guides](./docs/providers/codex.md)
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

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening an issue or PR.
