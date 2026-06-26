import { sourceStandsOnData, sourceMode, isSourceNode, SOURCE_MODES } from "./source-entry.mjs";

const FIELD_RE = /^[A-Za-z][A-Za-z0-9_.-]*$/;

function uniqueFields(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((field) => String(field).trim()).filter(Boolean))];
}

export function normalizeContract(contract) {
  if (contract == null) return null;
  if (typeof contract !== "object" || Array.isArray(contract)) {
    throw new Error("Node contract must be an object.");
  }
  const accepts = uniqueFields(contract.accepts);
  const emits = uniqueFields(contract.emits);
  for (const field of [...accepts, ...emits]) {
    if (!FIELD_RE.test(field)) {
      throw new Error(`Contract field "${field}" must start with a letter and use letters, numbers, dots, dashes, or underscores.`);
    }
  }
  const minItems = contract.minItems == null ? 0 : Number(contract.minItems);
  if (!Number.isInteger(minItems) || minItems < 0) {
    throw new Error("Contract minItems must be a non-negative integer.");
  }
  return { accepts, emits, ...(minItems > 0 ? { minItems } : {}) };
}

function hasField(item, field) {
  let value = item;
  for (const part of field.split(".")) {
    if (value == null || typeof value !== "object" || !(part in value)) return false;
    value = value[part];
  }
  return value !== undefined && value !== null && value !== "";
}

function audit(state, message, extra = {}) {
  return { state, message, missingFields: [], ...extra };
}

export function auditInput(node, items) {
  // A source node's readiness is about its OWN config, not upstream items — it is the origin. A
  // discovered (agent) source self-sources and is always ready; a provided source is ready only
  // when the founder has configured a seed. This is the run path's "configure this source" signal,
  // routed through the same audit states the engine already understands.
  if (isSourceNode(node)) {
    if (sourceStandsOnData(node)) {
      return audit("satisfied", sourceMode(node) === SOURCE_MODES.DISCOVERED
        ? "This source finds its own candidates."
        : "Input is configured.");
    }
    return audit("waiting", "Add manual rows, CSV data, or an API endpoint to seed this source.");
  }
  const contract = normalizeContract(node.contract);
  if (!contract || (contract.accepts.length === 0 && !contract.minItems)) {
    return audit("ready", "No required input fields declared.");
  }
  const minimum = contract.minItems ?? (contract.accepts.length > 0 ? 1 : 0);
  if (items.length < minimum) {
    const state = node.category === "measure" ? "blind" : "waiting";
    return audit(
      state,
      node.category === "measure"
        ? `Measurement is blind until at least ${minimum} attributed item${minimum === 1 ? "" : "s"} arrive.`
        : `Waiting for at least ${minimum} input item${minimum === 1 ? "" : "s"}.`,
      { requiredFields: contract.accepts, itemCount: items.length },
    );
  }
  const missingFields = contract.accepts.filter((field) => items.some((item) => !hasField(item, field)));
  if (missingFields.length > 0) {
    const state = node.category === "measure" ? "blind" : "blocked";
    return audit(
      state,
      node.category === "measure"
        ? `Measurement is blind without ${missingFields.join(", ")}.`
        : `${node.label} needs ${missingFields.join(", ")} before it can run.`,
      { requiredFields: contract.accepts, missingFields, itemCount: items.length },
    );
  }
  return audit("satisfied", `${items.length} input item${items.length === 1 ? "" : "s"} satisfy the contract.`, {
    requiredFields: contract.accepts,
    itemCount: items.length,
  });
}

export function auditOutput(node, items) {
  const contract = normalizeContract(node.contract);
  if (!contract) return audit("ready", "No promised output fields declared.");
  const minimum = contract.minItems ?? 0;
  if (items.length < minimum) {
    return audit("blocked", `${node.label} promised at least ${minimum} output item${minimum === 1 ? "" : "s"}, but produced ${items.length}.`, {
      promisedFields: contract.emits,
      itemCount: items.length,
    });
  }
  if (items.length === 0 || contract.emits.length === 0) {
    return audit("satisfied", items.length === 0 ? "The step ran and produced 0 items." : `${items.length} items produced.`, {
      promisedFields: contract.emits,
      itemCount: items.length,
    });
  }
  const missingFields = contract.emits.filter((field) => items.some((item) => !hasField(item, field)));
  if (missingFields.length > 0) {
    return audit("blocked", `${node.label} did not produce its promised ${missingFields.join(", ")} field${missingFields.length === 1 ? "" : "s"}.`, {
      promisedFields: contract.emits,
      missingFields,
      itemCount: items.length,
    });
  }
  return audit("satisfied", `${items.length} output item${items.length === 1 ? "" : "s"} satisfy the contract.`, {
    promisedFields: contract.emits,
    itemCount: items.length,
  });
}

export function auditGraphContracts(graph, runResult = null) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges) {
    if (edge.edgeType !== "data" || !incoming.has(edge.target)) continue;
    incoming.get(edge.target).push(edge.source);
  }

  return Object.fromEntries(graph.nodes.map((node) => {
    const observed = runResult?.nodes?.[node.id]?.contractAudit;
    if (observed) return [node.id, observed];
    const contract = normalizeContract(node.contract);
    // "none" ≠ "ready". An undeclared contract is not a satisfied one — it's the
    // absence of a promise. Rendering it green ("ready") is a false-positive health
    // signal; surface it as a distinct, neutral state instead.
    if (!contract) return [node.id, audit("none", "No data contract declared.")];

    const parents = incoming.get(node.id) ?? [];
    if (parents.length === 0) {
      if (node.category === "source") {
        return [node.id, sourceStandsOnData(node)
          ? audit("ready", sourceMode(node) === SOURCE_MODES.DISCOVERED ? "This source finds its own candidates." : "Input is configured.", { promisedFields: contract.emits })
          : audit("waiting", "Add manual rows, CSV data, or an API endpoint.", { promisedFields: contract.emits })];
      }
      if (contract.accepts.length > 0 || contract.minItems) {
        const state = node.category === "measure" ? "blind" : "waiting";
        return [node.id, audit(state,
          node.category === "measure"
            ? `Measurement is blind until ${contract.accepts.join(", ") || "attributed input"} is connected.`
            : `Connect a step that provides ${contract.accepts.join(", ") || "input items"}.`,
          { requiredFields: contract.accepts, missingFields: contract.accepts })];
      }
      return [node.id, audit("ready", "This step can start without upstream data.", { promisedFields: contract.emits })];
    }

    const available = new Set();
    for (const parentId of parents) {
      const parentContract = normalizeContract(nodes.get(parentId)?.contract);
      for (const field of parentContract?.emits ?? []) available.add(field);
    }
    const missingFields = contract.accepts.filter((field) => !available.has(field));
    if (missingFields.length > 0) {
      const state = node.category === "measure" ? "blind" : "blocked";
      return [node.id, audit(state,
        node.category === "measure"
          ? `Measurement is blind because upstream steps do not promise ${missingFields.join(", ")}.`
          : `Upstream steps do not promise ${missingFields.join(", ")}.`,
        { requiredFields: contract.accepts, missingFields, availableFields: [...available] })];
    }
    return [node.id, audit("ready", `Upstream steps promise ${contract.accepts.join(", ") || "the required data"}.`, {
      requiredFields: contract.accepts,
      promisedFields: contract.emits,
      availableFields: [...available],
    })];
  }));
}

