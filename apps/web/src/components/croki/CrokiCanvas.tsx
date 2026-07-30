import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  CROKI_CONTEXT_RELATIVE_PATH,
  CROKI_NODE_KINDS,
  CROKI_NODE_STATUSES,
  createEmptyCrokiContext,
  parseCrokiContext,
  serializeCrokiContext,
  type CrokiContext,
  type CrokiContextNode,
  type CrokiNodeKind,
  type CrokiNodeStatus,
} from "@t3tools/shared/crokiContext";
import { CircleDot, Link2, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { cn, randomHex } from "~/lib/utils";
import { useProjectFileQuery } from "../files/projectFilesQueryState";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Textarea } from "../ui/textarea";
import { stackedThreadToast, toastManager } from "../ui/toast";

interface CrokiCanvasProps {
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string;
  readonly productName: string;
}

const KIND_LABEL: Record<CrokiNodeKind, string> = {
  intent: "Intent",
  decision: "Decision",
  evidence: "Evidence",
  work: "Work",
};

function newNode(kind: CrokiNodeKind): CrokiContextNode {
  const now = new Date().toISOString();
  return {
    id: `${kind}-${randomHex(16)}`,
    kind,
    status: "provisional",
    title: `New ${KIND_LABEL[kind].toLowerCase()}`,
    body: "",
    updatedAt: now,
  };
}

export function CrokiCanvas(props: CrokiCanvasProps) {
  const fileQuery = useProjectFileQuery(
    props.environmentId,
    props.workspaceRoot,
    CROKI_CONTEXT_RELATIVE_PATH,
  );
  const writeProjectFile = useAtomCommand(projectEnvironment.writeFile, {
    reportFailure: false,
  });
  const [context, setContext] = useState<CrokiContext>(() =>
    createEmptyCrokiContext(props.productName),
  );
  const [loadedContents, setLoadedContents] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");
  const [edgeRelation, setEdgeRelation] = useState("supports");

  useEffect(() => {
    const contents = fileQuery.data?.contents;
    if (contents === undefined || contents === loadedContents) return;
    try {
      setContext(parseCrokiContext(contents));
      setParseError(null);
      setLoadedContents(contents);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Could not parse product context.");
      setLoadedContents(contents);
    }
  }, [fileQuery.data?.contents, loadedContents]);

  const serialized = useMemo(() => serializeCrokiContext(context), [context]);
  const isDirty = serialized !== loadedContents;

  const updateNode = useCallback(
    (id: string, patch: Partial<Pick<CrokiContextNode, "title" | "body" | "kind" | "status">>) => {
      const now = new Date().toISOString();
      setContext((current) => ({
        ...current,
        updatedAt: now,
        nodes: current.nodes.map((node) =>
          node.id === id ? { ...node, ...patch, updatedAt: now } : node,
        ),
      }));
    },
    [],
  );

  const save = useCallback(() => {
    setIsSaving(true);
    const nextContext = { ...context, updatedAt: new Date().toISOString() };
    const contents = serializeCrokiContext(nextContext);
    void (async () => {
      const result = await writeProjectFile({
        environmentId: props.environmentId,
        input: {
          cwd: props.workspaceRoot,
          relativePath: CROKI_CONTEXT_RELATIVE_PATH,
          contents,
        },
      });
      setIsSaving(false);
      if (result._tag === "Success") {
        setContext(nextContext);
        setLoadedContents(contents);
        setParseError(null);
        fileQuery.refresh();
        toastManager.add({
          type: "success",
          title: "Canvas saved",
          description: CROKI_CONTEXT_RELATIVE_PATH,
        });
      } else if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not save Canvas",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
    })();
  }, [context, fileQuery, props.environmentId, props.workspaceRoot, writeProjectFile]);

  const addEdge = useCallback(() => {
    const relation = edgeRelation.trim();
    if (!edgeFrom || !edgeTo || edgeFrom === edgeTo || !relation) return;
    setContext((current) => ({
      ...current,
      updatedAt: new Date().toISOString(),
      edges: current.edges.some(
        (edge) => edge.from === edgeFrom && edge.to === edgeTo && edge.relation === relation,
      )
        ? current.edges
        : [...current.edges, { from: edgeFrom, to: edgeTo, relation }],
    }));
    setEdgeRelation("supports");
  }, [edgeFrom, edgeRelation, edgeTo]);

  return (
    <section className="flex h-full min-h-0 flex-col bg-card/35" aria-label="Croki Canvas">
      <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border/60 px-3">
        <CircleDot className="size-4 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">Canvas</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            Product truth shared with every agent
          </p>
        </div>
        <Button size="sm" onClick={save} disabled={isSaving || !isDirty}>
          <Save className="size-3.5" aria-hidden />
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-5 p-3 pb-10">
          {parseError ? (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/5 p-3"
            >
              <p className="text-sm font-medium">Context needs repair</p>
              <p className="mt-1 text-xs text-muted-foreground">{parseError}</p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => {
                  setContext(createEmptyCrokiContext(props.productName));
                  setParseError(null);
                }}
              >
                Start a valid Canvas
              </Button>
            </div>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Product</span>
            <Input
              value={context.product}
              placeholder={props.productName}
              onChange={(event) =>
                setContext((current) => ({
                  ...current,
                  product: event.target.value,
                  updatedAt: new Date().toISOString(),
                }))
              }
            />
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold tracking-wide uppercase">Product truth</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Current and provisional items are added to every provider turn.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setContext((current) => ({
                    ...current,
                    updatedAt: new Date().toISOString(),
                    nodes: [...current.nodes, newNode("intent")],
                  }))
                }
              >
                <Plus className="size-3.5" aria-hidden />
                Add
              </Button>
            </div>

            <div className="space-y-2">
              {context.nodes.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border p-5 text-center">
                  <p className="text-sm font-medium">No product truth yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Add the intent, decisions, evidence, and work that should survive every thread.
                  </p>
                </div>
              ) : null}
              {context.nodes.map((node) => (
                <article
                  key={node.id}
                  className={cn(
                    "space-y-2 rounded-lg border border-border/70 bg-background/65 p-3",
                    node.status === "retired" && "opacity-55",
                  )}
                >
                  <div className="flex gap-2">
                    <select
                      aria-label={`Kind for ${node.title}`}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={node.kind}
                      onChange={(event) =>
                        updateNode(node.id, { kind: event.target.value as CrokiNodeKind })
                      }
                    >
                      {CROKI_NODE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {KIND_LABEL[kind]}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`Status for ${node.title}`}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={node.status}
                      onChange={(event) =>
                        updateNode(node.id, { status: event.target.value as CrokiNodeStatus })
                      }
                    >
                      {CROKI_NODE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <Button
                      className="ml-auto"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${node.title}`}
                      onClick={() =>
                        setContext((current) => ({
                          ...current,
                          updatedAt: new Date().toISOString(),
                          nodes: current.nodes.filter((item) => item.id !== node.id),
                          edges: current.edges.filter(
                            (edge) => edge.from !== node.id && edge.to !== node.id,
                          ),
                        }))
                      }
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                  <Input
                    aria-label="Title"
                    value={node.title}
                    onChange={(event) => updateNode(node.id, { title: event.target.value })}
                  />
                  <Textarea
                    aria-label={`Details for ${node.title}`}
                    rows={3}
                    value={node.body}
                    placeholder="Why this matters, what changed, or where the evidence lives…"
                    onChange={(event) => updateNode(node.id, { body: event.target.value })}
                  />
                </article>
              ))}
            </div>
          </div>

          {context.nodes.length > 1 ? (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Link2 className="size-3.5 text-muted-foreground" aria-hidden />
                <h3 className="text-xs font-semibold tracking-wide uppercase">Relationships</h3>
              </div>
              <div className="grid gap-2 rounded-lg border border-border/70 p-3">
                <select
                  aria-label="Relationship source"
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  value={edgeFrom}
                  onChange={(event) => setEdgeFrom(event.target.value)}
                >
                  <option value="">From…</option>
                  {context.nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.title}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label="Relationship"
                  value={edgeRelation}
                  onChange={(event) => setEdgeRelation(event.target.value)}
                />
                <select
                  aria-label="Relationship target"
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  value={edgeTo}
                  onChange={(event) => setEdgeTo(event.target.value)}
                >
                  <option value="">To…</option>
                  {context.nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.title}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addEdge}
                  disabled={!edgeFrom || !edgeTo || edgeFrom === edgeTo || !edgeRelation.trim()}
                >
                  Add relationship
                </Button>
              </div>
              <ul className="mt-2 space-y-1">
                {context.edges.map((edge) => (
                  <li
                    key={`${edge.from}-${edge.relation}-${edge.to}`}
                    className="flex min-h-9 items-center gap-2 rounded-md bg-muted/40 px-2 text-xs"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {context.nodes.find((node) => node.id === edge.from)?.title}{" "}
                      <span className="text-muted-foreground">—{edge.relation}→</span>{" "}
                      {context.nodes.find((node) => node.id === edge.to)?.title}
                    </span>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label="Delete relationship"
                      onClick={() =>
                        setContext((current) => ({
                          ...current,
                          updatedAt: new Date().toISOString(),
                          edges: current.edges.filter(
                            (candidate) =>
                              candidate.from !== edge.from ||
                              candidate.to !== edge.to ||
                              candidate.relation !== edge.relation,
                          ),
                        }))
                      }
                    >
                      <Trash2 className="size-3" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </section>
  );
}
