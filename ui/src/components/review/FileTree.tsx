import { useMemo, useState, type KeyboardEvent } from "react";
import { ChevronRight, ChevronDown, File as FileIcon, Folder, FolderOpen } from "lucide-react";
import { buildFileTree, type FileTreeNode } from "./buildFileTree";
import "./review.css";

// Flatten the visible (expanded) tree into a linear order so ArrowUp/ArrowDown move roving focus
// across the whole tree, matching the aria tree pattern, not just within one folder's children.
interface FlatRow {
  node: FileTreeNode;
  depth: number;
}

function flatten(nodes: FileTreeNode[], expanded: Set<string>, depth = 0): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.type === "folder" && expanded.has(node.path)) {
      rows.push(...flatten(node.children, expanded, depth + 1));
    }
  }
  return rows;
}

/**
 * Nested, collapsible folder tree built from flat paths. Files are selectable; folders toggle.
 * Keyboard: Up/Down move focus, Right/Left expand/collapse (or descend/ascend), Enter/Space
 * activate. Renders the WAI-ARIA tree roles so assistive tech reads structure and selection.
 */
export function FileTree({
  paths,
  selectedPath,
  onSelect,
}: {
  paths: string[];
  selectedPath?: string;
  onSelect?: (path: string) => void;
}) {
  const tree = useMemo(() => buildFileTree(paths), [paths]);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Expand every folder by default so the whole change is visible without hunting.
    const all = new Set<string>();
    const walk = (nodes: FileTreeNode[]) => {
      for (const n of nodes) {
        if (n.type === "folder") {
          all.add(n.path);
          walk(n.children);
        }
      }
    };
    walk(tree);
    return all;
  });
  const [focusPath, setFocusPath] = useState<string | undefined>(selectedPath);

  const rows = useMemo(() => flatten(tree, expanded), [tree, expanded]);

  if (rows.length === 0) {
    return <div className="review-empty">No files to show.</div>;
  }

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const activate = (node: FileTreeNode) => {
    if (node.type === "folder") toggle(node.path);
    else onSelect?.(node.path);
    setFocusPath(node.path);
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const { node } = rows[index];
    const move = (to: number) => {
      const clamped = Math.max(0, Math.min(rows.length - 1, to));
      setFocusPath(rows[clamped].node.path);
      event.preventDefault();
    };
    switch (event.key) {
      case "ArrowDown":
        return move(index + 1);
      case "ArrowUp":
        return move(index - 1);
      case "ArrowRight":
        if (node.type === "folder" && !expanded.has(node.path)) {
          toggle(node.path);
          event.preventDefault();
        } else {
          move(index + 1);
        }
        return;
      case "ArrowLeft":
        if (node.type === "folder" && expanded.has(node.path)) {
          toggle(node.path);
          event.preventDefault();
        } else {
          move(index - 1);
        }
        return;
      case "Enter":
      case " ":
        activate(node);
        event.preventDefault();
        return;
      default:
        return;
    }
  };

  const focusIndex = rows.findIndex((r) => r.node.path === focusPath);
  const activeIndex = focusIndex >= 0 ? focusIndex : 0;

  return (
    <ul className="review-tree review-tree-group" role="tree" aria-label="Changed files">
      {rows.map((row, index) => {
        const { node, depth } = row;
        const isFolder = node.type === "folder";
        const isOpen = expanded.has(node.path);
        const isSelected = node.path === selectedPath;
        return (
          <li
            key={node.path}
            role="treeitem"
            aria-selected={isSelected}
            aria-expanded={isFolder ? isOpen : undefined}
            aria-level={depth + 1}
          >
            <button
              type="button"
              className="review-tree-row"
              style={{ paddingLeft: 8 + depth * 14 }}
              tabIndex={index === activeIndex ? 0 : -1}
              aria-selected={isSelected}
              onClick={() => activate(node)}
              onKeyDown={(e) => onKeyDown(e, index)}
            >
              {isFolder ? (
                <>
                  {isOpen ? (
                    <ChevronDown className="review-tree-icon" size={14} aria-hidden="true" />
                  ) : (
                    <ChevronRight className="review-tree-icon" size={14} aria-hidden="true" />
                  )}
                  {isOpen ? (
                    <FolderOpen className="review-tree-icon" size={14} aria-hidden="true" />
                  ) : (
                    <Folder className="review-tree-icon" size={14} aria-hidden="true" />
                  )}
                </>
              ) : (
                <FileIcon className="review-tree-icon" size={14} aria-hidden="true" style={{ marginLeft: 14 }} />
              )}
              <span className="review-tree-name">{node.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
