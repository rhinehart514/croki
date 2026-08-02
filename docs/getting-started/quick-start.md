# Quick start

## Prerequisites

- Node.js `^24.13.1`
- Vite+ (`vp`)
- At least one installed and authenticated provider

Install dependencies from the repository root:

```bash
vp i
```

## Development

```bash
# Web and server with hot reload
vp run dev

# Desktop development
vp run dev:desktop

# Desktop development on an isolated port set
T3CODE_DEV_INSTANCE=feature-xyz vp run dev:desktop

# Explicit isolated Croki state
vp run dev --home-dir /tmp/croki-dev
```

The server prints a one-time pairing URL. Open that URL for the first browser
session and treat it like a password. Web development does not open a browser
automatically.

Development commands use gitignored `.t3` state in linked worktrees and
`~/.t3/dev` from the main checkout unless `--home-dir` is supplied.

## Build and run

```bash
# Build applications and packages
vp run build

# Run the built server and web app
vp run start

# Build a shareable macOS .dmg (arm64 by default)
vp run dist:desktop:dmg
```

Production Croki publishing is currently disabled. Local builds and the
Windows artifact workflow are available, but `npx t3` resolves the inherited
upstream CLI until Croki owns and publishes a separate package.

See [Scripts](../reference/scripts.md) for isolated state, ports, desktop
packaging, and the complete command list.
