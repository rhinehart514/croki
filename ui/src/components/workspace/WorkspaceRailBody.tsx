import { useState } from "react";
import { AlertCircle, ChevronDown, CircleDot, Clock3, PackageCheck, Plus, Rocket } from "lucide-react";
import type { ReleaseIndex, ReleaseSummary, SavedView, SystemIndex, SystemIndexObject, WorkIndex, WorkIndexItem } from "@/api";
import { CrewFace } from "@/components/crew/CrewFace";
import type { SystemScope } from "@/components/system-mode/SystemWorkspace";
import { ThreadList } from "@/components/thread/ThreadList";
import type { ProductWorkspaceSection, WorkspaceMode } from "@/lib/venture-session";
import type { FirmConfiguration, FirmCrewMember } from "@/types";
import { AgentCreateDialog } from "./AgentCreateDialog";
import { AgentPurposeDialog } from "./AgentPurposeDialog";
import { CapabilityLogo } from "./CapabilityLogo";
import type { WorkflowCapability } from "./workflowCapabilities";

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

function ReleasesRail({ index, selectedId, search, canStart, embedded = false, onSelect, onStart }: {
  index: ReleaseIndex | null;
  selectedId: string | null;
  search: string;
  canStart: boolean;
  embedded?: boolean;
  onSelect: (id: string) => void;
  onStart: () => void;
}) {
  const needle = search.trim().toLowerCase();
  const all = (index?.releases ?? []).filter((release) => !needle || `${release.name} ${release.statement}`.toLowerCase().includes(needle));
  const needsYou = all.filter((release) => release.attention.length > 0);
  const preparing = all.filter((release) => release.lifecycle === "draft" && release.attention.length === 0);
  const inMarket = all.filter((release) => release.lifecycle === "in-market" && release.attention.length === 0);
  const recent = all.filter((release) => release.lifecycle === "ended");
  return <div className={`${embedded ? "releases-rail-embedded" : "mode-rail-body"} releases-rail-body`}>
    <button type="button" className="thread-new" disabled={!canStart} title={canStart ? "Prepare a release from the selected work or Product / GTM context" : "Select exact Work or Product / GTM context before preparing a release"} onClick={onStart}><Plus aria-hidden="true" />Prepare release</button>
    {!all.length ? <p className="mode-rail-hint">{needle ? "No matching releases." : "No releases yet. Select exact Work or Product / GTM context to begin."}</p> : null}
    <ReleaseGroup title="Needs you" icon={AlertCircle} releases={needsYou} selectedId={selectedId} onSelect={onSelect} />
    <ReleaseGroup title="Preparing" icon={Clock3} releases={preparing} selectedId={selectedId} onSelect={onSelect} />
    <ReleaseGroup title="In market" icon={CircleDot} releases={inMarket} selectedId={selectedId} onSelect={onSelect} />
    <ReleaseGroup title="Recent" icon={PackageCheck} releases={recent} selectedId={selectedId} onSelect={onSelect} />
  </div>;
}

function ProductRail({ ventureId, index, crew, configuration, capabilities, selectedRef, search, readOnlyReason, releaseIndex, selectedReleaseId, canStartRelease, section, onSection, onSelect, onUseAgent, onSelectRelease, onStartRelease, onConfigurationChanged }: {
  ventureId: string;
  index: SystemIndex | null;
  crew: FirmCrewMember[];
  configuration: FirmConfiguration;
  capabilities: WorkflowCapability[];
  selectedRef: string | null;
  search: string;
  readOnlyReason: string | null;
  releaseIndex: ReleaseIndex | null;
  selectedReleaseId: string | null;
  canStartRelease: boolean;
  section: ProductWorkspaceSection;
  onSection: (section: ProductWorkspaceSection) => void;
  onSelect: (object: SystemIndexObject) => void;
  onUseAgent: (ref: string) => void;
  onSelectRelease: (id: string) => void;
  onStartRelease: () => void;
  onConfigurationChanged: () => void;
}) {
  const [inspectedAgentRef, setInspectedAgentRef] = useState<string | null>(null);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [releasesExpanded, setReleasesExpanded] = useState(section === "releases");
  const needle = search.trim().toLowerCase();
  const showReleases = section === "releases" || releasesExpanded || Boolean(needle);
  const matches = needle ? (index?.objects ?? []).filter((object) => `${object.name} ${object.statement} ${object.type}`.toLowerCase().includes(needle)).slice(0, 20) : [];
  const inspectedMember = crew.find((member) => member.ref === inspectedAgentRef) ?? null;
  const inspectedAgent = configuration.agents.find((agent) => agent.ref === inspectedAgentRef) ?? null;
  const workflowNames = inspectedAgentRef ? (index?.objects ?? []).filter((object) => object.type === "pipeline" && Array.isArray(object.properties.agentRefs) && object.properties.agentRefs.map(String).includes(inspectedAgentRef)).map((object) => object.name) : [];
  const releaseCount = releaseIndex?.releases.length ?? 0;

  return <div className="mode-rail-body product-rail-body" data-section={section}>
    <section className="product-release-section" data-expanded={showReleases ? "true" : undefined}>
      <button type="button" className="product-release-toggle" aria-current={section === "releases" ? "page" : undefined} aria-expanded={showReleases} onClick={() => { const next = !showReleases; setReleasesExpanded(next); onSection(next ? "releases" : "canvas"); }}>
        <span><Rocket aria-hidden="true" />Releases</span><small>{releaseCount}</small><ChevronDown aria-hidden="true" />
      </button>
      {showReleases ? <ReleasesRail embedded index={releaseIndex} selectedId={selectedReleaseId} search={search} canStart={canStartRelease} onSelect={onSelectRelease} onStart={onStartRelease} /> : null}
    </section>
    {needle ? <section aria-label="Product and go-to-market search results"><h2>Product / GTM results</h2>{matches.length ? matches.map((object) => <button type="button" key={object.objectRef} aria-current={selectedRef === object.objectRef ? "true" : undefined} onClick={() => onSelect(object)}><strong>{object.name}</strong><small>{object.territory === "gtm" ? "Go-to-market" : "Product"}</small></button>) : <p>No matching Product / GTM context.</p>}</section> : section === "canvas" ? <>
      <section className="product-agent-palette" aria-label="Workflow agents"><h2><span>Agents <small>{crew.length}</small></span><button type="button" onClick={() => setCreatingAgent(true)}><Plus aria-hidden="true" />New</button></h2>{crew.length ? crew.map((member) => { const agent = configuration.agents.find((candidate) => candidate.ref === member.ref); const name = member.soul?.name?.trim() || agent?.name || member.ref; return <button type="button" draggable key={member.ref} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-drover-agent", member.ref); }} onClick={() => setInspectedAgentRef(member.ref)}><CrewFace agentRef={member.ref} size={30} /><span><strong>{name}</strong><small>{agent?.perspective || "Venture-scoped agent; open to inspect authority."}</small></span></button>; }) : <p>No specialists yet. Create one when durable purpose or boundaries will improve repeated work.</p>}</section>
      <section className="product-capability-palette" aria-label="Workflow capabilities"><h2>Capabilities <small>Connected access</small></h2>{capabilities.map((capability) => <button type="button" draggable key={capability.id} data-authority={capability.authority} onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData("application/x-drover-capability", JSON.stringify(capability)); }}><CapabilityLogo capability={capability} /><span><strong>{capability.label}</strong><small>{capability.detail}</small></span><i>{capability.authority === "founder-gate" ? "Gate" : capability.authority === "read" ? "Read" : "Inward"}</i></button>)}</section>
    </> : null}
    {inspectedMember ? <AgentPurposeDialog member={inspectedMember} agent={inspectedAgent} workflowNames={workflowNames} onClose={() => setInspectedAgentRef(null)} onWork={onUseAgent} /> : null}
    {creatingAgent ? <AgentCreateDialog ventureId={ventureId} configuration={configuration} readOnlyReason={readOnlyReason} onClose={() => setCreatingAgent(false)} onCreated={(agent) => { setCreatingAgent(false); setInspectedAgentRef(agent.ref); onConfigurationChanged(); }} /> : null}
  </div>;
}

export function WorkspaceRailBody({ ventureId, mode, workIndex, crew, configuration, capabilities, selectedThread, systemIndex, productSection, selectedObjectRef, readOnlyReason, releaseIndex, selectedReleaseId, search, canStartRelease, onUseAgent, onSelectThread, onProductSection, onSelectObject, onSelectRelease, onStartRelease, onConfigurationChanged }: {
  ventureId: string;
  mode: WorkspaceMode;
  workIndex: WorkIndex | null;
  crew: FirmCrewMember[];
  configuration: FirmConfiguration;
  capabilities: WorkflowCapability[];
  selectedThread: string | null;
  systemIndex: SystemIndex | null;
  productSection: ProductWorkspaceSection;
  scope: SystemScope;
  selectedObjectRef: string | null;
  savedViews: SavedView[];
  savedViewsError: string | null;
  readOnlyReason: string | null;
  releaseIndex: ReleaseIndex | null;
  selectedReleaseId: string | null;
  search: string;
  canStartRelease: boolean;
  onUseAgent: (ref: string) => void;
  onSelectThread: (item: WorkIndexItem) => void;
  onProductSection: (section: ProductWorkspaceSection) => void;
  onScope: (scope: SystemScope) => void;
  onSelectObject: (object: SystemIndexObject) => void;
  onSelectRelease: (id: string) => void;
  onStartRelease: () => void;
  onConfigurationChanged: () => void;
  onSaveView: () => Promise<void>;
  onReopenView: (view: SavedView) => Promise<string>;
  onDeleteView: (view: SavedView) => Promise<void>;
}) {
  if (mode === "work") return <ThreadList workIndex={workIndex} search={search} selected={selectedThread} onSelect={onSelectThread} />;
  if (mode === "system") return <ProductRail ventureId={ventureId} index={systemIndex} crew={crew} configuration={configuration} capabilities={capabilities} selectedRef={selectedObjectRef} search={search} readOnlyReason={readOnlyReason} releaseIndex={releaseIndex} selectedReleaseId={selectedReleaseId} canStartRelease={canStartRelease} section={productSection} onSection={onProductSection} onSelect={onSelectObject} onUseAgent={onUseAgent} onSelectRelease={onSelectRelease} onStartRelease={onStartRelease} onConfigurationChanged={onConfigurationChanged} />;
  return <ReleasesRail index={releaseIndex} selectedId={selectedReleaseId} search={search} canStart={canStartRelease} onSelect={onSelectRelease} onStart={onStartRelease} />;
}
