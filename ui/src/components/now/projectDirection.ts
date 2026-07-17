// One shared per-direction derivation. The legacy WorkDetail stack and every registered representation
// read the SAME durable-truth projection from here, so they can never diverge. Pure and presentation-free
// (no JSX): it folds the venture snapshot + live drives + wall + architecture projection into the exact
// values a representation renders — member bets, the live drive, waiting decisions, returned outcomes,
// working-result previews, exact repository changes, cross-venture impact, and collapsed machinery. This
// is the anti-progress-theater floor: a representation is only offered when its slice of this truth exists.
import type { FirmActiveDrive, WallQueueItemView } from "@/api";
import type { FirmArchitectureProjection, FirmBet, FirmLens, FirmOutcome } from "@/types";
import { resolveStagedArtifact } from "./reviewArtifact";
import { buildDirectionImpact, type ImpactLine } from "./directionImpact";
import type { Direction } from "./directionModel";

const str = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

export type PreviewEntry = {
  title: string | null;
  artifact: Extract<ReturnType<typeof resolveStagedArtifact>, { kind: "preview" }>;
};

export type ExactChange = {
  key: string;
  title: string | null;
  diff: string;
  stat: string | null;
  tests: string | null;
  preview: string | null;
  repository: string | null;
};

// The single derived value object a representation renders over. Every field is projected from real
// durable truth held by the lens/drives/wall/projection — never fabricated.
export type DirectionRenderContext = {
  ventureId: string;
  direction: Direction;
  lens: FirmLens;
  memberBets: FirmBet[];
  drives: FirmActiveDrive[];
  drive: FirmActiveDrive | null;
  waiting: WallQueueItemView[];
  outcomes: FirmOutcome[];
  previews: PreviewEntry[];
  exactChanges: ExactChange[];
  impact: ImpactLine[];
  learning: string | null;
  machinery: Array<[string, string]>;
};

function machineryRows(bets: FirmBet[], drive: FirmActiveDrive | null, approaches: number): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  if (approaches > 1) rows.push(["Approaches", String(approaches)]);
  const agent = bets[0]?.teammateRef ?? drive?.teammateRef;
  if (agent) rows.push(["Agent", agent]);
  if (drive?.runtime) rows.push(["Runtime", drive.runtime]);
  const steps = bets.reduce((sum, bet) => sum + (bet.events?.length ?? 0), 0);
  if (steps > 0) rows.push(["Steps", String(steps)]);
  const cost = bets.flatMap((bet) => bet.events ?? []).reduce((sum, event) => sum + (event.costUsd ?? 0), 0);
  if (cost > 0) rows.push(["Cost", `$${cost.toFixed(2)}`]);
  const revision = bets.find((bet) => bet.configurationRevision != null)?.configurationRevision;
  if (revision != null) rows.push(["Venture revision", `v${revision}`]);
  return rows;
}

function productChangeMeta(effect: Record<string, unknown>): Omit<ExactChange, "key" | "diff"> {
  const tests = str(effect.tests) ?? (effect.testsPassed === true ? "Tests passed" : effect.testsPassed === false ? "Tests failed" : null);
  return {
    title: str(effect.title) ?? str(effect.intent),
    stat: str(effect.diffStat) ?? str(effect.summary),
    tests,
    preview: str(effect.preview) ?? str(effect.previewUrl) ?? str(effect.previewPath),
    repository: str(effect.repository) ?? str(effect.repo),
  };
}

/**
 * Lift WorkDetail's per-direction derivation into one reusable projection. Behavior is verbatim: own-set
 * filter over lens bets, staged content split into diffs vs previews, product-change wall items contribute
 * their exact diff (deduped by diff text), impact via the architecture projection, machinery collapsed.
 */
export function projectDirection(
  ventureId: string,
  direction: Direction,
  lens: FirmLens,
  wallItems: WallQueueItemView[],
  activeDrives: FirmActiveDrive[],
  projection: FirmArchitectureProjection | null,
): DirectionRenderContext {
  const own = new Set(direction.betIds);
  const memberBets = lens.bets.filter((bet) => own.has(bet.id));
  const drives = activeDrives.filter((entry) => direction.activeDriveIds.includes(entry.id));
  const drive = drives[0] ?? null;
  const waiting = wallItems.filter((item) => direction.waitingWallItemIds.includes(item.id) && item.decision === null);

  // Split staged work into working-result previews and exact code changes. Product-change wall items
  // contribute their exact diff too, deduped by diff text so it is shown once.
  const previews: PreviewEntry[] = [];
  const changeByDiff = new Map<string, ExactChange>();
  for (const bet of memberBets) {
    for (const staged of bet.staged ?? []) {
      const resolved = resolveStagedArtifact(staged.content);
      if (!resolved) continue;
      if (resolved.kind === "diff") {
        changeByDiff.set(resolved.diff, { key: resolved.diff.slice(0, 40), title: staged.title ?? null, diff: resolved.diff, stat: resolved.stat, tests: null, preview: null, repository: null });
      } else {
        previews.push({ title: staged.title ?? null, artifact: resolved });
      }
    }
  }
  for (const item of waiting) {
    if (String(item.effect.kind ?? "").toLowerCase() !== "product-change") continue;
    const diff = str(item.effect.diff) ?? str(item.effect.patch) ?? str(item.effect.artifact);
    if (!diff) continue;
    changeByDiff.set(diff, { key: diff.slice(0, 40), diff, ...productChangeMeta(item.effect) });
  }
  const exactChanges = [...changeByDiff.values()];

  const outcomes = (lens.outcomes ?? []).filter((outcome) => outcome.betId && own.has(outcome.betId));
  const impact = buildDirectionImpact(direction.betIds, lens, projection);
  const learning = memberBets.map((bet) => bet.learning).find((value): value is string => Boolean(value)) ?? null;
  const machinery = machineryRows(memberBets, drive, direction.approaches);

  return { ventureId, direction, lens, memberBets, drives, drive, waiting, outcomes, previews, exactChanges, impact, learning, machinery };
}
