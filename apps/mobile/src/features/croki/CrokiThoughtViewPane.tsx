import type {
  CrokiThoughtView,
  CrokiThoughtViewSelection,
  CrokiThoughtViewStatement,
  EnvironmentId,
  ProjectId,
} from "@croki/contracts";
import { compileCrokiThoughtView } from "@croki/shared/crokiThoughtView";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";

import { AppText as Text } from "../../components/AppText";
import { EmptyState } from "../../components/EmptyState";
import { orchestrationEnvironment } from "../../state/orchestration";
import { useEnvironmentQuery } from "../../state/query";

const EPISTEMIC_LABEL: Record<CrokiThoughtViewStatement["epistemicState"], string> = {
  observed: "Observed",
  attributed: "Attributed",
  derived: "Derived",
  inferred: "Inferred",
  hypothetical: "Hypothetical",
  contradicted: "Contradicted",
  uncovered: "Not in sources",
};

export function CrokiThoughtViewPane(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly projectName: string;
  readonly question: string;
  readonly onOpenFile: (path: string, line: number | null) => void;
  readonly onUse: (selection: CrokiThoughtViewSelection, title: string) => void;
}) {
  const query = useEnvironmentQuery(
    orchestrationEnvironment.projectPerception({
      environmentId: props.environmentId,
      input: { projectId: props.projectId, limit: 200 },
    }),
  );
  const [alternate, setAlternate] = useState(false);
  const [basisOpen, setBasisOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const view = useMemo(
    () =>
      query.data
        ? compileCrokiThoughtView({
            frame: query.data,
            question: props.question,
            ...(alternate ? { alternate: true } : {}),
          })
        : null,
    [alternate, props.question, query.data],
  );
  const selected = view?.statements.find((statement) => statement.id === selectedId) ?? null;

  if (query.error) {
    return (
      <EmptyState
        title="Canvas unavailable"
        detail={query.error}
        actionLabel="Retry"
        onAction={query.refresh}
        variant="plain"
      />
    );
  }
  if (query.isPending && query.data === null) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-6">
        <ActivityIndicator />
        <Text className="text-sm text-foreground-muted">Reading the work…</Text>
      </View>
    );
  }
  if (!view) {
    return (
      <EmptyState
        title="Nothing needs a View yet"
        detail="Canvas will form one when the current question contains relationships, alternatives, change, or contradictory evidence."
        actionLabel="Refresh"
        onAction={query.refresh}
        variant="plain"
      />
    );
  }

  return (
    <View className="flex-1 bg-black">
      <View className="border-b border-border px-4 py-3">
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-t3-bold text-foreground">Canvas</Text>
            <Text className="text-xs text-foreground-muted" numberOfLines={1}>
              {viewLabel(view)} · r{view.sourceRevision}
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => setAlternate((value) => !value)}>
            <Text className="text-xs font-t3-bold text-foreground-muted">Reframe</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setBasisOpen((value) => !value)}>
            <Text className="text-xs font-t3-bold text-foreground-muted">Basis</Text>
          </Pressable>
        </View>
        {basisOpen ? (
          <View className="mt-3 border-t border-border pt-3">
            <Text className="text-xs leading-relaxed text-foreground">{view.basis.question}</Text>
            <Text className="mt-2 text-2xs uppercase tracking-wide text-foreground-muted">
              {view.basis.coverage}
            </Text>
            <Text className="mt-1 text-xs leading-relaxed text-foreground-muted">
              Foregrounds {view.basis.foregrounds.join(" · ")}
            </Text>
          </View>
        ) : null}
      </View>
      <ScrollView
        contentContainerClassName="px-4 pb-16 pt-5"
        refreshControl={<RefreshControl refreshing={query.isPending} onRefresh={query.refresh} />}
      >
        <Text className="text-2xs font-t3-bold uppercase tracking-wide text-foreground-muted">
          {props.projectName} · {viewLabel(view)} view
        </Text>
        <Text className="mt-2 text-xl font-t3-bold leading-tight text-foreground" selectable>
          {view.basis.question}
        </Text>
        {view.regions.map((region) => {
          const statements = region.statementIds.flatMap((id) => {
            const statement = view.statements.find((candidate) => candidate.id === id);
            return statement ? [statement] : [];
          });
          if (statements.length === 0) return null;
          return (
            <View key={region.id} className="mt-6">
              <View className="mb-2 flex-row items-center border-b border-border pb-2">
                <Text className="text-xs font-t3-bold text-foreground">{region.title}</Text>
                <Text className="ml-auto text-xs text-foreground-muted">{statements.length}</Text>
              </View>
              {statements.map((statement) => (
                <Pressable
                  key={statement.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedId === statement.id }}
                  className={`mb-px border-l-2 px-4 py-3 ${
                    selectedId === statement.id
                      ? "border-foreground bg-foreground/10"
                      : "border-border bg-foreground/[0.03]"
                  }`}
                  onPress={() => setSelectedId(statement.id)}
                >
                  <Text className="text-2xs font-t3-bold uppercase tracking-wide text-foreground-muted">
                    {EPISTEMIC_LABEL[statement.epistemicState]}
                  </Text>
                  <Text className="mt-1 text-sm font-t3-bold text-foreground" selectable>
                    {statement.title}
                  </Text>
                  {statement.body ? (
                    <Text className="mt-1 text-xs leading-relaxed text-foreground-muted" selectable>
                      {statement.body}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          );
        })}
        {selected ? (
          <View className="mt-6 border-y border-border py-4">
            <Text className="text-2xs font-t3-bold uppercase tracking-wide text-foreground-muted">
              Selected · {EPISTEMIC_LABEL[selected.epistemicState]}
            </Text>
            <View className="mt-3 flex-row gap-3">
              <Pressable
                accessibilityRole="button"
                className="flex-1 border border-border px-3 py-2.5"
                onPress={() => openStatementSource(view, selected, props.onOpenFile)}
              >
                <Text className="text-center text-xs font-t3-bold text-foreground">
                  Open source
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                className="flex-1 border border-foreground px-3 py-2.5"
                onPress={() => props.onUse(selectionFor(view, selected), selected.title)}
              >
                <Text className="text-center text-xs font-t3-bold text-foreground">
                  Use in Thread
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function selectionFor(
  view: CrokiThoughtView,
  statement: CrokiThoughtViewStatement,
): CrokiThoughtViewSelection {
  return {
    viewId: view.id,
    sourceRevision: view.sourceRevision,
    representation: view.representation,
    statementIds: [statement.id],
    sourceIds: statement.sourceIds,
  };
}

function openStatementSource(
  view: CrokiThoughtView,
  statement: CrokiThoughtViewStatement,
  onOpenFile: (path: string, line: number | null) => void,
) {
  const source = view.sources.find((candidate) => statement.sourceIds.includes(candidate.id));
  if (!source?.uri) return;
  if (source.uri.startsWith("http://") || source.uri.startsWith("https://")) {
    void Linking.openURL(source.uri);
    return;
  }
  onOpenFile(source.uri.replace(/^file:\/\//, ""), null);
}

function viewLabel(view: CrokiThoughtView): string {
  return view.representation === "possibility"
    ? "Possible worlds"
    : view.representation.charAt(0).toUpperCase() + view.representation.slice(1);
}
