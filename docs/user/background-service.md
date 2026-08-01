# Running Croki in the Background

On a Linux host, Croki can run as a background service for your user. It starts when the machine
boots and keeps running after you log out.

## Manage the Service

Install it with the latest Croki release:

```sh
npx croki-server@latest service install
```

Check whether it is installed:

```sh
npx croki-server@latest service status
```

Update or repair it:

```sh
npx croki-server@latest service update
```

Stop it and remove it from startup:

```sh
npx croki-server@latest service uninstall
```

Updating restarts Croki briefly. Let active agent work and terminal commands finish first.

The systemd unit runs a small stable launcher. Exact Croki versions are installed separately, so
a failed remote candidate can return to the previous version without rewriting the unit. Releases
that change the database must be installed with the local `service update` command above.

## Using It with Croki Connect

Croki Connect may offer to install the service during setup so the host stays reachable after you log
out. This is only an onboarding shortcut: the service and Croki Connect are managed separately.

Signing out of Croki Connect does not remove the service. Use `croki-server service uninstall` when you no longer
want Croki to start in the background.

The background service currently requires Linux with systemd.
