import { AlertCircle, CircleDot, Clock3, PackageCheck, Plus } from "lucide-react";
import type { ReleaseIndex, ReleaseSummary, SavedView, SystemIndex, SystemIndexObject, WorkIndex, WorkIndexItem } from "@/api";
import { ThreadList } from "@/components/thread/ThreadList";
import type { SystemScope } from "@/components/system-mode/SystemWorkspace";
import type { WorkspaceMode } from "@/lib/venture-session";
import { ProductSavedViews } from "./ProductSavedViews";

const PRODUCT_SCOPES: Array<{ id: SystemScope; label: string }> = [
  { id: "system", label: "Whole venture" },
  { id: "product", label: "Product" },
  { id: "gtm", label: "Go-to-market" },
  { id: "attention", label: "Needs attention" },
];

function ProductRail({ index, scope, selectedRef, search, savedViews, readOnlyReason, savedViewsError, onScope, onSelect, onSaveView, onReopenView, onDeleteView }: {
  index: SystemIndex | null;
  scope: SystemScope;
  selectedRef: string | null;
  search: string;
  onScope: (scope: SystemScope) => void;
  onSelect: (object: SystemIndexObject) => void;
  savedViews: SavedView[];
  readOnlyReason: string | null;
  savedViewsError: string | null;
  onSaveView: () => Promise<void>;
  onReopenView: (view: SavedView) => Promise<string>;
  onDeleteView: (view: SavedView) => Promise<void>;
}) {
  const needle = search.trim().toLowerCase();
  const matches = needle ? (index?.objects ?? []).filter((object) => `${object.name} ${object.statement} ${object.type}`.toLowerCase().includes(needle)).slice(0, 20) : [];
  const selected = index?.objects.find((object) => object.objectRef === selectedRef) ?? null;
  return <div className="mode-rail-body product-rail-body">
    <nav aria-label="Product and go-to-market scopes">
      {PRODUCT_SCOPES.map(({ id, label }) => <button type="button" key={id} aria-current={scope === id ? "page" : undefined} onClick={() => onScope(id)}><span>{label}</span>{id === "attention" && index?.counts.attention ? <small>{index.counts.attention}</small> : null}</button>)}
    </nav>
    {needle ? <section aria-label="Product and go-to-market search results"><h2>Results</h2>{matches.length ? matches.map((object) => <button type="button" key={object.objectRef} aria-current={selectedRef === object.objectRef ? "true" : undefined} onClick={() => onSelect(object)}><strong>{object.name}</strong><small>{object.territory === "gtm" ? "Go-to-market" : "Product"}</small></button>) : <p>No matching Product / GTM context.</p>}</section> : selected ? <section aria-label="Selected Product and go-to-market context"><h2>Selected</h2><button type="button" aria-current="true" onClick={() => onSelect(selected)}><strong>{selected.name}</strong><small>{selected.territory === "gtm" ? "Go-to-market" : "Product"}</small></button></section> : <p className="mode-rail-hint">Select a capability, audience, offer, path, or gap on the canvas.</p>}
    {!needle ? <ProductSavedViews views={savedViews} canSave={Boolean(selected && !selected.projectionOnly)} disabledReason={readOnlyReason} loadError={savedViewsError} onSave={onSaveView} onReopen={onReopenView} onDelete={onDeleteView} /> : null}
  </div>;
}

function ReleaseGroup({ title, icon: Icon, releases, selectedId, onSelect }: {
  title: string;
  icon: typeof AlertCircle;
  releases: ReleaseSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!releases.length) return null;
  return <section className="release-rail-group"><h2><Icon aria-hidden="true" />{title}</h2>{releases.map((release) => <button type="button" key={release.id} aria-current={selectedId === release.id ? "true" : undefined} onClick={() => onSelect(release.id)}><strong>{release.name}</strong><small>{release.statement || (release.lifecycle === "in-market" ? "Watching for evidence" : "Release context incomplete")}</small></button>)}</section>;
}

function ReleasesRail({ index, selectedId, search, canStart, onSelect, onStart }: {
  index: ReleaseIndex | null;
  selectedId: string | null;
  search: string;
  canStart: boolean;
  onSelect: (id: string) => void;
  onStart: () => void;
}) {
  const needle = search.trim().toLowerCase();
  const all = (index?.releases ?? []).filter((release) => !needle || `${release.name} ${release.statement}`.toLowerCase().includes(needle));
  const needsYou = all.filter((release) => release.attention.length > 0);
  const preparing = all.filter((release) => release.lifecycle === "draft" && release.attention.length === 0);
  const inMarket = all.filter((release) => release.lifecycle === "in-market" && release.attention.length === 0);
  const recent = all.filter((release) => release.lifecycle === "ended");
  return <div className="mode-rail-body releases-rail-body">
    <button type="button" className="thread-new" disabled={!canStart} title={canStart ? "Prepare a release from the selected work or Product / GTM context" : "Select exact Work or Product / GTM context before preparing a release"} onClick={onStart}><Plus aria-hidden="true" />Prepare release</button>
    {!all.length ? <p className="mode-rail-hint">{needle ? "No matching releases." : "No releases yet. Select exact Work or Product / GTM context to begin."}</p> : null}
    <ReleaseGroup title="Needs you" icon={AlertCircle} releases={needsYou} selectedId={selectedId} onSelect={onSelect} />
    <ReleaseGroup title="Preparing" icon={Clock3} releases={preparing} selectedId={selectedId} onSelect={onSelect} />
    <ReleaseGroup title="In market" icon={CircleDot} releases={inMarket} selectedId={selectedId} onSelect={onSelect} />
    <ReleaseGroup title="Recent" icon={PackageCheck} releases={recent} selectedId={selectedId} onSelect={onSelect} />
  </div>;
}

export function WorkspaceRailBody({ mode, workIndex, selectedThread, systemIndex, scope, selectedObjectRef, savedViews, savedViewsError, readOnlyReason, releaseIndex, selectedReleaseId, search, canStartRelease, onSelectThread, onScope, onSelectObject, onSelectRelease, onNewThread, onStartRelease, onSaveView, onReopenView, onDeleteView }: {
  mode: WorkspaceMode;
  workIndex: WorkIndex | null;
  selectedThread: string | null;
  systemIndex: SystemIndex | null;
  scope: SystemScope;
  selectedObjectRef: string | null;
  savedViews: SavedView[];
  savedViewsError: string | null;
  readOnlyReason: string | null;
  releaseIndex: ReleaseIndex | null;
  selectedReleaseId: string | null;
  search: string;
  canStartRelease: boolean;
  onSelectThread: (item: WorkIndexItem) => void;
  onScope: (scope: SystemScope) => void;
  onSelectObject: (object: SystemIndexObject) => void;
  onSelectRelease: (id: string) => void;
  onNewThread: () => void;
  onStartRelease: () => void;
  onSaveView: () => Promise<void>;
  onReopenView: (view: SavedView) => Promise<string>;
  onDeleteView: (view: SavedView) => Promise<void>;
}) {
  if (mode === "work") return <><button type="button" className="thread-new" onClick={onNewThread}><Plus aria-hidden="true" />New thread</button><ThreadList workIndex={workIndex} search={search} selected={selectedThread} onSelect={onSelectThread} /></>;
  if (mode === "system") return <ProductRail index={systemIndex} scope={scope} selectedRef={selectedObjectRef} search={search} savedViews={savedViews} readOnlyReason={readOnlyReason} savedViewsError={savedViewsError} onScope={onScope} onSelect={onSelectObject} onSaveView={onSaveView} onReopenView={onReopenView} onDeleteView={onDeleteView} />;
  return <ReleasesRail index={releaseIndex} selectedId={selectedReleaseId} search={search} canStart={canStartRelease} onSelect={onSelectRelease} onStart={onStartRelease} />;
}
