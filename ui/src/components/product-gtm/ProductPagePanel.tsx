import { useState } from "react";
import { FileText } from "lucide-react";
import { replyInConversation } from "@/api";
import type { ProductGtmPageData } from "./productGtmProjection";

// The in-place expansion of a page on the Product / GTM canvas. Product territory is the product itself,
// mapped as its pages; clicking one shows an honest, cited read of what the page is now and takes a
// brain-dump of what should be different — which mints an exact Work Thread scoped to that page and
// follows it into Work (AGENTS.md §Boundaries; docs/FIRM-SPEC.md, 2026-07-22). There is no planning
// layer and no Drover persona between the founder and the SDK: the founder's words become the direction.

// The bounded repository citation behind a page read, rendered as the exact file and line range the
// summary was drawn from rather than an opaque digest.
function citation(sourceRef: string): string | null {
  const match = sourceRef.match(/^repository:(.+?)#L(\d+)-L(\d+):/);
  if (!match) return null;
  const [, file, from, to] = match;
  return from === to ? `${file}:${from}` : `${file}:${from}–${to}`;
}

export function ProductPagePanel({ ventureId, name, summary, pageRef, page, readOnly, onOpenWork }: {
  ventureId: string;
  name: string;
  summary: string;
  pageRef: string;
  page: ProductGtmPageData;
  readOnly: boolean;
  onOpenWork: (threadRef: string) => void;
}) {
  const [intent, setIntent] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cite = citation(page.sourceRef) ?? page.file;

  const start = async () => {
    const message = intent.trim();
    if (!message || pending || readOnly) return;
    setPending(true);
    setError(null);
    try {
      const result = await replyInConversation(ventureId, {
        message,
        subjectRefs: [pageRef],
        mode: "context",
        productGtmView: true,
      });
      if (result.act === "new-direction" && result.threadRef) {
        onOpenWork(result.threadRef);
        return;
      }
      setError("That direction did not open a Work Thread. Nothing was changed.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The direction could not start.");
    } finally {
      setPending(false);
    }
  };

  return <section className="product-page-panel" aria-label={`${name} page`}>
    <header className="product-page-panel-head">
      <span className="product-page-panel-symbol"><FileText aria-hidden="true" /></span>
      <div>
        <strong>{name}</strong>
        <small>{page.route}</small>
      </div>
    </header>

    <div className="product-page-panel-now">
      <p className="product-page-panel-eyebrow">What it is now</p>
      <p className="product-page-panel-summary">{summary}</p>
      <p className="product-page-panel-cite" title={page.sourceRef}>Read from {cite}</p>
    </div>

    {page.priorDirection.length ? <div className="product-page-panel-prior">
      <p className="product-page-panel-eyebrow">Your prior direction</p>
      <ul>{page.priorDirection.map((line, index) => <li key={index}>{line}</li>)}</ul>
    </div> : null}

    {page.attachments.length ? <div className="product-page-panel-attached">
      <p className="product-page-panel-eyebrow">What this page is about</p>
      <ul>{page.attachments.map((attachment, index) => <li key={index}>
        <b>{attachment.kind}</b>
        <span>{attachment.name || attachment.statement}</span>
      </li>)}</ul>
    </div> : null}

    <div className="product-page-panel-intent">
      <label htmlFor={`page-intent-${pageRef}`}>What should be different here?</label>
      <textarea
        id={`page-intent-${pageRef}`}
        value={intent}
        onChange={(event) => setIntent(event.target.value)}
        onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void start(); }}
        placeholder={`Describe the change to ${name}. Claude or Codex takes it from here.`}
        rows={3}
        disabled={pending || readOnly}
      />
      {error ? <p className="product-page-panel-error" role="status">{error}</p> : null}
      <button type="button" className="product-page-panel-start" onClick={() => void start()} disabled={pending || readOnly || !intent.trim()}>
        {pending ? "Starting…" : "Start work on this page"}
      </button>
    </div>
  </section>;
}
