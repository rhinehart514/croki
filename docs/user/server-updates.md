# Keeping Croki in Sync

The Croki web or desktop app and the server it connects to work best when they use the same
version. If they do not match, Croki shows a warning with the right update option for that server.

> [!WARNING]
> Croki 0.4.1 has no Croki-owned CLI release channel. Automatic self-update and
> copied `npx t3@<version>` commands still target the inherited upstream npm
> package. Use desktop-managed local backends or rebuild and restart the same
> Croki source revision until the CLI is renamed and published by Croki.

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

| Action                     | What to do                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Update server**          | Select the button and leave Croki open. It prepares the matching version, restarts the server, and reconnects automatically. This can take several minutes.               |
| **Update the desktop app** | Open the Croki desktop app on the machine that runs the server and install the app update there. Reopen it if needed.                                                     |
| **Copy update command**    | Copy the command, open a terminal on the server machine, stop the current Croki server, and relaunch it with the copied command and any startup options you normally use. |

The available action depends on how that server was started. Croki does not update connected
servers silently in the background.

The inherited background-service update command is retained for reference:

```sh
npx t3@latest service update
```

See [Running Croki in the Background](./background-service.md) for install, status, and removal
commands.

## After the Update

Keep the web or desktop app open while the server restarts. When it reconnects with the matching
version, the warning and update action disappear.

If the client reports a timeout, the server may still be finishing the update. Wait a minute, then
reconnect or open **Settings** → **Connections** again. If the warning remains:

1. Retry the offered action once.
2. Make sure you updated the machine named in the warning, not only the device you are using.
3. For a command-line server, relaunch it with `npx t3@<client-version>`, replacing
   `<client-version>` with the client version shown in the warning.

For remote connection setup and access troubleshooting, see [Remote Access](./remote-access.md).
