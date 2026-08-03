import { ArrowRight, Check, ExternalLink, GitBranch } from "lucide-react";

import { Button } from "../ui/button";
import type { CrokiCanvasLiveObject } from "./crokiCanvasLiveScene";

interface CrokiTrueCanvasInspectorProps {
  readonly objects: readonly CrokiCanvasLiveObject[];
  readonly onOpen: (object: CrokiCanvasLiveObject) => void;
  readonly onUse: () => void;
  readonly onApprove?: () => void;
  readonly onChooseBranch?: (artifact: NonNullable<CrokiCanvasLiveObject["artifact"]>) => void;
}

/** Ephemeral source and authority details for the current Canvas selection. */
export function CrokiTrueCanvasInspector(props: CrokiTrueCanvasInspectorProps) {
  const object = props.objects[0];
  if (!object) return null;

  const canUse = props.objects.some((candidate) => candidate.artifact && candidate.selectionId);
  const canApprove =
    props.onApprove !== undefined &&
    props.objects.some((candidate) => candidate.status === "provisional");
  const branch = props.onChooseBranch
    ? props.objects.find((candidate) => candidate.artifact && candidate.revision)?.artifact
    : undefined;
  const hasSource =
    object.reference || object.sourceThreadId || object.perceptionSourceUri || object.artifact;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Selected perception</p>
        <h2 className="mt-2 text-[18px] leading-6 font-medium text-white">{object.title}</h2>
        {object.body ? (
          <p className="mt-3 text-[12px] leading-5 text-zinc-300">{object.body}</p>
        ) : null}
      </div>
      <dl className="space-y-2 border-y border-white/10 py-3 text-[11px]">
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">Source</dt>
          <dd className="text-right text-zinc-300">{object.source}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-zinc-600">Authority</dt>
          <dd className="text-right text-zinc-300">{object.authority ?? "Observed"}</dd>
        </div>
        {object.status ? (
          <div className="flex justify-between gap-4">
            <dt className="text-zinc-600">State</dt>
            <dd className="text-right text-zinc-300">{object.status}</dd>
          </div>
        ) : null}
      </dl>
      {object.perceptionObjects?.length ? (
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">
            Source observations · {object.perceptionObjects.length}
          </p>
          <ol className="mt-3 divide-y divide-white/10 border-y border-white/10">
            {object.perceptionObjects.slice(0, 8).map((item) => (
              <li key={item.id} className="py-2.5">
                <p className="text-[11px] leading-4 text-zinc-300">{item.title}</p>
                <p className="mt-0.5 text-[9px] uppercase tracking-[0.1em] text-zinc-600">
                  {item.source.kind}
                </p>
              </li>
            ))}
          </ol>
          {object.perceptionObjects.length > 8 ? (
            <p className="mt-2 text-[10px] text-zinc-600">
              {object.perceptionObjects.length - 8} more available to the Thread
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-2">
        {hasSource ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between rounded-none"
            onClick={() => props.onOpen(object)}
          >
            Open source <ArrowRight className="size-3" aria-hidden />
          </Button>
        ) : null}
        {canUse ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between rounded-none"
            onClick={props.onUse}
          >
            Use in Thread <ArrowRight className="size-3" aria-hidden />
          </Button>
        ) : null}
        {canApprove ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between rounded-none"
            onClick={props.onApprove}
          >
            Approve understanding <Check className="size-3" aria-hidden />
          </Button>
        ) : null}
        {branch ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between rounded-none"
            onClick={() => props.onChooseBranch?.(branch)}
          >
            Choose this branch <GitBranch className="size-3" aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
