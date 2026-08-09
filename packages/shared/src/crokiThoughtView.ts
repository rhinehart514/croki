import type {
  CrokiPerceptionFrame,
  CrokiPerceptionObject,
  CrokiPerceptionRelationship,
  CrokiProjectPerceptionSnapshot,
  CrokiThoughtView,
  CrokiThoughtViewEpistemicState,
  CrokiThoughtViewRegion,
  CrokiThoughtViewRepresentation,
  CrokiThoughtViewSource,
  CrokiThoughtViewStatement,
} from "@croki/contracts";

export interface CrokiThoughtViewInput {
  readonly frame: CrokiPerceptionFrame | CrokiProjectPerceptionSnapshot;
  readonly question: string;
  readonly alternate?: boolean;
  readonly generatedAt?: string;
}

const MAX_STATEMENTS = 18;
const MAX_RELATIONSHIPS = 24;

/** Compiles bounded perception into one inspectable semantic View. */
export function compileCrokiThoughtView(input: CrokiThoughtViewInput): CrokiThoughtView | null {
  const question = cleanQuestion(input.question);
  const objects = input.frame.objects.filter(isSemanticObject).slice(0, MAX_STATEMENTS);
  const objectIds = new Set(objects.map((object) => object.id));
  const relationships = input.frame.relationships
    .filter((relationship) => objectIds.has(relationship.from) && objectIds.has(relationship.to))
    .slice(0, MAX_RELATIONSHIPS);
  if (!isViewWorthy(question, objects, relationships)) return null;

  const primary = chooseRepresentation(question, objects, relationships);
  const representation = input.alternate ? alternateRepresentation(primary) : primary;
  const sources = objects.map(toSource);
  const statements = objects.map(toStatement);
  const sourceIdByObjectId = new Map(sources.map((source) => [source.objectId, source.id]));
  const viewRelationships = relationships.map((relationship) =>
    toRelationship(relationship, sourceIdByObjectId),
  );
  const regions = buildRegions(representation, statements);
  const generatedAt = input.generatedAt ?? newestObservedAt(objects) ?? "1970-01-01T00:00:00.000Z";
  const sourceKinds = new Set(sources.map((source) => source.kind));
  const idSeed = [
    input.frame.revision,
    representation,
    question,
    ...statements.map((statement) => `${statement.id}:${statement.revision}`),
  ].join("|");

  return {
    version: 1,
    id: `view:${stableHash(idSeed)}`,
    generatedAt,
    sourceRevision: input.frame.revision,
    representation,
    alternateRepresentation: alternateRepresentation(representation),
    basis: {
      question: question || "What structure matters in the current work?",
      foregrounds: foregroundsFor(representation),
      omits: [
        ...(input.frame.truncated ? ["Sources outside the bounded perception frame"] : []),
        "Private model reasoning",
      ],
      coverage: `${sources.length} observations across ${sourceKinds.size} source ${sourceKinds.size === 1 ? "family" : "families"}`,
    },
    statements,
    relationships: viewRelationships,
    regions,
    sources,
  };
}

function isViewWorthy(
  question: string,
  objects: readonly CrokiPerceptionObject[],
  relationships: readonly CrokiPerceptionRelationship[],
): boolean {
  if (objects.length < 2) return false;
  if (relationships.length > 0) return true;
  if (objects.length >= 4) return true;
  return /\b(compare|versus|alternative|trade-?off|why|how|cause|change|before|after|evidence|proof|customer|user|journey|option|possib|what if)\b/i.test(
    question,
  );
}

function chooseRepresentation(
  question: string,
  objects: readonly CrokiPerceptionObject[],
  relationships: readonly CrokiPerceptionRelationship[],
): CrokiThoughtViewRepresentation {
  if (/\b(compare|versus|\bvs\b|alternative|trade-?off|option)\b/i.test(question)) {
    return "comparison";
  }
  if (/\b(before|after|changed?|history|timeline|release|across time|when)\b/i.test(question)) {
    return "temporal";
  }
  if (/\b(customer|user|journey|experience|friction|trigger)\b/i.test(question)) {
    return "experience";
  }
  if (/\b(evidence|proof|know|contradict|source|support)\b/i.test(question)) {
    return "evidence";
  }
  if (/\b(what if|counterfactual|assum|scenario|possible world)\b/i.test(question)) {
    return "counterfactual";
  }
  if (/\b(why|cause|causal|leverage|effect|consequence)\b/i.test(question)) return "causal";
  if (relationships.length >= Math.max(2, objects.length - 1)) return "system";
  return "possibility";
}

function alternateRepresentation(
  representation: CrokiThoughtViewRepresentation,
): CrokiThoughtViewRepresentation {
  switch (representation) {
    case "comparison":
      return "causal";
    case "causal":
      return "temporal";
    case "temporal":
      return "evidence";
    case "experience":
      return "system";
    case "evidence":
      return "comparison";
    case "counterfactual":
      return "causal";
    case "system":
      return "possibility";
    case "possibility":
      return "comparison";
  }
}

function toSource(object: CrokiPerceptionObject): CrokiThoughtViewSource {
  return {
    id: `source:${object.id}`,
    objectId: object.id,
    kind: object.source.kind,
    title: object.title,
    observedAt: object.source.observedAt,
    ...(object.source.uri ? { uri: object.source.uri } : {}),
    ...(object.source.sourceThreadId
      ? { sourceThreadId: object.source.sourceThreadId }
      : object.source.kind === "thread" && object.source.id
        ? { sourceThreadId: object.source.id }
        : {}),
  };
}

function toStatement(object: CrokiPerceptionObject): CrokiThoughtViewStatement {
  return {
    id: `statement:${object.id}`,
    objectId: object.id,
    title: object.title,
    body: object.summary?.trim() ?? "",
    epistemicState: epistemicStateFor(object),
    sourceIds: [`source:${object.id}`],
    revision: object.revision,
    kind: object.type,
    ...(object.state ? { status: object.state } : {}),
  };
}

function toRelationship(
  relationship: CrokiPerceptionRelationship,
  sourceIdByObjectId: ReadonlyMap<string, string>,
) {
  const sourceIds = [
    sourceIdByObjectId.get(relationship.from),
    sourceIdByObjectId.get(relationship.to),
  ].filter((value): value is string => value !== undefined);
  return {
    id: `view-relationship:${relationship.id}`,
    from: `statement:${relationship.from}`,
    to: `statement:${relationship.to}`,
    label: relationship.label?.trim() || relationship.kind,
    kind: relationship.kind,
    epistemicState: relationship.source ? ("observed" as const) : ("derived" as const),
    sourceIds: [...new Set(sourceIds)],
  };
}

function epistemicStateFor(object: CrokiPerceptionObject): CrokiThoughtViewEpistemicState {
  const normalized = `${object.type} ${object.state ?? ""}`.toLowerCase();
  if (/contradict|conflict|invalid/.test(normalized)) return "contradicted";
  if (/hypoth|scenario|provisional|proposal|candidate/.test(normalized)) return "hypothetical";
  if (/inferred|interpret/.test(normalized)) return "inferred";
  if (/derived|computed/.test(normalized)) return "derived";
  if (/uncovered|missing|unknown|gap/.test(normalized)) return "uncovered";
  if (/provider|assistant|thread/.test(object.source.kind.toLowerCase())) return "attributed";
  return "observed";
}

function buildRegions(
  representation: CrokiThoughtViewRepresentation,
  statements: readonly CrokiThoughtViewStatement[],
): readonly CrokiThoughtViewRegion[] {
  const ordered = [...statements].sort(
    (left, right) => right.revision - left.revision || left.title.localeCompare(right.title),
  );
  const evidence = ordered.filter((statement) =>
    ["observed", "attributed", "contradicted"].includes(statement.epistemicState),
  );
  const exploratory = ordered.filter((statement) => !evidence.includes(statement));
  if (representation === "temporal") {
    const ascending = ordered.toReversed();
    const third = Math.max(1, Math.ceil(ascending.length / 3));
    return [
      region("earlier", "sequence", "Earlier", ascending.slice(0, third)),
      region("developing", "sequence", "Developing", ascending.slice(third, third * 2)),
      region("now", "focus", "Now", ascending.slice(third * 2)),
    ].filter((candidate) => candidate.statementIds.length > 0);
  }
  if (representation === "comparison" || representation === "possibility") {
    const midpoint = Math.ceil(ordered.length / 2);
    return [
      region("world-a", "lane", "One world", ordered.slice(0, midpoint)),
      region("world-b", "lane", "Another world", ordered.slice(midpoint)),
    ].filter((candidate) => candidate.statementIds.length > 0);
  }
  return [
    region("focus", "focus", regionTitle(representation), exploratory.slice(0, 6)),
    region("evidence", "evidence", "What the sources show", evidence.slice(0, 10)),
  ].filter((candidate) => candidate.statementIds.length > 0);
}

function region(
  id: string,
  kind: CrokiThoughtViewRegion["kind"],
  title: string,
  statements: readonly CrokiThoughtViewStatement[],
): CrokiThoughtViewRegion {
  return { id: `region:${id}`, kind, title, statementIds: statements.map((item) => item.id) };
}

function regionTitle(representation: CrokiThoughtViewRepresentation): string {
  switch (representation) {
    case "causal":
      return "What appears to shape the outcome";
    case "system":
      return "The system under attention";
    case "experience":
      return "The lived path";
    case "evidence":
      return "The claim under examination";
    case "counterfactual":
      return "The assumption being changed";
    default:
      return "What matters";
  }
}

function foregroundsFor(representation: CrokiThoughtViewRepresentation): readonly string[] {
  switch (representation) {
    case "comparison":
      return ["Materially different possibilities", "Consequences visible in current sources"];
    case "temporal":
      return ["Change across source revisions", "The current edge of the work"];
    case "causal":
      return ["Candidate causes and consequences", "Contradictory evidence"];
    case "experience":
      return ["User trigger, action, friction, and result"];
    case "evidence":
      return ["Support, contradiction, and coverage"];
    case "counterfactual":
      return ["Hypothetical assumptions and downstream effects"];
    case "system":
      return ["Boundaries, dependencies, and flows"];
    case "possibility":
      return ["Different coherent readings of the current work"];
  }
}

function isSemanticObject(object: CrokiPerceptionObject): boolean {
  const normalized = `${object.type} ${object.source.kind} ${object.title}`.toLowerCase();
  return !(
    normalized.includes("context window") ||
    normalized.includes("ran command") ||
    object.type === "runtime" ||
    object.type === "tool"
  );
}

function cleanQuestion(question: string): string {
  const suffixMarkers = [
    "\n\nCroki perception focus",
    "\n\nView selection",
    "\n\nCanvas selection",
    "\n\nTerminal context",
    "\n\nPreview annotation",
    "\n\nReview comments",
  ];
  const boundary = suffixMarkers.reduce((current, marker) => {
    const index = question.indexOf(marker);
    return index >= 0 ? Math.min(current, index) : current;
  }, question.length);
  return question.slice(0, boundary).trim().replace(/\s+/g, " ").slice(0, 4_096);
}

function newestObservedAt(objects: readonly CrokiPerceptionObject[]): string | null {
  return (
    objects
      .map((object) => object.source.observedAt)
      .sort()
      .at(-1) ?? null
  );
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
}
