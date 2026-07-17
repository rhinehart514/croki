// Pure flat-paths → nested tree transform. Deterministic and tested; FileTree only renders it.

export interface FileTreeNode {
  name: string;
  /** Full path from the root. For folders this is the folder path; for files, the file path. */
  path: string;
  type: "file" | "folder";
  children: FileTreeNode[];
}

/**
 * Build a nested folder tree from flat "/"-separated paths. Folders sort before files, both
 * alphabetically. Duplicate paths collapse. Empty/blank segments are ignored.
 */
export function buildFileTree(paths: string[]): FileTreeNode[] {
  const root: FileTreeNode = { name: "", path: "", type: "folder", children: [] };

  for (const raw of paths) {
    if (typeof raw !== "string") continue;
    const segments = raw.split("/").map((s) => s.trim()).filter((s) => s.length > 0);
    if (segments.length === 0) continue;

    let cursor = root;
    segments.forEach((segment, index) => {
      const isLeaf = index === segments.length - 1;
      const path = segments.slice(0, index + 1).join("/");
      let next = cursor.children.find((c) => c.name === segment && c.type === (isLeaf ? "file" : "folder"));
      if (!next) {
        next = { name: segment, path, type: isLeaf ? "file" : "folder", children: [] };
        cursor.children.push(next);
      }
      cursor = next;
    });
  }

  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) if (node.children.length) sortNodes(node.children);
    return nodes;
  };

  return sortNodes(root.children);
}
