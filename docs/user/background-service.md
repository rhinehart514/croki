# Running Croki in the Background

On a Linux host, Croki can run as a background service for your user. It starts when the machine
boots and keeps running after you log out.

> [!WARNING]
> Croki does not currently publish its own CLI package. The `npx t3` commands
> below resolve the inherited upstream package and are retained as architecture
> reference, not as Croki installation instructions. For a source checkout,
> build Croki and run `node apps/server/dist/bin.mjs service ...` instead.

## Manage the Service

After Croki owns and publishes its CLI package, install it with the matching
Croki release command. The current inherited command shape is:

```sh
npx t3@latest service install
```

Check whether it is installed:

```sh
npx t3@latest service status
```

Update or repair it:

```sh
npx t3@latest service update
```

Stop it and remove it from startup:

```sh
npx t3@latest service uninstall
```

Updating restarts Croki briefly. Let active agent work and terminal commands finish first.

## Using It with Croki Connect

Croki Connect may offer to install the service during setup so the host stays reachable after you log
out. This is only an onboarding shortcut: the service and Croki Connect are managed separately.

Signing out of Croki Connect does not remove the service. Use `t3 service uninstall` when you no longer
want Croki to start in the background.

The background service currently requires Linux with systemd.
