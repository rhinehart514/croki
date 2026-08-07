import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@croki/contracts";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Linking, Platform, Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { copyTextWithHaptic } from "../../lib/copyTextWithHaptic";
import { useThemeColor } from "../../lib/useThemeColor";
import type { ConnectedEnvironmentSummary } from "../../state/remote-runtime-types";
import { environmentServerConfigsAtom, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  needsNativeBuildUpdate,
  resolveNativeBuildUpdateRecovery,
  runAppUpdateCheck,
  type AppUpdateCheckState,
} from "./app-updates";
import {
  resolveMobileServerUpdate,
  type MobileServerUpdatePresentation as MobileVersionUpdatePresentation,
} from "./mobileServerUpdates.logic";

export function MobileServerUpdateRows(props: {
  readonly environments: ReadonlyArray<ConnectedEnvironmentSummary>;
}) {
  const configs = useAtomValue(environmentServerConfigsAtom);
  const clientVersion = Constants.expoConfig?.version;
  const updates = props.environments.flatMap((environment) => {
    const config = configs.get(environment.environmentId);
    const presentation = resolveMobileServerUpdate({
      clientVersion,
      serverVersion: config?.environment.serverVersion,
      selfUpdate: config?.environment.capabilities.serverSelfUpdate,
    });
    return presentation ? [{ environment, presentation }] : [];
  });
  const clientUpdate = updates.find(
    (entry): entry is typeof entry & { presentation: MobileClientUpdatePresentation } =>
      entry.presentation.kind === "update-client",
  );
  const serverUpdates = updates.filter(
    (entry): entry is typeof entry & { presentation: MobileServerUpdatePresentation } =>
      entry.presentation.kind === "update-server",
  );

  if (updates.length === 0) return null;

  return (
    <View className="mt-5 gap-3">
      <Text className="px-1 text-sm font-t3-bold uppercase text-foreground-muted">Updates</Text>
      <View className="overflow-hidden rounded-[24px] bg-card">
        {clientUpdate ? <MobileClientUpdateRow presentation={clientUpdate.presentation} /> : null}
        {serverUpdates.map(({ environment, presentation }, index) => (
          <MobileServerUpdateRow
            key={environment.environmentId}
            borderTop={clientUpdate !== undefined || index !== 0}
            environmentId={environment.environmentId}
            label={environment.environmentLabel}
            presentation={presentation}
          />
        ))}
      </View>
    </View>
  );
}

type MobileClientUpdatePresentation = Extract<
  MobileVersionUpdatePresentation,
  { readonly kind: "update-client" }
>;
type MobileServerUpdatePresentation = Extract<
  MobileVersionUpdatePresentation,
  { readonly kind: "update-server" }
>;

function MobileClientUpdateRow(props: { readonly presentation: MobileClientUpdatePresentation }) {
  const [updateState, setUpdateState] = useState<AppUpdateCheckState>("idle");
  const updateInFlight = useRef(false);
  const iconColor = useThemeColor("--color-icon");
  const mutedColor = useThemeColor("--color-icon-muted");
  const busy =
    updateState === "checking" || updateState === "downloading" || updateState === "restarting";
  const needsNativeBuild = needsNativeBuildUpdate({
    updatesEnabled: Updates.isEnabled,
    updateState,
  });
  const nativeBuildRecovery = resolveNativeBuildUpdateRecovery(Platform.OS);
  const status =
    updateState === "checking"
      ? "Checking…"
      : updateState === "downloading"
        ? "Downloading…"
        : updateState === "restarting"
          ? "Restarting…"
          : needsNativeBuild
            ? "A newer native build is required"
            : `${props.presentation.clientVersion} → ${props.presentation.serverVersion}`;

  const handleUpdate = async () => {
    if (updateInFlight.current) return;
    updateInFlight.current = true;
    try {
      await runAppUpdateCheck({
        onFailure: (message) => Alert.alert("Update failed", message),
        onStateChange: setUpdateState,
      });
    } finally {
      updateInFlight.current = false;
    }
  };

  const openNativeBuildAction = async (action: {
    readonly label: string;
    readonly url: string;
  }) => {
    try {
      await Linking.openURL(action.url);
    } catch {
      Alert.alert(
        "Could not open the install source",
        "Open TestFlight, the App Store, or Google Play and install the latest Croki build.",
      );
    }
  };

  const handleNativeBuildUpdate = () => {
    if (!nativeBuildRecovery) {
      Alert.alert(
        "Install a newer Croki build",
        "Install the latest build from the same source that installed this app.",
      );
      return;
    }

    if (nativeBuildRecovery.actions.length === 1) {
      const [action] = nativeBuildRecovery.actions;
      if (action) void openNativeBuildAction(action);
      return;
    }

    Alert.alert("Install a newer Croki build", nativeBuildRecovery.guidance, [
      { text: "Cancel", style: "cancel" },
      ...nativeBuildRecovery.actions.map((action) => ({
        text: action.label,
        onPress: () => void openNativeBuildAction(action),
      })),
    ]);
  };

  return (
    <View className="px-4 py-3.5">
      <View className="flex-row items-center gap-3">
        <SymbolView name="arrow.down.circle" size={20} tintColor={iconColor} type="monochrome" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base font-t3-bold text-foreground">Update this app</Text>
          <Text className="text-xs text-foreground-muted" numberOfLines={2}>
            {status}
          </Text>
        </View>
        {busy ? (
          <ActivityIndicator color={mutedColor} size="small" />
        ) : needsNativeBuild ? (
          <Pressable
            accessibilityLabel="Install newer Croki build"
            accessibilityRole="button"
            className="min-h-[38px] justify-center rounded-full bg-subtle px-3.5 active:opacity-70"
            onPress={handleNativeBuildUpdate}
          >
            <Text className="text-xs font-t3-bold text-foreground">Install build</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel="Check for Croki update"
            accessibilityRole="button"
            className="min-h-[38px] justify-center rounded-full bg-subtle px-3.5 active:opacity-70"
            onPress={() => void handleUpdate()}
          >
            <Text className="text-xs font-t3-bold text-foreground">Check update</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function MobileServerUpdateRow(props: {
  readonly borderTop: boolean;
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly presentation: MobileServerUpdatePresentation;
}) {
  const updateState = useAtomValue(serverEnvironment.updateStateAtom(props.environmentId));
  const updateServer = useAtomCommand(serverEnvironment.updateServer, { reportFailure: false });
  const [submitting, setSubmitting] = useState(false);
  const iconColor = useThemeColor("--color-icon");
  const mutedColor = useThemeColor("--color-icon-muted");
  const capability = props.presentation.selfUpdate;
  const running = updateState.status === "running" || submitting;
  const status =
    updateState.status === "running"
      ? updateState.stage === "resuming"
        ? "Restarting…"
        : "Downloading…"
      : updateState.status === "failed"
        ? updateState.message
        : `${props.presentation.serverVersion} → ${props.presentation.targetVersion}`;

  const handleUpdate = async () => {
    if (running) return;
    setSubmitting(true);
    try {
      const result = await updateServer({
        environmentId: props.environmentId,
        input: { targetVersion: props.presentation.targetVersion },
      });
      if (result._tag === "Failure") {
        Alert.alert("Server update failed", "Croki kept the previous server version available.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = () => {
    copyTextWithHaptic(props.presentation.command, { target: "server update command" });
    Alert.alert("Update command copied", `Run it on ${props.label}.`);
  };

  return (
    <View className={props.borderTop ? "border-t border-border px-4 py-3.5" : "px-4 py-3.5"}>
      <View className="flex-row items-center gap-3">
        <SymbolView name="arrow.down.circle" size={20} tintColor={iconColor} type="monochrome" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-base font-t3-bold text-foreground" numberOfLines={1}>
            {props.label}
          </Text>
          <Text
            className={
              updateState.status === "failed"
                ? "text-xs text-rose-500 dark:text-rose-400"
                : "text-xs text-foreground-muted"
            }
            numberOfLines={2}
          >
            {status}
          </Text>
        </View>
        {running ? (
          <ActivityIndicator color={mutedColor} size="small" />
        ) : capability === "desktop-managed" ? (
          <Text className="max-w-28 text-right text-xs text-foreground-muted">
            Update desktop there
          </Text>
        ) : (
          <Pressable
            accessibilityLabel={
              capability === null ? "Copy update command" : `Update ${props.label}`
            }
            accessibilityRole="button"
            className="min-h-[38px] justify-center rounded-full bg-subtle px-3.5 active:opacity-70"
            onPress={capability === null ? handleCopy : () => void handleUpdate()}
          >
            <Text className="text-xs font-t3-bold text-foreground">
              {capability === null
                ? "Copy command"
                : updateState.status === "failed"
                  ? "Retry"
                  : "Update"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
