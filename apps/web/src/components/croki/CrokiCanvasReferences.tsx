import {
  CROKI_CONTEXT_LIMITS,
  parseCrokiContextReference,
  type CrokiContextReference,
} from "@croki/shared/crokiContext";
import { ExternalLink, FileCode2, Link2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { CrokiCanvasModelError } from "./crokiCanvasModel";

interface CrokiCanvasReferencesProps {
  readonly editable?: boolean;
  readonly onAdd: (reference: CrokiContextReference) => CrokiCanvasModelError | null;
  readonly onOpenReference?: (reference: CrokiContextReference) => void;
  readonly onRemove: (reference: CrokiContextReference) => void;
  readonly references: readonly CrokiContextReference[];
}

export function CrokiCanvasReferences(props: CrokiCanvasReferencesProps) {
  const editable = props.editable ?? true;
  const [kind, setKind] = useState<"file" | "url">("file");
  const [value, setValue] = useState("");
  const [line, setLine] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    let reference: CrokiContextReference;
    try {
      reference = parseCrokiContextReference(
        kind === "file"
          ? {
              kind,
              path: value,
              ...(line ? { line: Number(line) } : {}),
            }
          : { kind, url: value },
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid reference.");
      return;
    }
    const modelError = props.onAdd(reference);
    if (modelError) {
      setError(REFERENCE_ERROR_MESSAGE[modelError] ?? "Could not add reference.");
      return;
    }
    setValue("");
    setLine("");
    setError(null);
  };

  return (
    <section aria-label="Evidence references" className="space-y-2">
      <div className="flex items-center gap-2">
        <Link2 className="size-3.5 text-muted-foreground" aria-hidden />
        <h4 className="text-xs font-semibold tracking-wide uppercase">Evidence</h4>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {props.references.length}/{CROKI_CONTEXT_LIMITS.referencesPerNode}
        </span>
      </div>

      {props.references.length > 0 ? (
        <ul className="divide-y divide-border/60 border-y border-border/60">
          {props.references.map((reference) => (
            <li key={referenceLabel(reference)} className="flex min-h-10 items-center gap-1">
              {props.onOpenReference ? (
                <Button
                  className="min-w-0 flex-1 justify-start"
                  size="sm"
                  variant="ghost"
                  aria-label={`Open ${referenceLabel(reference)}`}
                  onClick={() => props.onOpenReference?.(reference)}
                >
                  <ReferenceIcon reference={reference} />
                  <span className="truncate">{referenceLabel(reference)}</span>
                </Button>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-2 px-2 text-xs">
                  <ReferenceIcon reference={reference} />
                  <span className="truncate">{referenceLabel(reference)}</span>
                </span>
              )}
              {editable ? (
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remove ${referenceLabel(reference)}`}
                  onClick={() => props.onRemove(reference)}
                >
                  <Trash2 className="size-3" aria-hidden />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-l border-border px-3 py-1 text-xs text-muted-foreground">
          No portable evidence attached.
        </p>
      )}

      {editable ? (
        <form
          className="grid grid-cols-[5rem_minmax(0,1fr)_auto] gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            add();
          }}
        >
          <select
            aria-label="Reference kind"
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as "file" | "url");
              setValue("");
              setLine("");
              setError(null);
            }}
          >
            <option value="file">File</option>
            <option value="url">URL</option>
          </select>
          <Input
            className="h-8 min-w-0 text-xs"
            aria-label={kind === "file" ? "Repository-relative path" : "HTTP(S) URL"}
            maxLength={
              kind === "file"
                ? CROKI_CONTEXT_LIMITS.referencePathChars
                : CROKI_CONTEXT_LIMITS.referenceUrlChars
            }
            placeholder={kind === "file" ? "src/file.ts" : "https://…"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button
            size="icon-sm"
            variant="outline"
            type="submit"
            aria-label="Add evidence reference"
            disabled={!value.trim()}
          >
            <Plus className="size-3.5" aria-hidden />
          </Button>
          {kind === "file" ? (
            <Input
              className="col-start-2 h-8 text-xs"
              aria-label="Optional line number"
              inputMode="numeric"
              min={1}
              placeholder="Line (optional)"
              type="number"
              value={line}
              onChange={(event) => setLine(event.target.value)}
            />
          ) : null}
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function ReferenceIcon(props: { readonly reference: CrokiContextReference }) {
  return props.reference.kind === "file" ? (
    <FileCode2 className="size-3.5 shrink-0" aria-hidden />
  ) : (
    <ExternalLink className="size-3.5 shrink-0" aria-hidden />
  );
}

function referenceLabel(reference: CrokiContextReference): string {
  return reference.kind === "file"
    ? `${reference.path}${reference.line ? `:${reference.line}` : ""}`
    : reference.url;
}

const REFERENCE_ERROR_MESSAGE: Readonly<Record<string, string>> = {
  "duplicate-reference": "That evidence reference is already attached.",
  "invalid-reference": "Enter a portable file path or an HTTP(S) URL.",
  "reference-limit": "This item has reached the evidence reference limit.",
};
