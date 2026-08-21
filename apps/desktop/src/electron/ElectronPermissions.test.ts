import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type * as Electron from "electron";
import { beforeEach, vi } from "vite-plus/test";

const {
  checkHandlerRef,
  requestHandlerRef,
  setPermissionCheckHandler,
  setPermissionRequestHandler,
} = vi.hoisted(() => ({
  checkHandlerRef: { current: undefined as unknown },
  requestHandlerRef: { current: undefined as unknown },
  setPermissionCheckHandler: vi.fn((handler: unknown) => {
    checkHandlerRef.current = handler;
  }),
  setPermissionRequestHandler: vi.fn((handler: unknown) => {
    requestHandlerRef.current = handler;
  }),
}));

vi.mock("electron", () => ({
  session: {
    defaultSession: {
      setPermissionCheckHandler,
      setPermissionRequestHandler,
    },
  },
}));

import {
  canCheckDesktopMicrophonePermission,
  canGrantDesktopMicrophoneRequest,
  make,
  makeDesktopPermissionHandlers,
} from "./ElectronPermissions.ts";

const TRUSTED_ORIGIN = "croki://app";

describe("ElectronPermissions", () => {
  beforeEach(() => {
    checkHandlerRef.current = undefined;
    requestHandlerRef.current = undefined;
    setPermissionCheckHandler.mockClear();
    setPermissionRequestHandler.mockClear();
  });

  it("recognizes the trusted custom-scheme origin without trusting paths or credentials", () => {
    assert.isTrue(
      canGrantDesktopMicrophoneRequest(
        {
          isMainFrame: true,
          requestingUrl: "croki://app/thread/123?tab=voice",
          securityOrigin: "croki://app",
          mediaTypes: ["audio"],
        },
        TRUSTED_ORIGIN,
      ),
    );
    assert.isFalse(
      canGrantDesktopMicrophoneRequest(
        {
          isMainFrame: true,
          requestingUrl: "croki://app:444/thread/123",
          securityOrigin: "croki://app:444",
          mediaTypes: ["audio"],
        },
        TRUSTED_ORIGIN,
      ),
    );
    assert.isFalse(
      canGrantDesktopMicrophoneRequest(
        {
          isMainFrame: true,
          requestingUrl: "croki://app@evil.example/thread/123",
          securityOrigin: "croki://app@evil.example",
          mediaTypes: ["audio"],
        },
        TRUSTED_ORIGIN,
      ),
    );
  });

  it("only grants audio from a trusted top-level page", () => {
    const request = {
      isMainFrame: true,
      requestingUrl: TRUSTED_ORIGIN,
      securityOrigin: TRUSTED_ORIGIN,
      mediaTypes: ["audio"] as Array<"audio" | "video">,
    };
    assert.isTrue(canGrantDesktopMicrophoneRequest(request, TRUSTED_ORIGIN));
    assert.isFalse(
      canGrantDesktopMicrophoneRequest({ ...request, isMainFrame: false }, TRUSTED_ORIGIN),
    );
    assert.isFalse(
      canGrantDesktopMicrophoneRequest({ ...request, mediaTypes: ["video"] }, TRUSTED_ORIGIN),
    );
    assert.isFalse(
      canGrantDesktopMicrophoneRequest(
        { ...request, mediaTypes: ["audio", "video"] },
        TRUSTED_ORIGIN,
      ),
    );
    assert.isFalse(
      canGrantDesktopMicrophoneRequest(
        { ...request, requestingUrl: "https://evil.example" },
        TRUSTED_ORIGIN,
      ),
    );
  });

  it("keeps the permission check boundary aligned with the request boundary", () => {
    const details = {
      isMainFrame: true,
      mediaType: "audio" as const,
      requestingUrl: TRUSTED_ORIGIN,
      securityOrigin: TRUSTED_ORIGIN,
    };
    const webContents = {} as Electron.WebContents;
    assert.isTrue(
      canCheckDesktopMicrophonePermission(webContents, TRUSTED_ORIGIN, details, TRUSTED_ORIGIN),
    );
    assert.isFalse(
      canCheckDesktopMicrophonePermission(null, TRUSTED_ORIGIN, details, TRUSTED_ORIGIN),
    );
    assert.isFalse(
      canCheckDesktopMicrophonePermission(
        webContents,
        "https://evil.example",
        details,
        TRUSTED_ORIGIN,
      ),
    );
    assert.isFalse(
      canCheckDesktopMicrophonePermission(
        webContents,
        TRUSTED_ORIGIN,
        { ...details, mediaType: "video" },
        TRUSTED_ORIGIN,
      ),
    );
  });

  it.effect("installs handlers on the default session and denies preview-style origins", () =>
    Effect.gen(function* () {
      const handlers = makeDesktopPermissionHandlers(TRUSTED_ORIGIN);
      const request = handlers.request as (...args: Array<unknown>) => void;
      const check = handlers.check as (...args: Array<unknown>) => boolean;
      let granted: boolean | undefined;

      request(
        {},
        "media",
        (value: boolean) => {
          granted = value;
        },
        {
          isMainFrame: true,
          requestingUrl: "croki-preview://preview.example",
          securityOrigin: "croki-preview://preview.example",
          mediaTypes: ["audio"],
        },
      );
      assert.isFalse(granted);
      assert.isFalse(
        check({}, "media", TRUSTED_ORIGIN, {
          isMainFrame: true,
          mediaType: "audio",
          requestingUrl: "croki-preview://preview.example",
          securityOrigin: "croki-preview://preview.example",
        }),
      );

      request(
        {},
        "clipboard-sanitized-write",
        (value: boolean) => {
          granted = value;
        },
        {
          isMainFrame: true,
          requestingUrl: TRUSTED_ORIGIN,
          securityOrigin: TRUSTED_ORIGIN,
        },
      );
      assert.isTrue(granted);
      assert.isTrue(
        check({} as Electron.WebContents, "clipboard-sanitized-write", TRUSTED_ORIGIN, {
          isMainFrame: true,
          requestingUrl: TRUSTED_ORIGIN,
        }),
      );

      // Exercise the service's actual default-session installation as well.
      yield* make.configure(TRUSTED_ORIGIN);
      assert.strictEqual(setPermissionRequestHandler.mock.calls.length, 1);
      assert.strictEqual(setPermissionCheckHandler.mock.calls.length, 1);
      assert.isFunction(requestHandlerRef.current);
      assert.isFunction(checkHandlerRef.current);
    }),
  );
});
