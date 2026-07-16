import type { WallQueueItemView } from "@/api";
import { reviewContent } from "./wallReviewContent";

export function WallQueueNav({
  items,
  selectedId,
  onSelect,
}: {
  items: WallQueueItemView[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ol className="firm-wall-queue" aria-label="Items waiting for your decision">
      {items.map((item, index) => {
        const content = reviewContent(item);
        return (
          <li key={item.id}>
            <button
              type="button"
              aria-current={item.id === selectedId ? "true" : undefined}
              onClick={() => onSelect(item.id)}
            >
              <span>{index + 1}</span>
              <strong>{content.eyebrow}</strong>
              <small>{content.title}</small>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
