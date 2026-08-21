import type { CrokiThoughtView, CrokiThoughtViewStatement } from "@croki/contracts";
import { ArrowDownToLine, FileSearch, GitCompareArrows, Info, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { CrokiThoughtViewStatementItem } from "./CrokiThoughtViewStatement";

export interface CrokiInlineThoughtViewProps {
  readonly view: CrokiThoughtView;
  readonly basisOpen: boolean;
  readonly selectedObjectIds: readonly string[];
  readonly updateAvailable: boolean;
  readonly onToggleBasis: () => void;
  readonly onReframe: () => void;
  readonly onUpdate: () => void;
  readonly onUse: (statement: CrokiThoughtViewStatement) => void;
  readonly onOpenSource?: (uri: string) => void;
}

/** A turn-native visualization. It is part of the conversation, not a workspace destination. */
export function CrokiInlineThoughtView(props: CrokiInlineThoughtViewProps) {
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const statementById = useMemo(
    () => new Map(props.view.statements.map((statement) => [statement.id, statement])),
    [props.view.statements],
  );
  const selectedObjects = useMemo(
    () => new Set(props.selectedObjectIds),
    [props.selectedObjectIds],
  );
  const candidate = props.view.statements.find((statement) => statement.id === candidateId) ?? null;
  const source = candidate
    ? props.view.sources.find((item) => candidate.sourceIds.includes(item.id))
    : null;

  useEffect(() => setCandidateId(null), [props.view.id]);

  return (
    <section
      className="my-2 overflow-hidden border-y border-white/10 bg-black text-white sm:border"
      aria-label={`${viewLabel(props.view)} thought View`}
      data-inline-thought-view={props.view.representation}
    >
      <header className="flex min-h-11 items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-zinc-500">
            View · {viewLabel(props.view)}
          </p>
          <p className="mt-0.5 truncate text-[10px] text-zinc-700">
            {props.view.basis.coverage} · r{props.view.sourceRevision}
          </p>
        </div>
        {props.updateAvailable ? (
          <ViewAction label="Update" onClick={props.onUpdate} icon={<RefreshCw aria-hidden />} />
        ) : null}
        <ViewAction
          label="Reframe"
          onClick={props.onReframe}
          icon={<GitCompareArrows aria-hidden />}
        />
        <ViewAction
          label="Basis"
          active={props.basisOpen}
          onClick={props.onToggleBasis}
          icon={<Info aria-hidden />}
        />
      </header>

      <div className="px-4 py-5 sm:px-5">
        <h2 className="max-w-2xl text-balance text-[17px] leading-6 font-medium tracking-[-0.015em] text-zinc-100">
          {props.view.basis.question}
        </h2>

        {props.basisOpen ? <InlineBasis view={props.view} /> : null}

        <div className="mt-5 grid gap-px bg-white/10 md:grid-cols-2">
          {props.view.regions.map((region) => {
            const statements = region.statementIds.flatMap((id) => {
              const statement = statementById.get(id);
              return statement ? [statement] : [];
            });
            if (statements.length === 0) return null;
            return (
              <section key={region.id} className="bg-black p-3 sm:p-4">
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                    {region.title}
                  </h3>
                  <span className="ml-auto text-[9px] text-zinc-700">{statements.length}</span>
                </div>
                <div className="space-y-px">
                  {statements.slice(0, 6).map((statement) => (
                    <CrokiThoughtViewStatementItem
                      key={statement.id}
                      statement={statement}
                      selected={
                        candidateId === statement.id || selectedObjects.has(statement.objectId)
                      }
                      onSelect={(next) =>
                        setCandidateId((current) => (current === next.id ? null : next.id))
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {candidate ? (
        <footer className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-zinc-950 px-4 py-3 text-[10px]">
          <span className="min-w-0 flex-1 truncate text-zinc-400">{candidate.title}</span>
          {source?.uri && props.onOpenSource ? (
            <button
              type="button"
              className="flex items-center gap-1.5 text-zinc-500 hover:text-white"
              onClick={() => props.onOpenSource?.(source.uri!)}
            >
              <FileSearch className="size-3" aria-hidden />
              Open source
            </button>
          ) : null}
          <button
            type="button"
            className="flex items-center gap-1.5 bg-white px-3 py-1.5 font-medium text-black hover:bg-zinc-200"
            onClick={() => props.onUse(candidate)}
          >
            <ArrowDownToLine className="size-3" aria-hidden />
            Use in next message
          </button>
        </footer>
      ) : (
        <footer className="border-t border-white/10 px-4 py-2.5 text-[9px] uppercase tracking-[0.12em] text-zinc-700">
          Select a statement to inspect or use it
        </footer>
      )}
    </section>
  );
}

function InlineBasis(props: { readonly view: CrokiThoughtView }) {
  return (
    <div className="mt-4 grid gap-3 border-y border-white/10 py-3 text-[10px] leading-4 text-zinc-500 sm:grid-cols-2">
      <p>
        <span className="text-zinc-300">Foregrounds</span>{" "}
        {props.view.basis.foregrounds.join(" · ")}
      </p>
      <p>
        <span className="text-zinc-300">Omits</span> {props.view.basis.omits.join(" · ")}
      </p>
    </div>
  );
}

function ViewAction(props: {
  readonly label: string;
  readonly icon: React.ReactElement;
  readonly onClick: () => void;
  readonly active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`flex shrink-0 items-center gap-1.5 text-[10px] hover:text-white ${
        props.active ? "text-white" : "text-zinc-500"
      }`}
      onClick={props.onClick}
    >
      <span className="size-3 [&>svg]:size-3">{props.icon}</span>
      <span className="hidden sm:inline">{props.label}</span>
    </button>
  );
}

function viewLabel(view: CrokiThoughtView): string {
  return view.representation === "possibility"
    ? "Possible worlds"
    : view.representation.charAt(0).toUpperCase() + view.representation.slice(1);
}
