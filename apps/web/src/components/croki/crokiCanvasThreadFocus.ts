/** Stable sensed IDs are the only live Canvas context carried into a native turn. */
export function canvasThreadFocusIds(
  objects: readonly {
    readonly artifact?: unknown;
    readonly perceptionObject?: { readonly id: string };
    readonly perceptionObjects?: readonly { readonly id: string }[];
    readonly selectionId?: string;
  }[],
): readonly string[] {
  return [
    ...new Set(
      objects.flatMap((object) => {
        if (object.perceptionObjects?.length) {
          return object.perceptionObjects.map((item) => item.id);
        }
        if (object.perceptionObject && object.selectionId) return [object.selectionId];
        return object.artifact && object.selectionId ? [object.selectionId] : [];
      }),
    ),
  ];
}
