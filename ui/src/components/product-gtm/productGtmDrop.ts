import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

const AGENT_MIME = "application/x-drover-agent";
const CAPABILITY_MIME = "application/x-drover-capability";

type DropTarget = { id: string; data: { ref: string; name: string } };

function droppedNodeId(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>(".react-flow__node")?.dataset.id ?? null : null;
}

// Every supported drop must resolve to one concrete product effect (agent direction or a scoped
// capability attachment); unsupported combinations are rejected visibly rather than persisted.
export function useProductGtmDrop({ targets, readOnlyReason, onUseAgent, onAskAgent }: {
  targets: DropTarget[];
  readOnlyReason: string | null;
  onUseAgent: (agentRef: string, subjectRef?: string) => void;
  onAskAgent: (subjectRef?: string, relatedRefs?: string[]) => void;
}) {
  const [dropNotice, setDropNotice] = useState<string | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    if (!dropNotice) return;
    const timer = window.setTimeout(() => setDropNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [dropNotice]);

  const carriesDroverItem = (event: DragEvent) =>
    event.dataTransfer.types.includes(AGENT_MIME) || event.dataTransfer.types.includes(CAPABILITY_MIME);

  const onDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0; setDropActive(false);
    if (readOnlyReason) { setDropNotice("Croki is not current enough to begin new work."); return; }
    const target = targets.find((node) => node.id === droppedNodeId(event.target));
    const agentRef = event.dataTransfer.getData(AGENT_MIME);
    if (agentRef) {
      onUseAgent(agentRef, target?.data.ref);
      setDropNotice(target ? `Agent directed at ${target.data.name}.` : "Agent directed at the current focus.");
      return;
    }
    const capabilityData = event.dataTransfer.getData(CAPABILITY_MIME);
    if (capabilityData) {
      if (!target) { setDropNotice("Drop a tool or source on the exact Product or GTM node it should affect."); return; }
      try {
        const capability = JSON.parse(capabilityData) as { id?: string; label?: string };
        if (!capability.id) throw new Error("missing capability");
        onAskAgent(target.data.ref, [`capability:${capability.id}`]);
        setDropNotice(`${capability.label ?? "Capability"} attached to exact work on ${target.data.name}.`);
      } catch { setDropNotice("Croki could not identify that tool or source. Nothing was attached."); }
      return;
    }
    setDropNotice("That item has no supported Product / GTM effect.");
  }, [targets, onAskAgent, onUseAgent, readOnlyReason]);

  const dropHandlers = {
    onDrop,
    onDragEnter: (event: DragEvent) => { if (carriesDroverItem(event)) { dragDepth.current += 1; setDropActive(true); } },
    onDragLeave: () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDropActive(false); },
    onDragOver: (event: DragEvent) => { if (carriesDroverItem(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } },
  };

  return { dropNotice, setDropNotice, dropActive, dropHandlers };
}
