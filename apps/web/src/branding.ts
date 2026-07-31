import type { DesktopAppBranding } from "@t3tools/contracts";
import { formatAppDisplayName } from "./branding.logic";

export const CROKI_WEB_BASE_NAME = "Croki";

function readInjectedDesktopAppBranding(): DesktopAppBranding | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.desktopBridge?.getAppBranding?.() ?? null;
}

export type HostedAppChannel = "latest" | "nightly";

export interface ResolvedWebAppBranding {
  readonly baseName: string;
  readonly stageLabel: string;
  readonly displayName: string;
  readonly hostedChannel: HostedAppChannel | null;
  readonly hostedChannelLabel: string | null;
}

export function resolveWebAppBranding(input: {
  readonly injectedDesktopBranding: DesktopAppBranding | null;
  readonly hostedChannel: string | undefined;
  readonly development: boolean;
}): ResolvedWebAppBranding {
  const normalizedChannel = input.hostedChannel?.trim().toLowerCase();
  const hostedChannel =
    normalizedChannel === "latest" || normalizedChannel === "nightly" ? normalizedChannel : null;
  const hostedChannelLabel =
    hostedChannel === "nightly" ? "Nightly" : hostedChannel === "latest" ? "Latest" : null;
  const baseName = input.injectedDesktopBranding?.baseName ?? CROKI_WEB_BASE_NAME;
  const stageLabel =
    input.injectedDesktopBranding?.stageLabel ??
    hostedChannelLabel ??
    (input.development ? "Dev" : "Latest");

  return {
    baseName,
    stageLabel,
    displayName:
      input.injectedDesktopBranding?.displayName ?? formatAppDisplayName({ baseName, stageLabel }),
    hostedChannel,
    hostedChannelLabel,
  };
}

const webAppBranding = resolveWebAppBranding({
  injectedDesktopBranding: readInjectedDesktopAppBranding(),
  hostedChannel: import.meta.env.VITE_HOSTED_APP_CHANNEL,
  development: import.meta.env.DEV,
});

export const HOSTED_APP_CHANNEL = webAppBranding.hostedChannel;
export const HOSTED_APP_CHANNEL_LABEL = webAppBranding.hostedChannelLabel;
export const APP_BASE_NAME = webAppBranding.baseName;
export const APP_STAGE_LABEL = webAppBranding.stageLabel;
export const APP_DISPLAY_NAME = webAppBranding.displayName;
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";
