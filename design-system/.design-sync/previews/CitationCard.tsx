import { CitationCard } from "@gtm-ide/design-system";

const File = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
  </svg>
);

export function Default() {
  return (
    <div style={{ width: 320 }}>
      <CitationCard
        icon={<File />}
        path="brain/src/scan.mjs:42"
        code={"const win = findWinEvent(repo);\n// project_created — attribution source: none"}
      />
    </div>
  );
}

export function List() {
  return (
    <div style={{ display: "grid", gap: 8, width: 320 }}>
      <CitationCard
        icon={<File />}
        path="brain/src/program-store.mjs:88"
        code={"status: 'blind', // no measurement source"}
      />
      <CitationCard
        icon={<File />}
        path="ui/src/components/GraphCanvas.tsx:120"
        code={"<WorkflowNode category={node.kind} … />"}
      />
    </div>
  );
}
