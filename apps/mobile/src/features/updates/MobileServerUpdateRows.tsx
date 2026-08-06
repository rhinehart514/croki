import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ServerConfig } from "@croki/contracts";
import Constants from "expo-constants";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { SymbolView } from "../../components/AppSymbol";
import { copyTextWithHaptic } from "../../lib/copyTextWithHaptic";
import { useThemeColor } from "../../lib/useThemeColor";
import type { ConnectedEnvironmentSummary } from "../../state/remote-runtime-types";
import { environmentServerConfigsAtom, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { resolveMobileServerUpdate } from "./mobileServerUpdates.logic";

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
    return config && presentation ? [{ environment, config, presentation }] : [];
  });

  if (updates.length === 0) return null;

  return (
    <View className="mt-5 gap-3">
      <Text className="px-1 text-sm font-t3-bold uppercase text-foreground-muted">
        Server updates
      </Text>
      <View className="overflow-hidden rounded-[24px] bg-card">
        {updates.map(({ environment, config, presentation }, index) => (
          <MobileServerUpdateRow
            key={environment.environmentId}
            borderTop={index !== 0}
            environmentId={environment.environmentId}
            label={environment.environmentLabel}
            config={config}
            command={presentation.command}
            serverVersion={presentation.serverVersion}
            targetVersion={presentation.targetVersion}
          />
        ))}
      </View>
    </View>
  );
}

function MobileServerUpdateRow(props: {
  readonly borderTop: boolean;
  readonly command: string;
  readonly config: ServerConfig;
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly serverVersion: string;
  readonly targetVersion: string;
}) {
  const updateState = useAtomValue(serverEnvironment.updateStateAtom(props.environmentId));
  const updateServer = useAtomCommand(serverEnvironment.updateServer, { reportFailure: false });
  const [submitting, setSubmitting] = useState(false);
  const iconColor = useThemeColor("--color-icon");
  const mutedColor = useThemeColor("--color-icon-muted");
  const capability = props.config.environment.capabilities.serverSelfUpdate ?? null;
  const running = updateState.status === "running" || submitting;
  const status =
    updateState.status === "running"
      ? updateState.stage === "resuming"
        ? "Restarting…"
        : "Downloading…"
      : updateState.status === "failed"
        ? updateState.message
        : `${props.serverVersion} → ${props.targetVersion}`;

  const handleUpdate = async () => {
    if (running) return;
    setSubmitting(true);
    try {
      const result = await updateServer({
        environmentId: props.environmentId,
        input: { targetVersion: props.targetVersion },
      });
      if (result._tag === "Failure") {
        Alert.alert("Server update failed", "Croki kept the previous server version available.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = () => {
    copyTextWithHaptic(props.command, { target: "server update command" });
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
