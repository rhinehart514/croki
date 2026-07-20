import { useCallback, useEffect, useRef, useState } from "react";
import { deleteSavedView, listSavedViews, reopenSavedView, saveLiveView, type SavedView, type SystemIndex, type SystemIndexObject } from "@/api";
import type { Viewport } from "@xyflow/react";
import type { SystemScope } from "@/components/system-mode/SystemWorkspace";

const SCOPES = new Set<SystemScope>(["system", "product", "gtm", "attention"]);

export function useSavedSystemViews({ ventureId, index, selected, scope, onScope, onSelect, onCamera }: {
  ventureId: string;
  index: SystemIndex | null;
  selected: SystemIndexObject | null;
  scope: SystemScope;
  onScope: (scope: SystemScope) => void;
  onSelect: (object: SystemIndexObject) => void;
  onCamera: (camera: Viewport | null) => void;
}) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    const version = ++requestVersion.current;
    void listSavedViews(ventureId).then((result) => {
      if (version === requestVersion.current) { setViews(result.views); setLoadError(null); }
    }).catch((error) => {
      if (version === requestVersion.current) setLoadError(error instanceof Error ? error.message : String(error));
    });
    return () => { requestVersion.current += 1; };
  }, [ventureId]);

  const save = useCallback(async () => {
    if (!index || !selected || selected.projectionOnly) throw new Error("Select a canonical Product / GTM object before saving this view.");
    const connections = index.relationships.filter((entry) => !entry.projectionOnly && (entry.fromRef.endsWith(`:${selected.id}`) || entry.toRef.endsWith(`:${selected.id}`)));
    const canonicalRefs = new Set(index.objects.filter((entry) => !entry.projectionOnly).map((entry) => entry.objectRef));
    const rootRefs = [...new Set([selected.objectRef, ...connections.flatMap((entry) => [entry.fromRef, entry.toRef])])].filter((ref) => canonicalRefs.has(ref));
    const { view } = await saveLiveView(ventureId, { name: selected.name, arrangement: scope, rootRefs, relationshipRefs: connections.map((entry) => entry.relationshipRef) });
    requestVersion.current += 1;
    setViews((current) => [view, ...current.filter((entry) => entry.id !== view.id)]);
    setLoadError(null);
  }, [index, scope, selected, ventureId]);

  const reopen = useCallback(async (view: SavedView) => {
    const result = (await reopenSavedView(ventureId, view.id)).reopened;
    const refs = result.rootRefs ?? result.view.spec?.rootRefs ?? [];
    const target = refs.map((ref) => index?.objects.find((entry) => entry.objectRef === ref)).find(Boolean);
    if (!target) throw new Error("This saved view no longer has a directly linked Product / GTM object to open.");
    const arrangement = result.arrangement ?? result.view.arrangement;
    if (SCOPES.has(arrangement as SystemScope)) onScope(arrangement as SystemScope);
    onCamera(null);
    onSelect(target);
    if (result.view.kind === "snapshot" && result.intact === false) return "Snapshot opened with stale or missing sources shown honestly.";
    return `${result.view.kind === "snapshot" ? "Snapshot" : "View"} reopened from current venture truth.`;
  }, [index?.objects, onCamera, onScope, onSelect, ventureId]);

  const remove = useCallback(async (view: SavedView) => {
    await deleteSavedView(ventureId, view.id);
    requestVersion.current += 1;
    setViews((current) => current.filter((entry) => entry.id !== view.id));
  }, [ventureId]);

  return { views, loadError, save, reopen, remove };
}
