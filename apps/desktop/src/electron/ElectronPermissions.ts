import type * as Electron from "electron";
import { session } from "electron";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

/** Electron's permission name for getUserMedia microphone/camera requests. */
export const DESKTOP_MEDIA_PERMISSION = "media" as const;
export const DESKTOP_CLIPBOARD_WRITE_PERMISSION = "clipboard-sanitized-write" as const;

type PermissionRequestHandler = NonNullable<
  Parameters<Electron.Session["setPermissionRequestHandler"]>[0]
>;
type PermissionCheckHandler = NonNullable<
  Parameters<Electron.Session["setPermissionCheckHandler"]>[0]
>;

type MicrophoneRequestDetails = Pick<
  Electron.MediaAccessPermissionRequest,
  "isMainFrame" | "requestingUrl" | "mediaTypes" | "securityOrigin"
>;

type MicrophoneCheckDetails = Pick<
  Electron.PermissionCheckHandlerHandlerDetails,
  "isMainFrame" | "mediaType" | "requestingUrl" | "securityOrigin"
>;

interface ParsedOrigin {
  readonly protocol: string;
  readonly host: string;
}

function parseOrigin(value: string): ParsedOrigin | null {
  try {
    const url = new URL(value);
    if (url.username.length > 0 || url.password.length > 0 || url.host.length === 0) {
      return null;
    }
    return {
      protocol: url.protocol.toLowerCase(),
      host: url.host.toLowerCase(),
    };
  } catch {
    return null;
  }
}

/**
 * Compares only the scheme + host/port origin. Paths and query strings are
 * intentionally ignored, while credentials and malformed URLs are rejected.
 */
export function isTrustedDesktopOrigin(candidate: string, trustedOrigin: string): boolean {
  const candidateOrigin = parseOrigin(candidate);
  const expectedOrigin = parseOrigin(trustedOrigin);
  return (
    candidateOrigin !== null &&
    expectedOrigin !== null &&
    candidateOrigin.protocol === expectedOrigin.protocol &&
    candidateOrigin.host === expectedOrigin.host
  );
}

/**
 * Keep the grant to an audio-only request from the Croki top-level page. A
 * mixed camera + microphone request is denied so this slice never grants
 * camera access by accident.
 */
export function canGrantDesktopMicrophoneRequest(
  details: MicrophoneRequestDetails,
  trustedOrigin: string,
): boolean {
  return (
    details.isMainFrame &&
    details.mediaTypes?.length === 1 &&
    details.mediaTypes[0] === "audio" &&
    isTrustedDesktopOrigin(details.requestingUrl, trustedOrigin) &&
    (details.securityOrigin === undefined ||
      isTrustedDesktopOrigin(details.securityOrigin, trustedOrigin))
  );
}

/**
 * Permission checks run before request handlers and carry a single media type.
 * Keep the origin and top-level-frame checks here as well so a prior decision
 * cannot bypass the request boundary.
 */
export function canCheckDesktopMicrophonePermission(
  webContents: Electron.WebContents | null,
  requestingOrigin: string,
  details: MicrophoneCheckDetails,
  trustedOrigin: string,
): boolean {
  return (
    webContents !== null &&
    details.isMainFrame &&
    details.mediaType === "audio" &&
    isTrustedDesktopOrigin(requestingOrigin, trustedOrigin) &&
    (details.requestingUrl === undefined ||
      isTrustedDesktopOrigin(details.requestingUrl, trustedOrigin)) &&
    (details.securityOrigin === undefined ||
      isTrustedDesktopOrigin(details.securityOrigin, trustedOrigin))
  );
}

export interface DesktopPermissionHandlers {
  readonly request: PermissionRequestHandler;
  readonly check: PermissionCheckHandler;
}

export function makeDesktopPermissionHandlers(trustedOrigin: string): DesktopPermissionHandlers {
  const request: PermissionRequestHandler = (_webContents, permission, callback, details) => {
    const mediaDetails = details as Electron.MediaAccessPermissionRequest;
    callback(
      (permission === DESKTOP_MEDIA_PERMISSION &&
        canGrantDesktopMicrophoneRequest(mediaDetails, trustedOrigin)) ||
        (permission === DESKTOP_CLIPBOARD_WRITE_PERMISSION &&
          mediaDetails.isMainFrame &&
          isTrustedDesktopOrigin(mediaDetails.requestingUrl, trustedOrigin)),
    );
  };

  const check: PermissionCheckHandler = (webContents, permission, requestingOrigin, details) => {
    if (permission === DESKTOP_CLIPBOARD_WRITE_PERMISSION) {
      return (
        webContents !== null &&
        details.isMainFrame &&
        isTrustedDesktopOrigin(requestingOrigin, trustedOrigin) &&
        (details.requestingUrl === undefined ||
          isTrustedDesktopOrigin(details.requestingUrl, trustedOrigin))
      );
    }
    if (permission !== DESKTOP_MEDIA_PERMISSION) return false;
    return canCheckDesktopMicrophonePermission(
      webContents,
      requestingOrigin,
      details,
      trustedOrigin,
    );
  };

  return { request, check };
}

export class ElectronPermissions extends Context.Service<
  ElectronPermissions,
  {
    /** Installs handlers on the default session only; preview partitions are separate. */
    readonly configure: (trustedOrigin: string) => Effect.Effect<void>;
  }
>()("@croki/desktop/electron/ElectronPermissions") {}

export const make = ElectronPermissions.of({
  configure: Effect.fn("desktop.electron.permissions.configure")(function* (trustedOrigin) {
    const handlers = makeDesktopPermissionHandlers(trustedOrigin);
    yield* Effect.sync(() => {
      session.defaultSession.setPermissionRequestHandler(handlers.request);
      session.defaultSession.setPermissionCheckHandler(handlers.check);
    });
  }),
});

export const layer = Layer.succeed(ElectronPermissions, make);
