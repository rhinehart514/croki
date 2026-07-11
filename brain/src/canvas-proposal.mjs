import { normalizeStableRefs } from "./operator-tools.mjs";

const finite = (value, label) => {
  if (!Number.isFinite(value)) throw new Error(`${label} must be a finite number.`);
  return Number(value);
};
const revision = (value, label) => {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer.`);
  return value;
};
const point = (value, label) => ({ x: finite(value?.x, `${label}.x`), y: finite(value?.y, `${label}.y`) });

// One proposal intentionally carries one bounded structural mutation. A model can propose several
// independent cards, but the founder never approves an opaque multi-authority transaction.
export function normalizeCanvasProposal(value, projectId) {
  const input = value?.operation ? value : value?.content?.operation ? value.content : value;
  const operation = input?.operation;
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) throw new Error("A canvas proposal needs one typed operation.");
  const type = String(operation.type ?? "").trim();
  if (type === "create-region") return {
    schemaVersion: 1,
    title: String(input.title || operation.title || "Create work region").trim(),
    rationale: String(input.rationale || "").trim(),
    operation: {
      type,
      expectedStoreRevision: revision(operation.expectedStoreRevision, "expectedStoreRevision"),
      title: String(operation.title || "").trim() || "Work region",
      purpose: String(operation.purpose || "").trim(),
      memberRefs: normalizeStableRefs(operation.memberRefs ?? [], { projectId }),
      position: point(operation.position, "position"),
      size: { width: Math.max(240, finite(operation.size?.width, "size.width")), height: Math.max(160, finite(operation.size?.height, "size.height")) },
    },
  };
  if (type === "update-region") return {
    schemaVersion: 1,
    title: String(input.title || "Update work region").trim(),
    rationale: String(input.rationale || "").trim(),
    operation: {
      type,
      regionId: String(operation.regionId || "").trim(),
      expectedRevision: revision(operation.expectedRevision, "expectedRevision"),
      patch: {
        ...(operation.patch?.title === undefined ? {} : { title: String(operation.patch.title).trim() }),
        ...(operation.patch?.purpose === undefined ? {} : { purpose: String(operation.patch.purpose).trim() }),
        ...(operation.patch?.position === undefined ? {} : { position: point(operation.patch.position, "patch.position") }),
        ...(operation.patch?.size === undefined ? {} : { size: { width: Math.max(240, finite(operation.patch.size?.width, "patch.size.width")), height: Math.max(160, finite(operation.patch.size?.height, "patch.size.height")) } }),
        ...(operation.patch?.collapsed === undefined ? {} : { collapsed: operation.patch.collapsed === true }),
      },
    },
  };
  if (type === "layout") return {
    schemaVersion: 1,
    title: String(input.title || "Arrange canvas").trim(),
    rationale: String(input.rationale || "").trim(),
    operation: {
      type,
      expectedRevision: revision(operation.expectedRevision, "expectedRevision"),
      geometry: {
        ...(operation.geometry?.positions ? { positions: Object.fromEntries(Object.entries(operation.geometry.positions).slice(0, 100).map(([id, value]) => [id, point(value, `positions.${id}`)])) } : {}),
        ...(operation.geometry?.viewport ? { viewport: { ...point(operation.geometry.viewport, "viewport"), zoom: Math.min(2, Math.max(0.1, finite(operation.geometry.viewport.zoom, "viewport.zoom"))) } } : {}),
      },
    },
  };
  throw new Error("Canvas proposal operation must be create-region, update-region, or layout.");
}
