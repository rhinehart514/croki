import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useCallback } from "react";
import { View } from "react-native";

import { EmptyState } from "../../components/EmptyState";
import { LoadingScreen } from "../../components/LoadingScreen";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { useThreadSelection } from "../../state/use-thread-selection";
import { useSelectedThreadWorktree } from "../../state/use-selected-thread-worktree";
import { useAdaptiveWorkspacePaneRole } from "../layout/AdaptiveWorkspaceLayout";
import { CrokiCanvasPane } from "./CrokiCanvasPane";

type ThreadCanvasRouteScreenProps = StaticScreenProps<{
  readonly environmentId: string;
  readonly threadId: string;
}>;

function firstRouteParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export function ThreadCanvasRouteScreen(props: ThreadCanvasRouteScreenProps) {
  useAdaptiveWorkspacePaneRole("inspector");
  const navigation = useNavigation();
  const { selectedThread, selectedThreadProject } = useThreadSelection();
  const { selectedThreadCwd } = useSelectedThreadWorktree();
  const environmentIdRaw = firstRouteParam(props.route.params.environmentId);
  const threadIdRaw = firstRouteParam(props.route.params.threadId);
  const environmentId = environmentIdRaw === null ? null : EnvironmentId.make(environmentIdRaw);
  const threadId = threadIdRaw === null ? null : ThreadId.make(threadIdRaw);
  const routeMatchesSelection =
    selectedThread !== null &&
    environmentId !== null &&
    threadId !== null &&
    selectedThread.environmentId === environmentId &&
    selectedThread.id === threadId;
  const cwd = selectedThreadCwd ?? selectedThreadProject?.workspaceRoot ?? null;
  const handleOpenFile = useCallback(
    (path: string, line: number | null) => {
      if (environmentId === null || threadId === null) return;
      navigation.navigate("ThreadFile", {
        environmentId: String(environmentId),
        threadId: String(threadId),
        path: path.split("/").filter(Boolean),
        ...(line === null ? {} : { line: String(line) }),
      });
    },
    [environmentId, navigation, threadId],
  );

  if (!routeMatchesSelection) {
    return <LoadingScreen message="Opening Canvas…" messagePlacement="above-spinner" />;
  }
  if (cwd === null || environmentId === null) {
    return (
      <View className="flex-1 items-center justify-center bg-sheet px-6">
        <NativeStackScreenOptions options={{ title: "Canvas" }} />
        <EmptyState
          title="Canvas unavailable"
          detail="This thread does not have an active workspace path."
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-sheet">
      <NativeStackScreenOptions options={{ title: "Canvas" }} />
      <CrokiCanvasPane
        cwd={cwd}
        environmentId={environmentId}
        onOpenFile={handleOpenFile}
        projectName={selectedThreadProject?.title ?? "Canvas"}
      />
    </View>
  );
}
