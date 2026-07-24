import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

const AGENT_MIME = "application/x-drover-agent";
const CAPABILITY_MIME = "application/x-drover-capability";

type DropTarget = { id: string; data: { ref: string; name: string } };
type DropSelection = { ref: string; name: string } | null;

// A one-tap choice raised at the drop point when a supported drop lands where its subject is ambiguous.
// The founder invokes the exact effect; the position the pill happened to land is never read as intent.
export type DropChoice = {
  x: number;
  y: number;
  prompt: string;
  options: { label: string; run: () => void }[];
};

function droppedNodeId(target: EventTarget | null) {
  return target instanceof Element ? target.closest<HTMLElement>(".react-flow__node")?.dataset.id ?? null : null;
}

// Drops are ballistic: every supported drop resolves to exactly one concrete effect — an agent directed
// at an exact node, or a capability attached to the exact work on a node. When an agent lands on empty
// canvas its subject is ambiguous, so the founder taps the exact effect one tap apart rather than Croki
// inferring one from where the pill landed. With nothing focused there is no honest subject, so the drop
// refuses and points at an exact node. Unsupported combinations refuse visibly and persist nothing.
export function useProductGtmDrop({ targets, selection, readOnlyReason, onUseAgent, onAskAgent }: {
  targets: DropTarget[];
  selection: DropSelection;
  readOnlyReason: string | null;
  onUseAgent: (agentRef: string, subjectRef?: string) => void;
  onAskAgent: (subjectRef?: string, relatedRefs?: string[]) => void;
}) {
  const [dropNotice, setDropNotice] = useState<string | null>(null);
  const [dropChoice, setDropChoice] = useState<DropChoice | null>(null);
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
    dragDepth.current = 0; setDropActive(false); setDropChoice(null);
    if (readOnlyReason) { setDropNotice("Croki is not current enough to begin new work."); return; }
    const target = targets.find((node) => node.id === droppedNodeId(event.target));
    const agentRef = event.dataTransfer.getData(AGENT_MIME);
    if (agentRef) {
      if (target) {
        onUseAgent(agentRef, target.data.ref);
        setDropNotice(`Agent directed at ${target.data.name}.`);
        return;
      }
      if (!selection) { setDropNotice("Drop an agent on the exact node it should work on."); return; }
      const rect = event.currentTarget.getBoundingClientRect();
      const focus = selection;
      setDropChoice({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        prompt: "Where should this agent work?",
        options: [
          { label: `Direct at ${focus.name}`, run: () => { onUseAgent(agentRef, focus.ref); setDropNotice(`Agent directed at ${focus.name}.`); } },
          // An empty subject deliberately routes the agent into a fresh Thread while keeping this agent selected.
          { label: "Start new work", run: () => { onUseAgent(agentRef, ""); setDropNotice("Agent started on new work."); } },
        ],
      });
      return;
    }
    const capabilityData = event.dataTransfer.getData(CAPABILITY_MIME);
    if (capabilityData) {
      if (!target) { setDropNotice("Drop a tool or source on the exact node it should affect."); return; }
      try {
        const capability = JSON.parse(capabilityData) as { id?: string; label?: string };
        if (!capability.id) throw new Error("missing capability");
        onAskAgent(target.data.ref, [`capability:${capability.id}`]);
        setDropNotice(`${capability.label ?? "Capability"} attached to exact work on ${target.data.name}.`);
      } catch { setDropNotice("Croki could not identify that tool or source. Nothing was attached."); }
      return;
    }
    setDropNotice("That item has no supported effect on the canvas.");
  }, [targets, selection, onAskAgent, onUseAgent, readOnlyReason]);

  const resolveChoice = useCallback((run: () => void) => { run(); setDropChoice(null); }, []);
  const dismissChoice = useCallback(() => setDropChoice(null), []);

  const dropHandlers = {
    onDrop,
    onDragEnter: (event: DragEvent) => { if (carriesDroverItem(event)) { dragDepth.current += 1; setDropActive(true); } },
    onDragLeave: () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDropActive(false); },
    onDragOver: (event: DragEvent) => { if (carriesDroverItem(event)) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } },
  };

  return { dropNotice, setDropNotice, dropChoice, resolveChoice, dismissChoice, dropActive, dropHandlers };
}
