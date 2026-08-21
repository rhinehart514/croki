import type {
  CrokiThoughtView,
  CrokiThoughtViewRegion,
  CrokiThoughtViewStatement,
} from "@croki/contracts";
import { ArrowDown, Link2 } from "lucide-react";
import { useMemo } from "react";

import { CrokiThoughtViewStatementItem } from "./CrokiThoughtViewStatement";

export function CrokiThoughtViewField(props: {
  readonly view: CrokiThoughtView;
  readonly selectedObjectIds: readonly string[];
  readonly onClearSelection: () => void;
  readonly onSelect: (statement: CrokiThoughtViewStatement) => void;
}) {
  const selectedIds = useMemo(() => new Set(props.selectedObjectIds), [props.selectedObjectIds]);
  const statements = useMemo(
    () => new Map(props.view.statements.map((statement) => [statement.id, statement])),
    [props.view.statements],
  );
  const regions = props.view.regions.map((region) => ({
    region,
    statements: region.statementIds.flatMap((id) => {
      const statement = statements.get(id);
      return statement ? [statement] : [];
    }),
  }));
  const laneLayout = ["comparison", "possibility", "temporal"].includes(props.view.representation);

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto bg-black"
      aria-label={`${representationLabel(props.view.representation)} View`}
      data-thought-view={props.view.representation}
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClearSelection();
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8 sm:py-9">
        <div className="mb-7 max-w-4xl">
          <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-zinc-600">
            {representationLabel(props.view.representation)} view
          </p>
          <h2 className="mt-2 text-balance text-[clamp(18px,2.5vw,30px)] leading-[1.18] font-medium tracking-[-0.02em] text-white">
            {props.view.basis.question}
          </h2>
        </div>

        <div
          className={
            laneLayout
              ? "grid gap-px bg-white/10 md:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]"
              : "grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.75fr)]"
          }
        >
          {laneLayout ? (
            regions.map(({ region, statements: regionStatements }) => (
              <Region
                key={region.id}
                region={region}
                statements={regionStatements}
                selectedIds={selectedIds}
                onSelect={props.onSelect}
              />
            ))
          ) : (
            <>
              <div className="space-y-6">
                {regions
                  .filter(({ region }) => region.kind !== "evidence")
                  .map(({ region, statements: regionStatements }) => (
                    <Region
                      key={region.id}
                      region={region}
                      statements={regionStatements}
                      selectedIds={selectedIds}
                      onSelect={props.onSelect}
                    />
                  ))}
                {props.view.relationships.length > 0 ? (
                  <RelationshipTrace view={props.view} statements={statements} />
                ) : null}
              </div>
              <div className="border-l border-white/10 pl-0 lg:pl-6">
                {regions
                  .filter(({ region }) => region.kind === "evidence")
                  .map(({ region, statements: regionStatements }) => (
                    <Region
                      key={region.id}
                      region={region}
                      statements={regionStatements}
                      selectedIds={selectedIds}
                      onSelect={props.onSelect}
                      compact
                    />
                  ))}
              </div>
            </>
          )}
        </div>

        <footer className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-4 text-[9px] uppercase tracking-[0.12em] text-zinc-700">
          <span>{props.view.basis.coverage}</span>
          <span>{props.view.relationships.length} visible relationships</span>
          <span>Source revision {props.view.sourceRevision}</span>
        </footer>
      </div>
    </div>
  );
}

function Region(props: {
  readonly region: CrokiThoughtViewRegion;
  readonly statements: readonly CrokiThoughtViewStatement[];
  readonly selectedIds: ReadonlySet<string>;
  readonly onSelect: (statement: CrokiThoughtViewStatement) => void;
  readonly compact?: boolean;
}) {
  if (props.statements.length === 0) return null;
  return (
    <section className={props.compact ? "bg-black" : "bg-black p-0 md:p-5"}>
      <div className="mb-3 flex items-center gap-2">
        {props.region.kind === "sequence" ? (
          <ArrowDown className="size-3 text-zinc-600" aria-hidden />
        ) : null}
        <h3 className="text-[10px] font-medium uppercase tracking-[0.13em] text-zinc-500">
          {props.region.title}
        </h3>
        <span className="ml-auto text-[9px] text-zinc-700">{props.statements.length}</span>
      </div>
      <div className="space-y-px">
        {props.statements.map((statement) => (
          <CrokiThoughtViewStatementItem
            key={statement.id}
            statement={statement}
            selected={props.selectedIds.has(statement.objectId)}
            onSelect={props.onSelect}
          />
        ))}
      </div>
    </section>
  );
}

function RelationshipTrace(props: {
  readonly view: CrokiThoughtView;
  readonly statements: ReadonlyMap<string, CrokiThoughtViewStatement>;
}) {
  return (
    <section className="border-t border-white/10 pt-4" aria-label="Visible relationships">
      <div className="mb-3 flex items-center gap-2">
        <Link2 className="size-3 text-zinc-600" aria-hidden />
        <h3 className="text-[10px] font-medium uppercase tracking-[0.13em] text-zinc-500">
          Relationship trace
        </h3>
      </div>
      <ol className="divide-y divide-white/10 border-y border-white/10">
        {props.view.relationships.slice(0, 8).map((relationship) => (
          <li
            key={relationship.id}
            className="grid gap-1 py-3 text-[11px] text-zinc-400 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-3"
          >
            <span>{props.statements.get(relationship.from)?.title ?? relationship.from}</span>
            <span className="text-[9px] uppercase tracking-[0.1em] text-zinc-600">
              {relationship.label}
            </span>
            <span className="sm:text-right">
              {props.statements.get(relationship.to)?.title ?? relationship.to}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function representationLabel(representation: CrokiThoughtView["representation"]): string {
  return representation === "possibility"
    ? "Possible worlds"
    : representation.charAt(0).toUpperCase() + representation.slice(1);
}
