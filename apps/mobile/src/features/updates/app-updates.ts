import * as Updates from "expo-updates";

import {
  type AtomCommandResult,
  isAtomCommandInterrupted,
  reportAtomCommandResult,
  settlePromise,
  squashAtomCommandFailure,
} from "@croki/client-runtime/state/runtime";

export type AppUpdateCheckState = "idle" | "checking" | "downloading" | "restarting" | "current";

export interface NativeBuildUpdateRecovery {
  readonly actions: ReadonlyArray<{
    readonly label: string;
    readonly url: string;
  }>;
  readonly guidance: string;
}
export interface AppUpdateClient {
  readonly isEnabled: boolean;
  readonly checkForUpdateAsync: () => Promise<{
    readonly isAvailable: boolean;
    readonly isRollBackToEmbedded: boolean;
  }>;
  readonly fetchUpdateAsync: () => Promise<{
    readonly isNew: boolean;
    readonly isRollBackToEmbedded: boolean;
  }>;
  readonly reloadAsync: () => Promise<void>;
}

interface AppUpdateCheckOptions {
  readonly client?: AppUpdateClient;
  readonly onFailure?: (message: string) => void;
  readonly onStateChange?: (state: AppUpdateCheckState) => void;
}

interface AppUpdateCheckProgress {
  failure: string | undefined;
  state: AppUpdateCheckState | undefined;
}

interface AppUpdateCheckInFlight {
  readonly failureListeners: Set<NonNullable<AppUpdateCheckOptions["onFailure"]>>;
  readonly progress: AppUpdateCheckProgress;
  readonly promise: Promise<void>;
  readonly stateListeners: Set<NonNullable<AppUpdateCheckOptions["onStateChange"]>>;
}

interface Deferred {
  readonly promise: Promise<void>;
  readonly reject: (cause: unknown) => void;
  readonly resolve: () => void;
}

const HIDDEN_UPDATE_TAP_COUNT = 5;
let appUpdateCheckInFlight: AppUpdateCheckInFlight | undefined;

const IOS_APP_STORE_URL = "https://apps.apple.com/us/app/croki-remote-claude-more/id6787819824";
const ANDROID_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.croki.croki";

/**
 * OTA updates cannot cross Expo fingerprint runtimes. When version skew
 * remains after a successful check, send the founder back to the native build
 * channel that installed Croki instead of offering another identical check.
 */
export function resolveNativeBuildUpdateRecovery(
  platform: string,
): NativeBuildUpdateRecovery | null {
  if (platform === "ios") {
    return {
      actions: [
        { label: "Open TestFlight", url: "itms-beta://" },
        { label: "Open App Store", url: IOS_APP_STORE_URL },
      ],
      guidance: "Use the same channel that installed this app.",
    };
  }
  if (platform === "android") {
    return {
      actions: [{ label: "Open Play Store", url: ANDROID_PLAY_STORE_URL }],
      guidance: "Install the latest Croki build from Google Play.",
    };
  }
  return null;
}

export function needsNativeBuildUpdate(input: {
  readonly updatesEnabled: boolean;
  readonly updateState: AppUpdateCheckState;
}): boolean {
  return !input.updatesEnabled || input.updateState === "current";
}

/**
 * Keeps the ordinary version row quiet unless someone deliberately taps it
 * five times. Version-skew recovery exposes a direct update check separately.
 */
export function registerHiddenUpdateTap(count: number): {
  readonly nextCount: number;
  readonly shouldCheck: boolean;
} {
  const nextCount = count + 1;
  if (nextCount >= HIDDEN_UPDATE_TAP_COUNT) {
    return {
      nextCount: 0,
      shouldCheck: true,
    };
  }
  return {
    nextCount,
    shouldCheck: false,
  };
}

export async function runAppUpdateCheck(options: AppUpdateCheckOptions = {}): Promise<void> {
  const client = options.client ?? Updates;
  if (!client.isEnabled) return;

  if (appUpdateCheckInFlight) {
    await observeAppUpdateCheck(appUpdateCheckInFlight, options);
    return;
  }

  const progress: AppUpdateCheckProgress = {
    failure: undefined,
    state: undefined,
  };
  const failureListeners = new Set<NonNullable<AppUpdateCheckOptions["onFailure"]>>();
  const stateListeners = new Set<NonNullable<AppUpdateCheckOptions["onStateChange"]>>();
  if (options.onFailure) failureListeners.add(options.onFailure);
  if (options.onStateChange) stateListeners.add(options.onStateChange);

  const deferred = createDeferred();
  const inFlight: AppUpdateCheckInFlight = {
    failureListeners,
    progress,
    promise: deferred.promise,
    stateListeners,
  };
  // Publish the operation before any state listener can synchronously re-enter.
  appUpdateCheckInFlight = inFlight;

  const execution = performAppUpdateCheck(client, {
    onFailure: (message) => {
      progress.failure = message;
      notifyListeners(failureListeners, message);
    },
    onStateChange: (state) => {
      progress.state = state;
      notifyListeners(stateListeners, state);
    },
  });
  void execution.then(deferred.resolve, deferred.reject);

  try {
    await deferred.promise;
  } finally {
    if (appUpdateCheckInFlight === inFlight) {
      appUpdateCheckInFlight = undefined;
    }
  }
}

function createDeferred(): Deferred {
  let reject!: Deferred["reject"];
  let resolve!: Deferred["resolve"];
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = () => resolvePromise();
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function notifyListeners<A>(listeners: ReadonlySet<(value: A) => void>, value: A): void {
  // A listener can synchronously subscribe another caller. Snapshot so that
  // caller receives only observeAppUpdateCheck's explicit current-value replay.
  const snapshot = Array.from(listeners);
  for (const listener of snapshot) listener(value);
}

async function observeAppUpdateCheck(
  inFlight: AppUpdateCheckInFlight,
  options: AppUpdateCheckOptions,
): Promise<void> {
  const onFailure = options.onFailure;
  const onStateChange = options.onStateChange;

  if (onFailure) {
    inFlight.failureListeners.add(onFailure);
    if (inFlight.progress.failure) onFailure(inFlight.progress.failure);
  }
  if (onStateChange) {
    inFlight.stateListeners.add(onStateChange);
    if (inFlight.progress.state) onStateChange(inFlight.progress.state);
  }

  try {
    await inFlight.promise;
  } finally {
    if (onFailure) inFlight.failureListeners.delete(onFailure);
    if (onStateChange) inFlight.stateListeners.delete(onStateChange);
  }
}

async function performAppUpdateCheck(
  client: AppUpdateClient,
  options: AppUpdateCheckOptions,
): Promise<void> {
  const setState = options.onStateChange ?? (() => {});

  setState("checking");
  const check = await settlePromise(() => client.checkForUpdateAsync());
  if (check._tag === "Failure") {
    reportUpdateFailure(check, "Could not check for updates.", options.onFailure);
    setState("idle");
    return;
  }
  // A rollback directive (`eas update:rollback`) arrives as isAvailable: false
  // with isRollBackToEmbedded: true. The running OTA still has to be dropped.
  if (!check.value.isAvailable && !check.value.isRollBackToEmbedded) {
    setState("current");
    return;
  }

  setState("downloading");
  const fetched = await settlePromise(() => client.fetchUpdateAsync());
  if (fetched._tag === "Failure") {
    reportUpdateFailure(fetched, "Could not download the update.", options.onFailure);
    setState("idle");
    return;
  }
  // isNew is always false for a rollback, so it cannot be the sole gate.
  if (!fetched.value.isNew && !fetched.value.isRollBackToEmbedded) {
    setState("current");
    return;
  }

  setState("restarting");
  const reloaded = await settlePromise(() => client.reloadAsync());
  if (reloaded._tag === "Failure") {
    reportUpdateFailure(reloaded, "Downloaded, but could not restart the app.", options.onFailure);
    setState("idle");
  }
}

function reportUpdateFailure(
  result: AtomCommandResult<unknown, unknown>,
  fallback: string,
  onFailure: AppUpdateCheckOptions["onFailure"],
): void {
  reportAtomCommandResult(result, { label: "app update check" });
  if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
  const error = squashAtomCommandFailure(result);
  onFailure?.(error instanceof Error ? error.message : fallback);
}

export function createAppUpdateLaunchCheck(
  client: AppUpdateClient = Updates,
): () => Promise<void> | undefined {
  let started = false;

  return () => {
    if (started || !client.isEnabled) return undefined;
    started = true;
    return runAppUpdateCheck({ client });
  };
}

export const checkForAppUpdateOnLaunch = createAppUpdateLaunchCheck();
