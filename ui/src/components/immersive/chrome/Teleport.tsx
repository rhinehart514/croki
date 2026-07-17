// ⌘K teleport palette (architecture §1/§3, redesign §5). A Base UI Dialog command palette that flies the
// camera to any object in the world via useAtlasCamera().reveal — no pages, no tabs, just jump. Opened
// with ⌘K / Ctrl+K, filtered by plain-words title, Enter/click teleports. The camera restores the prior
// frame on the next rise, exactly as descent does. This is navigation, so it is a modal dialog (focus
// trapped while choosing) that closes the moment a target is picked.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import type { AtlasNode } from "@/components/atlas/atlasTypes";

type Target = { id: string; title: string; kind: string };

export function Teleport({
  nodes,
  onReveal,
}: {
  nodes: AtlasNode[];
  onReveal: (nodeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset the query on every open (drive it from the transition, not an effect, so no cascading render).
  const setPaletteOpen = useCallback((next: boolean) => {
    if (next) setQuery("");
    setOpen(next);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setPaletteOpen]);

  const targets = useMemo<Target[]>(() => {
    const seen = new Set<string>();
    const list: Target[] = [];
    for (const node of nodes) {
      const title = String(node.data.title ?? "").trim();
      if (!title || seen.has(node.id)) continue;
      seen.add(node.id);
      list.push({ id: node.id, title, kind: String(node.data.kind ?? "") });
    }
    return list;
  }, [nodes]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets.slice(0, 12);
    return targets.filter((target) => target.title.toLowerCase().includes(q)).slice(0, 12);
  }, [query, targets]);

  const pick = (id: string) => {
    onReveal(id);
    setPaletteOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setPaletteOpen} modal>
      <Dialog.Portal>
        <Dialog.Backdrop className="iw-teleport-backdrop" />
        <Dialog.Popup
          className="iw-teleport"
          aria-label="Teleport to anything in the venture"
          initialFocus={inputRef}
        >
          <Dialog.Title className="iw-teleport-title">Jump to</Dialog.Title>
          <input
            ref={inputRef}
            className="iw-teleport-input"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type to find any effort, teammate, or the gate…"
            aria-label="Search the venture"
            onKeyDown={(event) => {
              if (event.key === "Enter" && filtered[0]) { event.preventDefault(); pick(filtered[0].id); }
            }}
          />
          <ol className="iw-teleport-list">
            {filtered.length ? filtered.map((target) => (
              <li key={target.id}>
                <button type="button" className="iw-teleport-item" onClick={() => pick(target.id)}>
                  <span className="iw-teleport-item-title">{target.title}</span>
                  <span className="iw-teleport-item-kind">{target.kind}</span>
                </button>
              </li>
            )) : (
              <li className="iw-teleport-empty">Nothing in the world matches that yet.</li>
            )}
          </ol>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
