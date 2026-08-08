# Running Croki in the Background

Croki contains the upstream Linux systemd launcher and rollback design, but the
user-facing service install and update path is intentionally unavailable until
an exact `croki-server` package is published to a Croki-owned registry.

Do not install or update Croki with inherited `npx t3@...` commands. They target
T3 Code's package and release destinations, not Croki.

When Croki-owned packaging is enabled, the service will:

- run for the current Linux user and survive logout;
- keep the launcher stable while exact server versions are staged separately;
- snapshot the database before a candidate with migrations starts;
- return to the previous server and database when the candidate cannot prepare;
- expose install, status, update, and uninstall through the Croki-owned CLI.

Updating restarts Croki briefly. Active agent work and terminal commands must
finish before a service update begins.

The background service requires Linux with systemd. Connect/relay onboarding is
managed independently and must also remain disabled until its endpoints and
credentials are Croki-owned.
