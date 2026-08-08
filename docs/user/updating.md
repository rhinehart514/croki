# Keeping Croki in Sync

The Croki web or desktop app and the server it connects to work best when they use the same
version. If they do not match, Croki shows a warning with the right update option for that server.

## Where to Find the Update

You may see the warning in either of these places:

- above the message box in the current conversation
- **Settings** → **Connections**, beside the affected connection

Dismissing the conversation warning only hides that reminder for those two versions. It does not
update the server, and the version difference remains visible in Connections.

## Before You Update

Let active agent work and terminal commands finish first. Updating restarts the server, so the
connection will disappear briefly and work that is still running may be interrupted.

The update does not remove saved threads, settings, or project files.

## Choose the Action You See

| Action                     | What to do                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Update server**          | Available for a Croki-owned Linux background-service package. Select the button and leave Croki open while it prepares, tests, restarts, and reconnects.                 |
| **Update the desktop app** | Open the Croki desktop app on the machine that runs the server and install the Croki app update there. Reopen it if needed.                                              |
| **Copy update command**    | Available only when the server advertises a Croki-owned package command. Stop the current Croki server and relaunch it with the exact copied command and normal options. |

The available action depends on how that server was started. Croki does not update connected
servers silently in the background.

Croki never offers inherited T3 Code package, server, desktop, hosted web, or
release destinations as Croki update paths. Package-backed server updates stay
unavailable until the exact `croki-server` version is published to a
Croki-owned registry. GitHub-only desktop releases update their bundled server
with the Croki app and do not imply that a remote package exists.

An older launcher may require a one-time local update on the server machine to
gain rollback support. Use only the Croki-owned command shown by the installed
Croki client; do not substitute an inherited `npx t3@...` command.

After selecting **Update**, the notice becomes a live status line: **Downloading…** while the new
version is fetched and verified, then **Restarting…** while the server restarts into it. The same
status appears in the conversation and in Connections, so navigating between them does not lose the
update. A failure remains visible with its error and an option to retry.

**Copy update command** is shown only when Croki has an exact owned package for
the client version. Add whatever startup options you normally use.

If the server runs as a Croki background service, use the exact Croki-owned
command shown by the client. Conceptually it pins the same version:

```sh
croki-server@<client-version> service update
```

The UI must not show this path unless that exact package was published and the
server advertises support for it.

See [Running Croki in the Background](./background-service.md) for install, status, and removal
commands.

## After the Update

Keep the web or desktop app open while the server restarts. The update completes only after the
service launcher reports that exact update committed and the replacement server is ready to accept
commands. A rollback is reported immediately instead of waiting for a generic reconnect timeout.

If a step fails:

1. Retry the offered action once.
2. Make sure you updated the machine named in the warning, not only the device you are using.
3. For a source-built server, check out the matching Croki version on the server
   machine and relaunch it with the same startup options. Use a copied package
   command only when Croki actually offers one.

For remote connection setup and access troubleshooting, see [Remote Access](./remote-access.md).
