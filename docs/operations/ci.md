# CI quality gates

- `.github/workflows/ci.yml` runs on pull requests and pushes to `main` and
  `croki/main`.
- The Croki overlay job validates brand policy, Canvas boundaries, migration
  records, and focused Croki tests. CI summaries and artifacts may contain only
  content-free Canvas receipts.
- General jobs run Vite+ checks, strict typechecking, desktop build verification,
  tests, Rust resource-monitor checks, mobile native static analysis, and the
  release smoke path.
- `.github/workflows/build-windows-installer.yml` builds an unsigned Windows x64
  installer artifact on pushes to `croki/main` and manual dispatches. It is not
  a production update channel.
- Production release, relay, and mobile workflows validate Croki-owned
  destinations and fail closed while ownership is incomplete.

See [Release ownership and enablement](./release.md).
