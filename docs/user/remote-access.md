# Remote Access

Use this when you want to connect to a Croki server from another device such as a phone, tablet, or separate desktop app.

> Croki's package-registry CLI, hosted web app, and managed Connect relay are
> disabled until each destination is Croki-owned. Do not use inherited
> `npx t3`, `app.t3.codes`, or T3 Connect endpoints as Croki release paths. The
> desktop connection flow and source development server remain available.

## Quick Pairing for a Running Server

If a source development server is already running, mint a fresh pairing token without restarting it:

```bash
node apps/server/src/bin.ts pair
```

The command finds the current worktree's development server, issues a one-time
pairing token, and prints a pairing URL.

If the server is only bound to loopback, the printed URL is not reachable from
another device. Enable Network access in the desktop app, or start the source
development server with `vp run dev --share`, then use the pairing URL it
prints. Do not open a pairing URL before handing it to its intended user; the
token is single-use.

## Recommended Setup

Use a trusted private network that meshes your devices together, such as a tailnet.

That gives you:

- a stable address to connect to
- transport security at the network layer
- less exposure than opening the server to the public internet

## Enabling Network Access

There are two enabled Croki paths to reach your server from another device:
expose the desktop app's backend or have the desktop app launch Croki over SSH.
The inherited package CLI and hosted web flows described by upstream internals
are not Croki release paths.

### Option 1: Desktop App

If you are already running the desktop app and want to make it reachable from other devices:

1. Open **Settings** → **Connections**.
2. Under **This environment**, toggle **Network access** on. This will restart the app and run the backend on all network interfaces.
3. The settings panel will show the default reachable endpoint, with a `+N` control when more endpoints are available. Expand it to inspect alternatives such as loopback, LAN, private-network, or HTTPS endpoints.
4. Use **Create Link** to generate a pairing link you can share with another device.

The default endpoint controls the QR code and primary copy action for pairing links. You can change it from the expanded endpoint list. The preference is stored by endpoint type, so choosing the local LAN endpoint survives normal IP address changes when you move between networks.

When no user default is saved, the app uses the built-in LAN endpoint for pairing links when
available. You can set another endpoint as the default from the expanded endpoint list.

- HTTPS/WSS-compatible endpoints work from Croki clients that can reach them,
  but are not made the default automatically.
- Non-loopback HTTP endpoints are useful for direct LAN pairing.
- Loopback-only endpoints are not useful for another device unless that device is the same machine.

If the copied link points directly at `http://192.168.x.y:3773`, open it from a
Croki client that can reach that LAN address.

In the mobile app's **Add Environment** form, a numeric IP address without a scheme uses HTTP. Include `https://` explicitly when the backend is served over HTTPS.

### Tailscale Endpoints

When the desktop app can detect Tailscale, it adds Tailnet endpoints to the reachable endpoint list.

Depending on your Tailscale setup, this may include:

- the machine's `100.x.y.z` Tailnet IP
- a MagicDNS name
- an HTTPS MagicDNS endpoint when Tailscale Serve is configured for this backend

The Tailscale HTTPS endpoint uses the clean MagicDNS URL, such as
`https://machine.tailnet.ts.net/`, and is off until you opt in. Turn on **Enable Tailscale HTTPS**
on the **Tailscale HTTPS** row in **Settings** → **Connections**. The desktop app restarts the
backend and asks
Tailscale Serve to proxy HTTPS traffic to the local backend. Turn the same switch off to stop it.

The Tailscale support is an endpoint provider add-on. The core remote model still works without Tailscale: LAN HTTP endpoints, custom HTTPS endpoints, future tunnels, and SSH-launched environments all use the same saved environment and pairing flow.

A plain `http://100.x.y.z:3773` endpoint can work from a desktop client or a
browser page served over HTTP. Croki does not currently publish a hosted HTTPS
web client.

### Option 2: Desktop-Managed SSH Launch

Use this when you want the desktop app to start or reuse Croki on another machine over SSH.

1. Open **Settings** → **Connections**.
2. Under **Remote Environments**, choose **Add environment**.
3. Select the SSH launch flow.
4. Enter the SSH target, such as `user@example.com`.
5. Confirm the launch. The desktop app probes the host, starts or reuses a remote T3 server, opens a local port forward, and saves the environment.

After setup, the renderer connects to a local forwarded HTTP/WebSocket endpoint. The remote host still owns the actual T3 server, projects, files, git state, terminals, and provider sessions.

SSH launch is a desktop feature because it needs local process and SSH access. Once the environment is paired and saved, it uses the same environment list and connection model as direct LAN, Tailscale, HTTPS, or future tunnel-backed environments.

#### SSH Launch Troubleshooting

The desktop SSH launcher connects with a non-interactive `sh` session, writes a small launcher script under `~/.t3/ssh-launch/<host-key>/`, starts or reuses a remote T3 server, and forwards the remote loopback port back to your desktop.

The remote host must have a compatible Node.js runtime. Croki uses the server package's `engines.node` requirement:

```text
^22.16 || ^23.11 || >=24.10
```

During SSH launch, Croki first checks whether `node` is on `PATH`. If it is missing, the launcher
looks in the usual install directories and tries to activate a version manager if it finds one
(Volta, asdf, mise, fnm, nodenv, nvm). That covers most setups, but a version manager that only
initializes from an interactive shell profile will not be picked up.

If launch fails with `node: command not found`, a port-scan failure, or a message that the remote Node version does not satisfy the required range, SSH into the host and check the same non-interactive shell path Croki uses:

```bash
ssh user@example.com 'sh -lc "command -v node && node --version"'
```

If that does not print a compatible Node version, configure your version manager for non-interactive shells or install a compatible Node binary in one of the searched locations. For example, with nvm you may need a default alias:

```bash
nvm alias default 24
```

With mise, asdf, fnm, or nodenv, make sure the tool's shim directory is installed and resolves to a Node version satisfying the range above without an interactive shell.

If reconnecting after an app update fails, retry the SSH launch once. The launcher now compares its generated runner script, stops stale launcher-managed remote servers, clears the SSH launch PID/port state, and starts a fresh remote server. You should not normally need to delete `~/.t3/ssh-launch` or kill `t3` processes manually.

## Updating a Remote Server

When the Croki web or desktop app and a remote server use different versions, a warning appears in
the conversation and in **Settings** → **Connections**. Follow the action shown there: Croki may
be able to update and reconnect the server for you, or it may ask you to update the desktop app or
run a copied command on the server machine.

Finish active work before updating because the server restarts briefly. For step-by-step guidance,
see [Keeping Croki in Sync](./updating.md).

On a Linux host, you can keep the server running after logout and manage it independently of the
connection method. See [Running Croki in the Background](./background-service.md).

## How Pairing Works

The remote device does not need a long-lived secret up front.

Instead:

1. The Croki server issues a one-time owner pairing token.
2. The remote device exchanges that token with the server.
3. The server creates an authenticated session for that device.

After pairing, future access is session-based. You do not need to keep reusing the original token unless you are pairing a new device.

## Managing Access Later

Use the source CLI to manage access after the initial pairing flow:

```sh
node apps/server/src/bin.ts auth --help
```

Typical uses:

- issue additional pairing credentials
- inspect active sessions
- revoke old pairing links or sessions

Use the nested subcommand help pages for the full reference.

## Security Notes

- Treat pairing URLs and pairing tokens like passwords.
- Prefer binding `--host` to a trusted private address, such as a Tailnet IP, instead of exposing the server broadly.
- Anyone with a valid pairing credential can create a session until that credential expires or is revoked.
- Pairing links keep the credential in the URL hash, but it can still be exposed through browser history, screenshots, logs, or copy/paste.
- Use the source authentication CLI to revoke credentials or sessions you no longer trust.
