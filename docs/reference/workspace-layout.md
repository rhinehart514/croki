# Workspace layout

- `/apps/server`: Croki CLI and local HTTP/WebSocket server. Owns environments,
  orchestration, provider adapters, terminals, Git, checkpoints, remote access,
  and built web assets.
- `/apps/web`: React + Vite UI. Owns Threads, provider/model selection, terminal,
  preview, files, diff, plans, Git, settings, and the Croki Canvas.
- `/apps/desktop`: Electron shell. Spawns a desktop-scoped `t3` backend process and loads the shared web app.
- `/apps/mobile`: React Native client for environments, Threads, terminal,
  Review, settings, and read-only Canvas presentation.
- `/apps/swift-ios`: Experimental native SwiftUI client for iPhone and iPad. It
  speaks the same Croki server contracts and installs beside the React Native app.
- `/packages/contracts`: Shared Effect Schema contracts for environment,
  orchestration, provider, terminal, preview, Git, and client transport state.
- `/packages/shared`: Shared runtime and Canvas utilities consumed across apps.
  It uses explicit subpath exports rather than a barrel index.

The `t3`, `.t3`, `CROKI_*`, and `@croki/*` names are preserved compatibility
identifiers. Visible product branding is Croki.
