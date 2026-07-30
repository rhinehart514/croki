import type { EnvironmentId, ProjectReadFileResult } from "@t3tools/contracts";
import {
  CROKI_CONTEXT_RELATIVE_PATH,
  type CrokiContextNode,
  type CrokiNodeDomain,
} from "@t3tools/shared/crokiContext";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

import { AppText as Text } from "../../components/AppText";
import { EmptyState } from "../../components/EmptyState";
import { useEnvironmentQuery } from "../../state/query";
import { projectEnvironment } from "../../state/projects";
import {
  buildCrokiCanvasPresentation,
  selectCrokiCanvasLoadState,
  selectCrokiEvidenceLinks,
  type CrokiCanvasPresentation,
} from "./crokiCanvasPresentation";

const KIND_LABEL: Record<CrokiNodeDomain, Record<CrokiContextNode["kind"], string>> = {
  product: { intent: "Intent", decision: "Decision", evidence: "Evidence", work: "Consequence" },
  gtm: { intent: "Audience", decision: "Claim", evidence: "Signal", work: "Experiment" },
  workflow: { intent: "Outcome", decision: "Gate", evidence: "Result", work: "Assignment" },
  shared: { intent: "Intent", decision: "Decision", evidence: "Evidence", work: "Work" },
};

function CanvasNode(props: {
  readonly node: CrokiContextNode;
  readonly onOpenFile: (path: string, line: number | null) => void;
}) {
  const evidenceLinks = selectCrokiEvidenceLinks(props.node);
  return (
    <View className="border-b border-border py-3">
      <Text className="text-2xs font-t3-bold uppercase tracking-wide text-foreground-muted">
        {KIND_LABEL[props.node.domain ?? "product"][props.node.kind]} ·{" "}
        {props.node.domain ?? "product"}
      </Text>
      <Text className="mt-1 text-sm font-t3-bold text-foreground" selectable>
        {props.node.title}
      </Text>
      {props.node.body ? (
        <Text className="mt-1 text-sm leading-relaxed text-foreground-muted" selectable>
          {props.node.body}
        </Text>
      ) : null}
      {evidenceLinks.map((link) =>
        link.kind === "file" ? (
          <Pressable
            key={`file:${link.path}:${link.line ?? ""}`}
            accessibilityRole="link"
            className="mt-2 self-start active:opacity-60"
            onPress={() => props.onOpenFile(link.path, link.line)}
          >
            <Text className="text-xs font-t3-bold text-primary">
              {link.path}
              {link.line === null ? "" : `:${link.line}`}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            key={`url:${link.url}`}
            accessibilityRole="link"
            className="mt-2 self-start active:opacity-60"
            onPress={() => {
              void Linking.openURL(link.url).catch(() => {
                Alert.alert("Unable to open evidence", "This evidence URL could not be opened.");
              });
            }}
          >
            <Text className="text-xs font-t3-bold text-primary" numberOfLines={1}>
              {link.url}
            </Text>
          </Pressable>
        ),
      )}
    </View>
  );
}

function CanvasSection(props: {
  readonly emptyLabel: string;
  readonly nodes: readonly CrokiContextNode[];
  readonly onOpenFile: (path: string, line: number | null) => void;
  readonly title: string;
}) {
  return (
    <View className="mt-5">
      <View className="flex-row items-baseline justify-between border-b border-border pb-2">
        <Text className="text-sm font-t3-bold text-foreground">{props.title}</Text>
        <Text className="text-xs text-foreground-muted">{props.nodes.length}</Text>
      </View>
      {props.nodes.length === 0 ? (
        <Text className="py-3 text-sm text-foreground-muted">{props.emptyLabel}</Text>
      ) : (
        props.nodes.map((node) => (
          <CanvasNode key={node.id} node={node} onOpenFile={props.onOpenFile} />
        ))
      )}
    </View>
  );
}

function CanvasReady(props: {
  readonly issueCount?: number;
  readonly model: CrokiCanvasPresentation;
  readonly product: string;
  readonly onOpenFile: (path: string, line: number | null) => void;
}) {
  return (
    <>
      {props.issueCount ? (
        <View className="mb-4 border-y border-border py-3">
          <Text className="text-sm font-t3-bold text-foreground">Canvas partially recovered</Text>
          <Text className="mt-1 text-xs text-foreground-muted">
            {props.issueCount} invalid entr{props.issueCount === 1 ? "y was" : "ies were"} omitted.
            Repair from desktop or web.
          </Text>
        </View>
      ) : null}
      <View className="border-b border-border pb-4">
        <Text className="text-2xs font-t3-bold uppercase tracking-wide text-foreground-muted">
          Product
        </Text>
        <Text className="mt-1 text-xl font-t3-bold text-foreground" selectable>
          {props.product || "Untitled product"}
        </Text>
        <Text className="mt-1 text-xs text-foreground-muted">Read-only on mobile</Text>
      </View>

      <CanvasSection
        emptyLabel="No current product canon."
        nodes={props.model.current}
        onOpenFile={props.onOpenFile}
        title="Current canon"
      />
      <CanvasSection
        emptyLabel="No suggestions awaiting review."
        nodes={props.model.provisional}
        onOpenFile={props.onOpenFile}
        title="Provisional suggestions"
      />

      <View className="mt-5">
        <View className="flex-row items-baseline justify-between border-b border-border pb-2">
          <Text className="text-sm font-t3-bold text-foreground">Relationships</Text>
          <Text className="text-xs text-foreground-muted">{props.model.relationships.length}</Text>
        </View>
        {props.model.relationships.length === 0 ? (
          <Text className="py-3 text-sm text-foreground-muted">No relationships.</Text>
        ) : (
          props.model.relationships.map(({ edge, fromTitle, toTitle }) => (
            <View
              key={`${edge.from}:${edge.relation}:${edge.to}`}
              className="border-b border-border py-3"
            >
              <Text className="text-sm text-foreground" selectable>
                {fromTitle}
              </Text>
              <Text className="my-0.5 text-xs font-t3-bold text-foreground-muted">
                {edge.relation}
              </Text>
              <Text className="text-sm text-foreground" selectable>
                {toTitle}
              </Text>
            </View>
          ))
        )}
      </View>

      {props.model.retired.length > 0 ? (
        <CanvasSection
          emptyLabel=""
          nodes={props.model.retired}
          onOpenFile={props.onOpenFile}
          title="Retired"
        />
      ) : null}
    </>
  );
}

export function CrokiCanvasPane(props: {
  readonly cwd: string;
  readonly environmentId: EnvironmentId;
  readonly headerInset?: number;
  readonly onOpenFile: (path: string, line: number | null) => void;
  readonly projectName: string;
}) {
  const query = useEnvironmentQuery(
    projectEnvironment.readFile({
      environmentId: props.environmentId,
      input: { cwd: props.cwd, relativePath: CROKI_CONTEXT_RELATIVE_PATH },
    }),
  );
  const state = useMemo(
    () =>
      selectCrokiCanvasLoadState({
        data: query.data as ProjectReadFileResult | null,
        error: query.error,
        failure: query.failure,
        isPending: query.isPending,
      }),
    [query.data, query.error, query.failure, query.isPending],
  );
  const model = useMemo(
    () =>
      state.status === "ready" || state.status === "partial"
        ? buildCrokiCanvasPresentation(state.context)
        : null,
    [state],
  );

  const statusContent = (() => {
    if (state.status === "loading") {
      return (
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <ActivityIndicator />
          <Text className="text-sm text-foreground-muted">Loading Canvas…</Text>
        </View>
      );
    }
    if (state.status === "missing") {
      return (
        <EmptyState
          title="Canvas not found"
          detail="Create .croki/context.json from the desktop or web app, then refresh."
          actionLabel="Refresh"
          onAction={query.refresh}
          variant="plain"
        />
      );
    }
    if (state.status === "malformed") {
      return (
        <EmptyState
          title="Canvas is malformed"
          detail={`The context file could not be parsed (${state.code}). Repair it from the desktop or web app.`}
          actionLabel="Retry"
          onAction={query.refresh}
          variant="plain"
        />
      );
    }
    if (state.status === "oversized") {
      return (
        <EmptyState
          title="Canvas is too large"
          detail="The context exceeds the supported Canvas limit. Reduce it from the desktop or web app."
          actionLabel="Retry"
          onAction={query.refresh}
          variant="plain"
        />
      );
    }
    if (state.status === "read-error") {
      return (
        <EmptyState
          title="Canvas unavailable"
          detail={state.detail}
          actionLabel="Retry"
          onAction={query.refresh}
          variant="plain"
        />
      );
    }
    return null;
  })();

  return (
    <View className="flex-1 border-l border-border bg-black">
      <View
        className="min-h-12 justify-center border-b border-border px-4 py-2"
        style={{ paddingTop: (props.headerInset ?? 0) + 8 }}
      >
        <Text className="text-sm font-t3-bold text-foreground">Canvas</Text>
        <Text className="text-xs text-foreground-muted" numberOfLines={1}>
          {props.projectName}
        </Text>
      </View>
      {statusContent ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          refreshControl={<RefreshControl refreshing={query.isPending} onRefresh={query.refresh} />}
        >
          {statusContent}
        </ScrollView>
      ) : (state.status === "ready" || state.status === "partial") && model !== null ? (
        <ScrollView
          contentContainerClassName="px-4 pb-12 pt-4"
          refreshControl={<RefreshControl refreshing={query.isPending} onRefresh={query.refresh} />}
        >
          <CanvasReady
            {...(state.status === "partial" ? { issueCount: state.issueCount } : {})}
            model={model}
            product={state.context.product || props.projectName}
            onOpenFile={props.onOpenFile}
          />
        </ScrollView>
      ) : null}
    </View>
  );
}
