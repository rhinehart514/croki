import type {
  CurrentRealityFact,
  CurrentRealityProjection,
  ThreadEvidenceProvenance,
  TurnResultFact,
  TurnResultProjection,
} from "@croki/client-runtime/state/thread-evidence";
import { Pressable, ScrollView, View } from "react-native";
import type { ReactNode } from "react";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { useThemeColor } from "../../lib/useThemeColor";
import {
  EVIDENCE_SECTION_LABELS,
  EVIDENCE_SECTION_ORDER,
  evidenceFactStateLabel,
  factStateClassName,
  groupTurnResultFacts,
  TURN_RESULT_LABELS,
  TURN_RESULT_ORDER,
  turnResultStatusLabel,
} from "./threadEvidencePresentation";

export interface ThreadEvidenceCardsProps {
  readonly reality: CurrentRealityProjection | null;
  readonly turnResult: TurnResultProjection | null;
  readonly onOpenSource: (source: ThreadEvidenceProvenance) => void;
  readonly onDismissReality: (() => void) | null;
}

/**
 * Native, compact rendering of the shared source-grounded projections. The
 * cards are deliberately ordinary Thread content: they do not create a
 * dashboard, a second status model, or a separate navigation destination.
 */
export function ThreadEvidenceCards(props: ThreadEvidenceCardsProps) {
  return (
    <>
      {props.reality !== null ? (
        <CurrentRealityCard
          reality={props.reality}
          onDismiss={props.onDismissReality}
          onOpenSource={props.onOpenSource}
        />
      ) : null}
      {props.turnResult !== null ? (
        <TurnResultCard result={props.turnResult} onOpenSource={props.onOpenSource} />
      ) : null}
    </>
  );
}

export function CurrentRealityCard(props: {
  readonly reality: CurrentRealityProjection;
  readonly onDismiss: (() => void) | null;
  readonly onOpenSource: (source: ThreadEvidenceProvenance) => void;
}) {
  return (
    <EvidenceCard>
      <EvidenceCardHeader
        eyebrow="Mid-work entry"
        title="Current reality"
        detail="Source-grounded facts from this Thread and its existing evidence."
        onDismiss={props.onDismiss}
      />
      <ScrollView
        nestedScrollEnabled
        contentContainerStyle={{ gap: 16, paddingHorizontal: 16, paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        style={{ maxHeight: 340 }}
      >
        {EVIDENCE_SECTION_ORDER.map((section) => {
          const facts = props.reality.sections[section];
          if (facts.length === 0) return null;
          return (
            <EvidenceSection key={section} label={EVIDENCE_SECTION_LABELS[section]}>
              {facts.map((fact) => (
                <EvidenceFactRow key={fact.id} fact={fact} onOpenSource={props.onOpenSource} />
              ))}
            </EvidenceSection>
          );
        })}
      </ScrollView>
    </EvidenceCard>
  );
}

export function TurnResultCard(props: {
  readonly result: TurnResultProjection;
  readonly onOpenSource: (source: ThreadEvidenceProvenance) => void;
}) {
  const grouped = groupTurnResultFacts(props.result.facts);
  return (
    <EvidenceCard>
      <EvidenceCardHeader
        eyebrow="Croki evidence"
        title="Turn result"
        detail={turnResultStatusLabel(props.result.status)}
      />
      <View className="gap-4 px-4 pb-4">
        {TURN_RESULT_ORDER.map((kind) => {
          const facts = grouped.get(kind) ?? [];
          if (facts.length === 0) return null;
          return (
            <EvidenceSection key={kind} label={TURN_RESULT_LABELS[kind]}>
              {facts.map((fact) => (
                <EvidenceFactRow
                  key={fact.id}
                  fact={fact}
                  onOpenSource={props.onOpenSource}
                  attributedTo={fact.attributedTo}
                />
              ))}
            </EvidenceSection>
          );
        })}
      </View>
    </EvidenceCard>
  );
}

function EvidenceCard(props: { readonly children: ReactNode }) {
  return (
    <View className="mx-3 mb-3 overflow-hidden rounded-2xl border border-border bg-card">
      {props.children}
    </View>
  );
}

function EvidenceCardHeader(props: {
  readonly eyebrow: string;
  readonly title: string;
  readonly detail: string;
  readonly onDismiss?: (() => void) | null;
}) {
  const iconSubtleColor = useThemeColor("--color-icon-subtle");
  return (
    <View className="flex-row items-start justify-between gap-3 border-b border-border px-4 py-3">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-[10px] font-t3-bold uppercase tracking-[1.3px] text-foreground-muted">
          {props.eyebrow}
        </Text>
        <Text className="text-base font-t3-bold text-foreground">{props.title}</Text>
        <Text className="text-xs leading-4 text-foreground-muted">{props.detail}</Text>
      </View>
      {props.onDismiss ? (
        <Pressable
          accessibilityLabel="Dismiss current reality"
          accessibilityRole="button"
          hitSlop={8}
          onPress={props.onDismiss}
          className="size-9 items-center justify-center rounded-full bg-subtle"
        >
          <SymbolView name="xmark" size={14} tintColor={iconSubtleColor} type="monochrome" />
        </Pressable>
      ) : null}
    </View>
  );
}

function EvidenceSection(props: { readonly label: string; readonly children: ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="text-[10px] font-t3-bold uppercase tracking-[1.1px] text-foreground-muted">
        {props.label}
      </Text>
      <View className="overflow-hidden rounded-xl border border-border/70 bg-subtle/45">
        {props.children}
      </View>
    </View>
  );
}

function EvidenceFactRow(props: {
  readonly fact: CurrentRealityFact | TurnResultFact;
  readonly onOpenSource: (source: ThreadEvidenceProvenance) => void;
  readonly attributedTo?: "provider" | "environment";
}) {
  const { fact } = props;
  const iconSubtleColor = useThemeColor("--color-icon-subtle");
  return (
    <View className="flex-row items-start gap-3 border-b border-border/60 px-3 py-2.5 last:border-b-0">
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
          <Text className="text-xs font-t3-bold text-foreground">{fact.label}</Text>
          {props.attributedTo === "provider" ? (
            <Text className="text-[10px] font-t3-medium uppercase text-foreground-muted">
              provider-reported
            </Text>
          ) : null}
          {fact.state !== "observed" ? (
            <Text className={`text-[10px] font-t3-medium uppercase ${factStateClassName(fact)}`}>
              {evidenceFactStateLabel(fact.state)}
            </Text>
          ) : null}
        </View>
        <Text selectable className="text-xs leading-5 text-foreground">
          {fact.value}
        </Text>
        {fact.detail ? (
          <Text selectable className="text-[11px] leading-4 text-foreground-muted">
            {fact.detail}
          </Text>
        ) : null}
        <Text className="mt-0.5 text-[10px] leading-4 text-foreground-muted">
          Source: {fact.source.label}
          {fact.supportingSources && fact.supportingSources.length > 0
            ? ` + ${fact.supportingSources.length} more`
            : ""}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={`Open source: ${fact.source.label}`}
        accessibilityRole="button"
        hitSlop={6}
        onPress={() => props.onOpenSource(fact.source)}
        className="mt-0.5 min-h-8 flex-row items-center gap-1 rounded-full bg-subtle px-2.5"
      >
        <Text className="text-[11px] font-t3-bold text-foreground-muted">Open</Text>
        <SymbolView name="arrow.up.right" size={11} tintColor={iconSubtleColor} type="monochrome" />
      </Pressable>
    </View>
  );
}
