import type { CrokiThoughtViewStatement, EnvironmentId, ProjectId } from "@croki/contracts";
import { compileCrokiThoughtView } from "@croki/shared/crokiThoughtView";
import { useMemo, useState } from "react";
import { Linking, Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
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

export function CrokiInlineThoughtView(props: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly question: string;
  readonly onUse: (text: string) => void;
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

  if (!view) return null;
  const selected = view.statements.find((statement) => statement.id === selectedId) ?? null;
  const source = selected
    ? view.sources.find((candidate) => selected.sourceIds.includes(candidate.id))
    : null;

  return (
    <View className="mb-5 overflow-hidden border-y border-border bg-black">
      <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
        <View className="min-w-0 flex-1">
          <Text className="text-2xs font-t3-bold uppercase tracking-wide text-foreground-muted">
            View · {viewLabel(view.representation)}
          </Text>
          <Text className="mt-0.5 text-2xs text-foreground-muted" numberOfLines={1}>
            {view.basis.coverage} · r{view.sourceRevision}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setAlternate((value) => !value)}>
          <Text className="text-xs font-t3-bold text-foreground-muted">Reframe</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setBasisOpen((value) => !value)}>
          <Text className="text-xs font-t3-bold text-foreground-muted">Basis</Text>
        </Pressable>
      </View>

      <View className="px-4 py-4">
        <Text className="text-base font-t3-bold leading-tight text-foreground" selectable>
          {view.basis.question}
        </Text>
        {basisOpen ? (
          <View className="mt-3 border-y border-border py-3">
            <Text className="text-xs leading-relaxed text-foreground-muted">
              Foregrounds {view.basis.foregrounds.join(" · ")}
            </Text>
            <Text className="mt-1 text-xs leading-relaxed text-foreground-muted">
              Omits {view.basis.omits.join(" · ")}
            </Text>
          </View>
        ) : null}

        {view.regions.map((region) => {
          const statements = region.statementIds
            .flatMap((id) => {
              const statement = view.statements.find((candidate) => candidate.id === id);
              return statement ? [statement] : [];
            })
            .slice(0, 3);
          if (statements.length === 0) return null;
          return (
            <View key={region.id} className="mt-4">
              <Text className="mb-2 text-2xs font-t3-bold uppercase tracking-wide text-foreground-muted">
                {region.title}
              </Text>
              {statements.map((statement) => (
                <Pressable
                  key={statement.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedId === statement.id }}
                  className={`mb-px border-l-2 px-3 py-3 ${
                    selectedId === statement.id
                      ? "border-foreground bg-foreground/10"
                      : "border-border bg-foreground/[0.03]"
                  }`}
                  onPress={() =>
                    setSelectedId((current) => (current === statement.id ? null : statement.id))
                  }
                >
                  <Text className="text-2xs font-t3-bold uppercase tracking-wide text-foreground-muted">
                    {EPISTEMIC_LABEL[statement.epistemicState]}
                  </Text>
                  <Text className="mt-1 text-sm font-t3-bold text-foreground" selectable>
                    {statement.title}
                  </Text>
                  {statement.body ? (
                    <Text
                      className="mt-1 text-xs leading-relaxed text-foreground-muted"
                      numberOfLines={3}
                    >
                      {statement.body}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          );
        })}
      </View>

      {selected ? (
        <View className="flex-row items-center gap-3 border-t border-border px-4 py-3">
          <Text className="min-w-0 flex-1 text-xs text-foreground-muted" numberOfLines={1}>
            {selected.title}
          </Text>
          {source?.uri?.startsWith("http") ? (
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(source.uri!)}>
              <Text className="text-xs font-t3-bold text-foreground-muted">Source</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            className="bg-foreground px-3 py-2"
            onPress={() =>
              props.onUse(
                `View selection · ${selected.title}\nSources: ${selected.sourceIds.join(", ")}\nView: ${view.id} · revision ${view.sourceRevision}`,
              )
            }
          >
            <Text className="text-xs font-t3-bold text-background">Use in next message</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function viewLabel(representation: string): string {
  return representation === "possibility"
    ? "Possible worlds"
    : representation.charAt(0).toUpperCase() + representation.slice(1);
}
