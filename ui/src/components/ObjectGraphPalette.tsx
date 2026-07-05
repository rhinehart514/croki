import { useRef, type DragEvent } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { kindIcon } from "@/lib/objectKindIcons";
import { PALETTE_ALL_BLOCKS, PALETTE_BLOCK_LABEL, PALETTE_DRAG_MIME, PALETTE_FAMILIES } from "@/lib/objectPalette";
import "@/styles/object-palette.css";

// Collapsed state is lifted to the canvas so the fit can clear the rail's width (it floats over the map).
export function ObjectGraphPalette({ collapsed, onToggle }: { collapsed: boolean; onToggle: (next: boolean) => void }) {
  // One hidden 1:1 preview per block, used as the drag image — so the thing under the cursor reads as the
  // actual white card it becomes, faded, not a generic browser chip.
  const ghostRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const onDragStart = (event: DragEvent<HTMLButtonElement>, type: string) => {
    event.dataTransfer.setData(PALETTE_DRAG_MIME, type);
    event.dataTransfer.effectAllowed = "copy";
    const ghost = ghostRefs.current[type];
    // Grab the card near its top-left so the preview sits under the cursor like the card will.
    if (ghost) event.dataTransfer.setDragImage(ghost, 24, 24);
  };

  if (collapsed) {
    return (
      <div className="object-palette collapsed">
        <button
          type="button"
          className="object-palette-reopen"
          onClick={() => onToggle(false)}
          aria-label="Show blocks"
          title="Show blocks"
        >
          <PanelLeftOpen aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="object-palette">
      <div className="object-palette-head">
        <span className="object-palette-title">Blocks</span>
        <button
          type="button"
          className="object-palette-collapse"
          onClick={() => onToggle(true)}
          aria-label="Hide blocks"
          title="Hide blocks"
        >
          <PanelLeftClose aria-hidden="true" />
        </button>
      </div>
      <p className="object-palette-hint">Drag a block onto the canvas to add it.</p>

      <div className="object-palette-groups">
        {PALETTE_FAMILIES.map((family) => (
          <div className="object-palette-group" key={family.label}>
            <span className="object-palette-group-label">{family.label}</span>
            {family.blocks.map((type) => {
              const Icon = kindIcon(type);
              return (
                <button
                  type="button"
                  key={type}
                  className="object-palette-row"
                  draggable
                  onDragStart={(event) => onDragStart(event, type)}
                >
                  <Icon aria-hidden="true" />
                  <span>{PALETTE_BLOCK_LABEL[type]}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Off-screen drag-image cards: the same white card frame the drop creates, held ready so the
          browser can snapshot one as the faded preview under the cursor. */}
      <div className="object-palette-ghosts" aria-hidden="true">
        {PALETTE_ALL_BLOCKS.map((type) => {
          const Icon = kindIcon(type);
          return (
            <div
              key={type}
              className="object-card loose palette-drag-ghost"
              ref={(node) => { ghostRefs.current[type] = node; }}
            >
              <div className="object-card-type">
                <Icon aria-hidden="true" />
                <span>{PALETTE_BLOCK_LABEL[type]}</span>
              </div>
              <div className="obj-body obj-text">New {PALETTE_BLOCK_LABEL[type].toLowerCase()}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
