import type { EnvironmentId } from "@croki/contracts";
import { CROKI_APPLICATION_RELATIVE_PATH } from "@croki/shared/crokiApplication";
import { crokiConceptRelativePath } from "@croki/shared/crokiConcepts";
import { ArrowRight } from "lucide-react";

import { conceptIdsFromEntries } from "~/components/chat/CrokiConceptControl.logic";
import {
  useProjectEntriesQuery,
  useProjectFileQuery,
} from "~/components/files/projectFilesQueryState";
import { CrokiApplicationVisual } from "./CrokiApplicationVisual";
import { conceptStatusLabel, CrokiConceptVisual } from "./CrokiConceptVisual";
import { parseCrokiVisualObject } from "./CrokiObjectSurface.logic";
import { CrokiReleaseVisual } from "./CrokiReleaseVisual";
import { CrokiVentureVisual } from "./CrokiVentureVisual";

export function CrokiObjectSurface(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly relativePath: string;
  readonly contents: string;
  readonly onOpenFile: (relativePath: string) => void;
  readonly onInspectSource: () => void;
  readonly onShapeApplication?: (() => void) | undefined;
}) {
  const object = parseCrokiVisualObject(props.contents);
  const entries = useProjectEntriesQuery(props.environmentId, props.cwd);
  const releasePath =
    object.kind === "application" ? (object.application.activeRelease ?? null) : null;
  const venturePath = object.kind === "application" ? (object.application.venture ?? null) : null;
  const releaseQuery = useProjectFileQuery(
    props.environmentId,
    props.cwd,
    releasePath,
    releasePath !== null,
  );
  const ventureQuery = useProjectFileQuery(
    props.environmentId,
    props.cwd,
    venturePath,
    venturePath !== null,
  );
  const conceptIds =
    object.kind === "application" && props.relativePath === CROKI_APPLICATION_RELATIVE_PATH
      ? conceptIdsFromEntries(entries.data?.entries ?? [])
      : [];

  if (object.kind === "invalid") {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-base font-medium text-foreground">This .croki object is invalid</h1>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">
            Croki cannot generate its application view. Inspect the source to repair the object;
            normal coding work remains available.
          </p>
          <button
            type="button"
            onClick={props.onInspectSource}
            className="mt-5 text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Open as Source
          </button>
        </div>
      </div>
    );
  }

  if (object.kind === "concept") {
    return (
      <CrokiConceptVisual
        concept={object.concept}
        onOpenParent={() => props.onOpenFile(CROKI_APPLICATION_RELATIVE_PATH)}
      />
    );
  }

  if (object.kind === "release") {
    return (
      <CrokiReleaseVisual
        release={object.release}
        onOpenParent={() => props.onOpenFile(CROKI_APPLICATION_RELATIVE_PATH)}
      />
    );
  }

  if (object.kind === "venture") return <CrokiVentureVisual venture={object.venture} />;

  return (
    <CrokiApplicationVisual
      application={object.application}
      onShapeApplication={props.onShapeApplication}
      parentScopes={
        releasePath || venturePath ? (
          <>
            <ScopeReference
              path={releasePath}
              contents={releaseQuery.data?.contents}
              onOpen={props.onOpenFile}
            />
            <ScopeReference
              path={venturePath}
              contents={ventureQuery.data?.contents}
              onOpen={props.onOpenFile}
            />
          </>
        ) : undefined
      }
      concepts={
        conceptIds.length > 0 ? (
          conceptIds.map((id) => (
            <CrokiConceptMapNode
              key={id}
              environmentId={props.environmentId}
              cwd={props.cwd}
              id={id}
              onOpen={props.onOpenFile}
            />
          ))
        ) : entries.isPending ? (
          <p className="text-xs text-muted-foreground">Discovering Concepts…</p>
        ) : entries.error ? (
          <p className="text-xs text-amber-400">Concepts are temporarily unavailable.</p>
        ) : null
      }
    />
  );
}

function ScopeReference(props: {
  readonly path: string | null;
  readonly contents: string | undefined;
  readonly onOpen: (relativePath: string) => void;
}) {
  if (!props.path || !props.contents) return null;
  const path = props.path;
  const parsed = parseCrokiVisualObject(props.contents);
  const title =
    parsed.kind === "release"
      ? parsed.release.release.name
      : parsed.kind === "venture"
        ? parsed.venture.venture.name
        : null;
  const description =
    parsed.kind === "release"
      ? parsed.release.intent
      : parsed.kind === "venture"
        ? parsed.venture.venture.thesis
        : null;
  if (!title || !description) return null;
  return (
    <button
      type="button"
      onClick={() => props.onOpen(path)}
      className="border border-white/10 p-5 text-left transition-colors hover:border-white/30 hover:bg-white/[0.025]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-white">{title}</span>
        <ArrowRight className="size-3.5 text-zinc-600" aria-hidden />
      </div>
      <p className="mt-3 line-clamp-2 text-xs leading-5 text-zinc-500">{description}</p>
    </button>
  );
}

function CrokiConceptMapNode(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly id: string;
  readonly onOpen: (relativePath: string) => void;
}) {
  const relativePath = crokiConceptRelativePath(props.id);
  const query = useProjectFileQuery(props.environmentId, props.cwd, relativePath);
  const parsed = query.data ? parseCrokiVisualObject(query.data.contents) : null;
  const concept = parsed?.kind === "concept" ? parsed.concept : null;

  return (
    <button
      type="button"
      disabled={!concept}
      onClick={() => props.onOpen(relativePath)}
      className="relative min-h-28 border border-white/10 px-4 py-4 text-left transition-colors hover:border-white/30 hover:bg-white/[0.025] disabled:cursor-default disabled:hover:border-white/10 disabled:hover:bg-transparent"
    >
      <span
        className="absolute -top-3 left-1/2 hidden h-3 w-px -translate-x-1/2 bg-white/15 lg:block"
        aria-hidden
      />
      {concept ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium text-white">{concept.concept.name}</span>
            <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-zinc-600" aria-hidden />
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-500">
            {concept.concept.intent}
          </p>
          <p className="mt-4 text-[10px] text-zinc-600">{conceptStatusLabel(concept)}</p>
        </>
      ) : (
        <p className="text-xs text-zinc-600">
          {query.isPending ? `Opening ${props.id}…` : `${props.id} is unavailable`}
        </p>
      )}
    </button>
  );
}
