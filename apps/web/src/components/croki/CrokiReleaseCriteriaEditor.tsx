import {
  CROKI_RELEASE_CRITERION_STATUSES,
  CROKI_RELEASE_LIMITS,
  type CrokiReleaseCriterion,
  type CrokiReleaseCriterionStatus,
} from "@croki/shared/crokiReleaseCandidate";
import type { CrokiContextReference } from "@croki/shared/crokiContext";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { CrokiCanvasReferences } from "./CrokiCanvasReferences";
import type { CrokiCanvasModelError } from "./crokiCanvasModel";

const STATUS_LABEL: Readonly<Record<CrokiReleaseCriterionStatus, string>> = {
  pending: "Pending",
  passed: "Passed",
  failed: "Failed",
};

export function CrokiReleaseCriteriaEditor(props: {
  readonly criteria: readonly CrokiReleaseCriterion[];
  readonly onAdd: () => void;
  readonly onAddReference: (
    criterionId: string,
    reference: CrokiContextReference,
  ) => CrokiCanvasModelError | null;
  readonly onDelete: (criterionId: string) => void;
  readonly onOpenReference?: (reference: CrokiContextReference) => void;
  readonly onRemoveReference: (criterionId: string, reference: CrokiContextReference) => void;
  readonly onUpdate: (
    criterionId: string,
    patch: Partial<Pick<CrokiReleaseCriterion, "text" | "status">>,
  ) => void;
}) {
  return (
    <section className="space-y-3" aria-label="Acceptance criteria">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
            Acceptance
          </p>
          <p className="mt-1 text-[11px] leading-4 text-zinc-600">
            Verification requires every criterion to pass.
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={props.onAdd}
          disabled={props.criteria.length >= CROKI_RELEASE_LIMITS.criteriaPerItem}
        >
          <Plus className="size-3.5" aria-hidden />
          Criterion
        </Button>
      </div>

      {props.criteria.length > 0 ? (
        <div className="divide-y divide-white/10 border-y border-white/10">
          {props.criteria.map((criterion) => (
            <div key={criterion.id} className="space-y-3 py-3">
              <div className="grid grid-cols-[6rem_minmax(0,1fr)_auto] items-start gap-2">
                <select
                  aria-label={`Status for ${criterion.text}`}
                  className="h-8 border border-white/15 bg-black px-2 text-[11px] text-zinc-300"
                  value={criterion.status}
                  onChange={(event) =>
                    props.onUpdate(criterion.id, {
                      status: event.target.value as CrokiReleaseCriterionStatus,
                    })
                  }
                >
                  {CROKI_RELEASE_CRITERION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
                <Input
                  className="h-8 border-white/15 bg-black text-xs"
                  aria-label="Acceptance criterion"
                  maxLength={CROKI_RELEASE_LIMITS.criterionTextChars}
                  value={criterion.text}
                  onChange={(event) => props.onUpdate(criterion.id, { text: event.target.value })}
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${criterion.text}`}
                  onClick={() => props.onDelete(criterion.id)}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </Button>
              </div>
              <details className="border-l border-white/10 pl-3">
                <summary className="cursor-pointer text-[10px] text-zinc-600 hover:text-zinc-300">
                  Evidence {criterion.references?.length ?? 0}
                </summary>
                <div className="pt-3">
                  <CrokiCanvasReferences
                    references={criterion.references ?? []}
                    onAdd={(reference) => props.onAddReference(criterion.id, reference)}
                    onRemove={(reference) => props.onRemoveReference(criterion.id, reference)}
                    {...(props.onOpenReference ? { onOpenReference: props.onOpenReference } : {})}
                  />
                </div>
              </details>
            </div>
          ))}
        </div>
      ) : (
        <p className="border-l border-white/10 px-3 py-2 text-xs text-zinc-600">
          Add observable proof before calling this work verified.
        </p>
      )}
    </section>
  );
}
